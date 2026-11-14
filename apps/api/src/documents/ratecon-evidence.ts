import { Prisma } from '../generated/prisma/client';
import type { RateConDraftResponse } from '../../../../packages/api-contracts/ratecon';
import type { FieldEvidence } from '../../../../packages/api-contracts/document-intelligence';
import type { SourcePage } from './ratecon-processor';

// Scores are intentionally absent: heuristic/OCR output is unverified, not calibrated accuracy.
export function withEvidence(draft: RateConDraftResponse, pages: SourcePage[]) {
  const fields: Record<string, FieldEvidence> = {};
  const all = pages.map((p) => p.text).join('\n');
  const values: Record<string, string | number | null> = {
    loadNumber:
      draft.loadNumber === 'REVIEW_REQUIRED' ? null : draft.loadNumber,
    brokerName:
      draft.brokerName === 'Broker Review Required' ? null : draft.brokerName,
    brokerContact: draft.brokerContact,
    equipment: draft.equipment,
    linehaul: draft.linehaul,
    fuelSurcharge: draft.fuelSurcharge,
    totalRate: draft.totalRate === '0.00' ? null : draft.totalRate,
  };
  for (const side of ['pickup', 'delivery'] as const)
    for (const key of [
      'facilityName',
      'address',
      'appointment',
      'date',
      'referenceNumber',
    ] as const)
      values[`${side}.${key}`] = draft[side][key] || null;
  const currencies = [
    ...new Set(all.match(/\b(?:USD|CAD|EUR|GBP|MXN)\b/g) ?? []),
  ];
  values.currency = currencies.length === 1 ? currencies[0] : null;
  const termPattern =
    /(?:payment\s+terms\s*:?\s*(?:net\s*)?|\bnet\s+)(\d+)\s*(?:days)?|due\s+(?:on|upon)\s+receipt/gi;
  const terms = [...all.matchAll(termPattern)].map((m) =>
    m[1] === undefined ? 0 : Number(m[1]),
  );
  values.paymentTermsDays =
    new Set(terms).size === 1 && terms[0] <= 365 ? terms[0] : null;
  for (const [name, value] of Object.entries(values)) {
    const needle =
      value === null ? '' : String(value).replace(/[,\s]/g, '').toLowerCase();
    const sources = pages
      .flatMap((p) =>
        p.text
          .split('\n')
          .filter(
            (line) =>
              needle &&
              line.replace(/[,\s]/g, '').toLowerCase().includes(needle),
          )
          .slice(0, 3)
          .map((text) => ({
            page: p.page,
            text: text.slice(0, 500),
            method: p.method,
          })),
      )
      .slice(0, 6);
    fields[name] = {
      value,
      uncertainty:
        value === null ? 'MISSING' : sources.length ? 'UNVERIFIED' : 'DERIVED',
      sources,
      warnings: [],
      humanState: 'UNREVIEWED',
    };
    if (value !== null && !sources.length)
      fields[name].warnings.push(
        'Combined or derived by the parser. Compare with the original document.',
      );
  }
  // Examine every labeled monetary candidate; never silently choose the first conflicting amount.
  for (const [field, labels] of Object.entries({
    totalRate: 'Total Rate|Total Pay|Total Amount|Rate Total|Total',
    linehaul: 'Linehaul|Line Haul|Line-Haul',
    fuelSurcharge: 'Fuel Surcharge|FSC|Fuel',
  })) {
    const pattern = new RegExp(
      `^(?:${labels})\\s*:?\\s*(?:(?:USD|CAD|EUR|GBP|MXN)\\s*)?\\$?\\s*([^\\s]+)`,
      'gim',
    );
    const matches = [...all.matchAll(pattern)];
    const amounts = matches.map((m) => m[1].replaceAll(',', ''));
    const invalid =
      matches.some(
        (m) => !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(m[1]),
      ) || amounts.some((a) => !/^\d{1,10}(?:\.\d{1,2})?$/.test(a));
    const distinct = new Set(
      amounts
        .filter((a) => /^\d{1,10}(?:\.\d{1,2})?$/.test(a))
        .map((a) => new Prisma.Decimal(a).toFixed(2)),
    );
    if (invalid || distinct.size > 1) {
      fields[field].value = null;
      fields[field].uncertainty = 'CONFLICT';
      fields[field].warnings.push(
        'Conflicting or invalid precision in source amounts. Enter the verified amount.',
      );
    } else if (distinct.size === 1) {
      fields[field].value = [...distinct][0];
      fields[field].uncertainty = 'UNVERIFIED';
      fields[field].warnings = [];
    }
    if (matches.length)
      fields[field].sources = pages
        .flatMap((p) =>
          [...p.text.matchAll(pattern)].map((m) => ({
            page: p.page,
            text: m[0].slice(0, 500),
            method: p.method,
          })),
        )
        .slice(0, 6);
  }
  if (currencies.length > 1) {
    fields.currency.uncertainty = 'CONFLICT';
    fields.currency.warnings.push(
      'Multiple currencies appear in this document.',
    );
  }
  fields.paymentTermsDays.sources = pages
    .flatMap((p) =>
      [...p.text.matchAll(termPattern)].map((m) => ({
        page: p.page,
        text: m[0].slice(0, 500),
        method: p.method,
      })),
    )
    .slice(0, 6);
  if (fields.paymentTermsDays.value !== null) {
    fields.paymentTermsDays.uncertainty = 'UNVERIFIED';
    fields.paymentTermsDays.warnings = [];
  }
  if (fields.totalRate.uncertainty === 'DERIVED') {
    fields.totalRate.sources = [
      ...fields.linehaul.sources,
      ...fields.fuelSurcharge.sources,
    ].slice(0, 6);
  }
  for (const [field, label] of Object.entries({
    loadNumber: 'Load Number|Load #',
    brokerName: 'Broker|Broker Name',
    equipment: 'Equipment',
    brokerContact: 'Broker Contact',
  })) {
    const pattern = new RegExp(`^(?:${label})\\s*:\\s*(.+)$`, 'gim');
    const matches = pages.flatMap((p) =>
      [...p.text.matchAll(pattern)].map((m) => ({
        page: p.page,
        text: m[0].slice(0, 500),
        method: p.method,
        value: m[1].trim().toLowerCase(),
      })),
    );
    if (new Set(matches.map((m) => m.value)).size > 1) {
      fields[field].value = null;
      fields[field].uncertainty = 'CONFLICT';
      fields[field].sources = matches
        .slice(0, 6)
        .map(({ page, text, method }) => ({ page, text, method }));
      fields[field].warnings.push(
        'Conflicting labeled values. Enter the verified value from the original.',
      );
    }
  }
  if (new Set(terms).size > 1 || terms.some((t) => t > 365)) {
    fields.paymentTermsDays.uncertainty = 'CONFLICT';
    fields.paymentTermsDays.warnings.push(
      'Payment terms conflict or exceed 0–365 days.',
    );
  }
  const total = fields.totalRate.value,
    line = fields.linehaul.value,
    fuel = fields.fuelSurcharge.value;
  if (
    total !== null &&
    line !== null &&
    fuel !== null &&
    !new Prisma.Decimal(total).eq(new Prisma.Decimal(line).plus(fuel))
  )
    fields.totalRate.warnings.push(
      'Total does not equal linehaul plus fuel. Resolve before confirmation.',
    );
  for (const req of draft.requirements) {
    const source = pages
      .flatMap((p) =>
        p.text
          .split('\n')
          .filter((l) =>
            new RegExp(
              req.type === 'CARRIER_INVOICE'
                ? 'invoice'
                : req.type === 'BOL'
                  ? '\\bBOL\\b|bill of lading'
                  : req.type === 'POD'
                    ? '\\bPOD\\b|proof of delivery'
                    : req.type === 'LUMPER_RECEIPT'
                      ? 'lumper'
                      : 'scale',
              'i',
            ).test(l),
          )
          .map((text) => ({
            page: p.page,
            text: text.slice(0, 500),
            method: p.method,
          })),
      )
      .slice(0, 6);
    fields[`requirements.${req.type}`] = {
      value: source.length ? req.requirement : null,
      uncertainty: source.length ? 'UNVERIFIED' : 'MISSING',
      sources: source,
      warnings: source.length
        ? []
        : [
            'Suggested operational default, not found in the source. Confirm or remove.',
          ],
      humanState: 'UNREVIEWED',
    };
  }
  const clean = {
    ...draft,
    loadNumber: String(fields.loadNumber.value ?? ''),
    brokerName: String(fields.brokerName.value ?? ''),
    brokerContact:
      fields.brokerContact.value === null
        ? null
        : String(fields.brokerContact.value),
    equipment:
      fields.equipment.value === null ? null : String(fields.equipment.value),
    currency: String(fields.currency.value ?? ''),
    totalRate: String(fields.totalRate.value ?? ''),
    linehaul:
      fields.linehaul.value === null ? null : String(fields.linehaul.value),
    fuelSurcharge:
      fields.fuelSurcharge.value === null
        ? null
        : String(fields.fuelSurcharge.value),
    reviewRequired: true,
  };
  delete clean.draft;
  clean.warnings = [
    ...new Set([
      ...draft.warnings,
      ...Object.entries(fields).flatMap(([name, f]) =>
        f.warnings.map((w) => `${name}: ${w}`),
      ),
      'All suggestions require human verification. OCR and parser uncertainty is not an accuracy probability.',
    ]),
  ];
  return {
    draft: clean,
    fields,
    classification: /rate\s*con(?:firmation)?|load\s*(?:number|#)/i.test(all)
      ? ('RATE_CONFIRMATION_CANDIDATE' as const)
      : ('UNKNOWN' as const),
  };
}

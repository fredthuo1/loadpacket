import type { AuthenticatedUser } from '../auth/auth.types';
import { Injectable } from '@nestjs/common';

import { RateConTextExtractorService } from './ratecon-text-extractor.service';

import type {
  DraftRequirementType,
  DraftRequirement,
  DraftStop,
  RateConDraft,
  RateConDraftResponse,
} from '../../../../packages/api-contracts/ratecon';

type ExtractorResult = {
  documentId?: string;

  pageCount?: number;

  characterCount?: number;

  text?: string;

  fullText?: string;

  extractedText?: string;

  textPreview?: string;
};

@Injectable()
export class RateConDraftService {
  constructor(private readonly textExtractor: RateConTextExtractorService) {}

  /*
   * Primary method.
   *
   * Compatibility aliases are provided below
   * so this replacement remains safe if the
   * controller uses an older method name.
   */
  async createDraft(
    currentUser: AuthenticatedUser,
    documentId: string,
  ): Promise<RateConDraftResponse> {
    const extraction = (await this.textExtractor.extractPdfText(
      currentUser,
      documentId,
    )) as ExtractorResult;

    return this.parseExtraction(extraction, documentId);
  }

  parseExtraction(
    extraction: ExtractorResult,
    documentId: string,
  ): RateConDraftResponse {
    const text = this.resolveExtractedText(extraction);

    const loadNumber = this.extractLoadNumber(text);

    const brokerName = this.extractBrokerName(text);

    const brokerContact = this.extractBrokerContact(text);

    const equipment = this.extractEquipment(text);

    const linehaul = this.extractMoneyField(text, [
      'Linehaul',
      'Line Haul',
      'Line-Haul',
    ]);

    const fuelSurcharge = this.extractMoneyField(text, [
      'Fuel Surcharge',
      'Fuel',
      'FSC',
    ]);

    let totalRate = this.extractMoneyField(text, [
      'Total Rate',
      'Total',
      'Rate Total',
      'Total Amount',
      'Total Pay',
    ]);

    /*
     * Deterministically calculate the total
     * only when the document omitted it but
     * both components were found.
     *
     * Integer cents avoid JS floating-point
     * money arithmetic.
     */
    if (!totalRate && linehaul && fuelSurcharge) {
      totalRate = this.addMoney(linehaul, fuelSurcharge);
    }

    const pickupSection = this.extractSection(
      text,
      ['Pickup', 'Pick Up', 'Origin'],
      [
        'Delivery',
        'Deliver',
        'Destination',
        'Required Documents',
        'Requirements',
      ],
    );

    const deliverySection = this.extractSection(
      text,
      ['Delivery', 'Deliver', 'Destination'],
      ['Required Documents', 'Requirements', 'Terms', 'Instructions'],
    );

    const pickup = this.extractStop(pickupSection, 'PICKUP');

    const delivery = this.extractStop(deliverySection, 'DELIVERY');

    const requirements = this.extractRequirements(text);

    const warnings: string[] = [];

    if (!loadNumber || loadNumber === 'REVIEW_REQUIRED') {
      warnings.push('Load number needs review.');
    }

    if (brokerName === 'Broker Review Required') {
      warnings.push('Broker name needs review.');
    }

    if (!totalRate) {
      warnings.push('Total rate needs review.');
    }

    if (!pickup.address) {
      warnings.push('Pickup address needs review.');
    }

    if (!delivery.address) {
      warnings.push('Delivery address needs review.');
    }

    const draft: RateConDraft = {
      documentId: extraction.documentId ?? documentId,

      loadNumber: loadNumber || 'REVIEW_REQUIRED',

      brokerName,

      brokerContact,

      equipment,

      currency: 'USD',

      linehaul,

      fuelSurcharge,

      totalRate: totalRate ?? '0.00',

      pickup,

      delivery,

      requirements,
    };

    /*
     * Return both:
     *
     * 1. top-level fields for the existing
     *    Smart Intake contract
     *
     * 2. `draft` for newer callers.
     *
     * Extra response fields are non-breaking.
     */
    return {
      ...draft,

      draft,

      extraction: {
        pageCount: extraction.pageCount ?? null,

        characterCount: extraction.characterCount ?? text.length,
      },

      reviewRequired: warnings.length > 0,

      warnings,
    };
  }

  /*
   * Compatibility aliases.
   *
   * They all use exactly the same parser.
   * Keeping them here prevents this complete
   * replacement from breaking a controller
   * that may still use an older service name.
   */
  async buildDraft(currentUser: AuthenticatedUser, documentId: string) {
    return this.createDraft(currentUser, documentId);
  }

  async generateDraft(currentUser: AuthenticatedUser, documentId: string) {
    return this.createDraft(currentUser, documentId);
  }

  async createRateConDraft(currentUser: AuthenticatedUser, documentId: string) {
    return this.createDraft(currentUser, documentId);
  }

  async buildRateConDraft(currentUser: AuthenticatedUser, documentId: string) {
    return this.createDraft(currentUser, documentId);
  }

  async generateRateConDraft(
    currentUser: AuthenticatedUser,
    documentId: string,
  ) {
    return this.createDraft(currentUser, documentId);
  }

  async generate(currentUser: AuthenticatedUser, documentId: string) {
    return this.createDraft(currentUser, documentId);
  }

  private resolveExtractedText(result: ExtractorResult) {
    const text =
      result.text ??
      result.fullText ??
      result.extractedText ??
      result.textPreview ??
      '';

    return text.replace(/\r/g, '').trim();
  }

  /*
   * -------------------------------------------------------
   * Load / Broker
   * -------------------------------------------------------
   */

  private extractLoadNumber(text: string) {
    const labels = [
      'Load Number',
      'Load #',
      'Load No',
      'Load ID',
      'Rate Confirmation Number',
      'Rate Con Number',
      'Confirmation Number',
    ];

    const value = this.extractLabeledValue(text, labels);

    if (value && !this.isNoiseLine(value)) {
      return this.cleanIdentifier(value);
    }

    const fallbackPatterns = [
      /\bLoad\s*(?:#|No\.?|Number|ID)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,})/i,

      /\b(?:Rate\s*Con|Rate\s*Confirmation)\s*(?:#|No\.?|Number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,})/i,
    ];

    for (const pattern of fallbackPatterns) {
      const match = text.match(pattern);

      if (match?.[1]) {
        return this.cleanIdentifier(match[1]);
      }
    }

    return 'REVIEW_REQUIRED';
  }

  private extractBrokerName(text: string) {
    const lines = this.getMeaningfulLines(text);

    /*
     * Highest confidence format:
     *
     * Broker
     * Gateway Plains Freight Brokerage LLC
     */
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      if (/^(broker|broker name|broker company|brokerage)$/i.test(line)) {
        const candidate = this.findNextDataLine(lines, index + 1);

        if (candidate && this.isValidBrokerName(candidate)) {
          return candidate;
        }
      }
    }

    /*
     * Same-line formats:
     *
     * Broker: ABC Logistics LLC
     * Broker ABC Logistics LLC
     */
    const inlinePatterns = [
      /(?:^|\n)\s*Broker\s*:\s*([^\n]+)/i,

      /(?:^|\n)\s*Broker Name\s*:\s*([^\n]+)/i,

      /(?:^|\n)\s*Broker Company\s*:\s*([^\n]+)/i,

      /(?:^|\n)\s*Brokerage\s*:\s*([^\n]+)/i,

      /(?:^|\n)\s*Broker\s+((?!Contact\b)[^\n]+)/i,
    ];

    for (const pattern of inlinePatterns) {
      const match = text.match(pattern);

      const candidate = match?.[1]?.trim();

      if (candidate && this.isValidBrokerName(candidate)) {
        return candidate;
      }
    }

    /*
     * Conservative fallback.
     *
     * Require company-like wording so a
     * title, QA banner, driver or facility
     * is not silently promoted to Broker.
     */
    const companyCandidate = lines.find(
      (line) =>
        this.isValidBrokerName(line) &&
        /\b(LLC|L\.L\.C\.|INC\.?|CORP\.?|CORPORATION|BROKERAGE|FREIGHT|LOGISTICS|TRANSPORTATION)\b/i.test(
          line,
        ),
    );

    return companyCandidate ?? 'Broker Review Required';
  }

  private extractBrokerContact(text: string) {
    const lines = this.getMeaningfulLines(text);

    /*
     * Only treat text as the broker contact
     * when it is explicitly labeled.
     *
     * Do not scan arbitrary phone numbers.
     * That is what caused the regression.
     */
    const contactLabels = [
      /^broker contact$/i,
      /^contact$/i,
      /^contact name$/i,
      /^representative$/i,
    ];

    for (let index = 0; index < lines.length; index += 1) {
      if (!contactLabels.some((pattern) => pattern.test(lines[index]))) {
        continue;
      }

      const candidate = this.findNextDataLine(lines, index + 1);

      if (
        candidate &&
        !this.isNoiseLine(candidate) &&
        !this.isFieldLabel(candidate)
      ) {
        return candidate;
      }
    }

    const patterns = [
      /(?:^|\n)\s*Broker Contact\s*:\s*([^\n]+)/i,

      /(?:^|\n)\s*Contact Name\s*:\s*([^\n]+)/i,

      /(?:^|\n)\s*Contact\s*:\s*([^\n]+)/i,

      /*
       * Also supports:
       * Contact Melissa Grant
       */
      /(?:^|\n)\s*Contact\s+([A-Za-z][A-Za-z .'-]{2,80})(?:\n|$)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);

      const candidate = match?.[1]?.trim();

      if (
        candidate &&
        !this.isNoiseLine(candidate) &&
        !this.isFieldLabel(candidate)
      ) {
        return candidate;
      }
    }

    return null;
  }

  /*
   * -------------------------------------------------------
   * Equipment / Rate
   * -------------------------------------------------------
   */

  private extractEquipment(text: string) {
    const value = this.extractLabeledValue(text, [
      'Equipment',
      'Equipment Type',
      'Trailer',
      'Trailer Type',
    ]);

    if (!value || this.isNoiseLine(value)) {
      return null;
    }

    return value.split(/\s+(?:Commodity|Weight|Pieces)\b\s*:?/i)[0].trim();
  }

  private extractMoneyField(text: string, labels: string[]) {
    const value = this.extractLabeledValue(text, labels);

    if (value) {
      const money = this.normalizeMoney(value);

      if (money) {
        return money;
      }
    }

    for (const label of labels) {
      const escaped = this.escapeRegExp(label);

      const pattern = new RegExp(
        `${escaped}\\s*[:\\-]?\\s*\\$?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)`,
        'i',
      );

      const match = text.match(pattern);

      if (match?.[1]) {
        const money = this.normalizeMoney(match[1]);

        if (money) {
          return money;
        }
      }
    }

    return null;
  }

  /*
   * -------------------------------------------------------
   * Stops
   * -------------------------------------------------------
   */

  private extractSection(
    text: string,
    startLabels: string[],
    endLabels: string[],
  ) {
    const lines = this.getMeaningfulLines(text);

    // A two-column PDF may emit both headings together, then each complete
    // address block in sequence. Anchor each block to its own labeled reference.
    const combined = lines.findIndex((line) =>
      /^(?:pickup|pick up|origin)(?:\s*[-–—:]?\s*STOP\s+\d+)?\s+(?:delivery|destination)(?:\s*[-–—:]?\s*STOP\s+\d+)?\s*:?$/i.test(
        line,
      ),
    );
    if (combined >= 0) {
      const pickup = startLabels[0] === 'Pickup';
      const reference = pickup
        ? /^(?:pickup|pick up)\s+(?:number\b|#|reference\b)/i
        : /^delivery\s+(?:number\b|#|reference\b)/i;
      const end = lines.findIndex(
        (line, index) => index > combined && reference.test(line),
      );
      if (end >= 0) {
        for (let index = end - 1; index > combined; index--) {
          if (
            /^(?:pickup|pick up|delivery)\s+(?:number\b|#|reference\b)/i.test(
              lines[index],
            )
          )
            break;
          if (this.isStreetAndCity(lines, index)) {
            const previous = lines[index - 1];
            const begin =
              index - 1 > combined &&
              !this.isFieldLabel(previous) &&
              !this.isNoiseLine(previous) &&
              !previous.includes(':')
                ? index - 1
                : index;
            return lines.slice(begin, end + 1).join('\n');
          }
        }
      }
      // Ambiguous layout: require review, never borrow the other stop's fields.
      return '';
    }

    const startIndex = lines.findIndex((line) =>
      startLabels.some((label) => this.sectionHeading(line, label)),
    );

    if (startIndex < 0) {
      return '';
    }

    let endIndex = lines.length;

    for (let index = startIndex + 1; index < lines.length; index += 1) {
      if (endLabels.some((label) => this.sectionHeading(lines[index], label))) {
        endIndex = index;

        break;
      }
    }

    return lines.slice(startIndex + 1, endIndex).join('\n');
  }

  private sectionHeading(line: string, label: string) {
    return new RegExp(
      `^${this.escapeRegExp(label)}(?:\\s*[-–—:]?\\s*STOP\\s+\\d+)?\\s*:?$`,
      'i',
    ).test(line);
  }

  private isStreetAndCity(lines: string[], index: number) {
    return (
      /^\d{1,6}\s+\S/.test(lines[index]) &&
      /^[A-Za-z][A-Za-z .'-]*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(
        lines[index + 1] ?? '',
      )
    );
  }

  private extractStop(
    sectionText: string,
    stopType: 'PICKUP' | 'DELIVERY',
  ): DraftStop {
    let facilityName = this.extractLabeledValue(sectionText, [
      'Facility Name',
      stopType === 'PICKUP' ? 'Pickup Facility' : 'Delivery Facility',
      'Facility',
    ]);

    const lines = this.getMeaningfulLines(sectionText);
    const street = lines.findIndex((_line, index) =>
      this.isStreetAndCity(lines, index),
    );
    if (
      !facilityName &&
      street > 0 &&
      !this.isFieldLabel(lines[street - 1]) &&
      !lines[street - 1].includes(':')
    )
      facilityName = lines[street - 1];

    let address =
      this.extractLabeledValue(sectionText, [
        'Address',
        stopType === 'PICKUP' ? 'Pickup Address' : 'Delivery Address',
      ]) ?? '';

    if (address && street >= 0 && address === lines[street]) {
      address = `${address}, ${lines[street + 1]}`;
    } else if (!address) {
      address = this.extractAddress(sectionText) ?? '';
    }

    const appointment = this.extractLabeledValue(sectionText, [
      'Appointment Time',
      'Appointment',
      'Appt',
      stopType === 'PICKUP' ? 'Pickup Appointment' : 'Delivery Appointment',
    ]);

    const referenceNumber = this.extractLabeledValue(
      sectionText,
      stopType === 'PICKUP'
        ? [
            'Pickup Number',
            'Pickup #',
            'Pickup Reference',
            'Reference',
            'Reference Number',
          ]
        : [
            'Delivery Number',
            'Delivery #',
            'Delivery Reference',
            'Reference',
            'Reference Number',
          ],
    );

    return {
      facilityName:
        facilityName && !this.isNoiseLine(facilityName) ? facilityName : null,

      address,

      appointment:
        appointment && !this.isNoiseLine(appointment) ? appointment : null,

      referenceNumber:
        referenceNumber && !this.isNoiseLine(referenceNumber)
          ? referenceNumber
          : null,
      date: this.extractLabeledValue(sectionText, [
        stopType === 'PICKUP' ? 'Pickup Date' : 'Delivery Date',
        'Date',
      ]),
    };
  }

  private extractAddress(text: string) {
    const lines = this.getMeaningfulLines(text);

    const street = lines.findIndex((_line, index) =>
      this.isStreetAndCity(lines, index),
    );
    if (street >= 0) return `${lines[street]}, ${lines[street + 1]}`;

    /*
     * Typical U.S. address:
     * 1700 Chouteau Ave, St. Louis, MO 63103
     */
    return (
      lines.find((line) =>
        /^\d{1,6}\s+.+,\s*.+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(line),
      ) ?? null
    );
  }

  /*
   * -------------------------------------------------------
   * Requirements
   * -------------------------------------------------------
   */

  private extractRequirements(text: string): DraftRequirement[] {
    const requirements: DraftRequirement[] = [];

    const addRequirement = (
      type: DraftRequirementType,
      requirement: 'REQUIRED' | 'CONDITIONAL',
      confidence: number,
    ) => {
      if (requirements.some((item) => item.type === type)) {
        return;
      }

      requirements.push({
        type,

        documentType: type,

        requirement,

        confidence,
      });
    };

    /*
     * Driver-facing required paperwork.
     */
    if (/\b(?:Signed\s+)?(?:BOL|Bill of Lading)\b/i.test(text)) {
      addRequirement('BOL', 'REQUIRED', 0.98);
    }

    if (/\b(?:Signed\s+)?(?:POD|Proof of Delivery)\b/i.test(text)) {
      addRequirement('POD', 'REQUIRED', 0.98);
    }

    if (
      /\bCarrier Invoice\b|\bInvoice referencing\b|\bCarrier's Invoice\b/i.test(
        text,
      )
    ) {
      addRequirement('CARRIER_INVOICE', 'REQUIRED', 0.98);
    }

    /*
     * Defensive MVP defaults.
     *
     * A trucking load should not silently
     * lose its core billing paperwork just
     * because the wording differs slightly.
     */
    if (!requirements.some((item) => item.type === 'BOL')) {
      addRequirement('BOL', 'REQUIRED', 0.7);
    }

    if (!requirements.some((item) => item.type === 'POD')) {
      addRequirement('POD', 'REQUIRED', 0.7);
    }

    if (!requirements.some((item) => item.type === 'CARRIER_INVOICE')) {
      addRequirement('CARRIER_INVOICE', 'REQUIRED', 0.7);
    }

    /*
     * These are conditional and should
     * never block load completion when
     * they are not used.
     */
    if (/Lumper Receipt|Lumper Service|Lumper Fee|Lumper/i.test(text)) {
      addRequirement('LUMPER_RECEIPT', 'CONDITIONAL', 0.9);
    }

    if (/Scale Ticket|Scale Receipt/i.test(text)) {
      addRequirement('SCALE_TICKET', 'CONDITIONAL', 0.9);
    }

    return requirements;
  }

  /*
   * -------------------------------------------------------
   * Generic label parser
   * -------------------------------------------------------
   */

  private extractLabeledValue(text: string, labels: string[]) {
    const lines = this.getMeaningfulLines(text);

    /*
     * First handle:
     *
     * Label
     * Value
     */
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      const matchingLabel = labels.find((label) =>
        this.normalizedEquals(line, label),
      );

      if (matchingLabel) {
        const value = this.findNextDataLine(lines, index + 1);

        if (value) {
          return value;
        }
      }
    }

    /*
     * Then:
     *
     * Label: Value
     * Label Value
     */
    for (const line of lines) {
      for (const label of labels) {
        const escaped = this.escapeRegExp(label);

        const pattern = new RegExp(`^${escaped}\\s*(?::|#|-)?\\s+(.+)$`, 'i');

        const match = line.match(pattern);

        if (match?.[1]) {
          const candidate = match[1].trim();

          if (
            candidate &&
            !this.isFieldLabel(candidate) &&
            !this.isNoiseLine(candidate)
          ) {
            return candidate;
          }
        }
      }
    }

    return null;
  }

  private getMeaningfulLines(text: string) {
    return text
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  private findNextDataLine(lines: string[], startIndex: number) {
    for (let index = startIndex; index < lines.length; index += 1) {
      const line = lines[index];

      if (this.isNoiseLine(line)) {
        continue;
      }

      /*
       * Reaching another field label
       * means the previous field had
       * no usable value.
       */
      if (this.isFieldLabel(line)) {
        return null;
      }

      return line;
    }

    return null;
  }

  /*
   * -------------------------------------------------------
   * Broker validation / anti-noise safeguards
   * -------------------------------------------------------
   */

  private isValidBrokerName(value: string) {
    const candidate = value.trim();

    if (candidate.length < 3 || candidate.length > 120) {
      return false;
    }

    if (this.isNoiseLine(candidate)) {
      return false;
    }

    if (this.isFieldLabel(candidate)) {
      return false;
    }

    /*
     * Prevent other load parties/sections
     * from being mistaken for Broker.
     */
    if (
      /^(carrier|driver|shipper|receiver|pickup|delivery|facility|commodity|equipment|appointment|required documents?)\b/i.test(
        candidate,
      )
    ) {
      return false;
    }

    /*
     * A raw phone/email is not a company.
     */
    if (this.looksLikePhone(candidate) || this.looksLikeEmail(candidate)) {
      return false;
    }

    return true;
  }

  private isNoiseLine(value: string) {
    const normalized = value
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase();

    if (!normalized) {
      return true;
    }

    const noisePatterns = [
      /^rate confirmation$/,

      /^rate con$/,

      /^test document\b/,

      /^sample document\b/,

      /^sample\b/,

      /\bfor loadpacket\b/,

      /\bregression only\b/,

      /\bqa only\b/,

      /\btest only\b/,

      /\bfor testing\b/,

      /\bdo not use\b/,

      /\bnot for production\b/,

      /\btraining document\b/,

      /\bdemo document\b/,
    ];

    return noisePatterns.some((pattern) => pattern.test(normalized));
  }

  private isFieldLabel(value: string) {
    const normalized = value.replace(/[:#-]+$/g, '').trim();

    return /^(broker|broker name|broker company|brokerage|load number|load #|load no|load id|confirmation date|carrier|driver|equipment|equipment type|trailer|rate|linehaul|line haul|fuel surcharge|fuel|fsc|total rate|total|payment terms|pickup|pick up|delivery|facility|facility name|address|appointment|appointment time|appt|pickup number|pickup #|pickup reference|delivery number|delivery #|delivery reference|required documents|required|conditional|contact|broker contact|contact name|representative|email|phone|commodity|weight|pieces|seal)$/i.test(
      normalized,
    );
  }

  /*
   * -------------------------------------------------------
   * Utility
   * -------------------------------------------------------
   */

  private normalizedEquals(left: string, right: string) {
    const normalize = (value: string) =>
      value
        .replace(/[:#-]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    return normalize(left) === normalize(right);
  }

  private cleanIdentifier(value: string) {
    return value
      .trim()
      .replace(/^[#: -]+/, '')
      .split(/\s+/)[0]
      .replace(/[^A-Za-z0-9_-]/g, '');
  }

  private normalizeMoney(value: string) {
    const cleaned = value
      .replace(/USD/gi, '')
      .replace(/\$/g, '')
      .replace(/,/g, '')
      .trim();

    const match = cleaned.match(/^(-?\d+)(?:\.(\d{1,2}))?/);

    if (!match) {
      return null;
    }

    const whole = match[1];

    const fraction = (match[2] ?? '00').padEnd(2, '0');

    return `${whole}.${fraction}`;
  }

  private addMoney(left: string, right: string) {
    const leftCents = this.moneyToCents(left);

    const rightCents = this.moneyToCents(right);

    if (leftCents === null || rightCents === null) {
      return null;
    }

    return this.centsToMoney(leftCents + rightCents);
  }

  private moneyToCents(value: string) {
    const normalized = this.normalizeMoney(value);

    if (!normalized) {
      return null;
    }

    const [whole, fraction] = normalized.split('.');

    const negative = whole.startsWith('-');

    const absoluteWhole = negative ? whole.slice(1) : whole;

    const cents = BigInt(absoluteWhole) * 100n + BigInt(fraction);

    return negative ? -cents : cents;
  }

  private centsToMoney(cents: bigint) {
    const negative = cents < 0n;

    const absolute = negative ? -cents : cents;

    const whole = absolute / 100n;

    const fraction = (absolute % 100n).toString().padStart(2, '0');

    return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
  }

  private looksLikePhone(value: string) {
    const digits = value.replace(/\D/g, '');

    return (
      digits.length >= 10 && digits.length <= 15 && /^[+\d\s().-]+$/.test(value)
    );
  }

  private looksLikeEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

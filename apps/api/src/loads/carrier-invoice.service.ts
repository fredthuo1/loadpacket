import type { PDFPage, PDFFont } from 'pdf-lib';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { createHash, randomUUID } from 'node:crypto';

import { DocumentStorage } from '../documents/document-storage';

import type {
  CarrierInvoice,
  DocumentVersion,
} from '../generated/prisma/client';
import { digest } from './load-action-token';
import { Prisma } from '../generated/prisma/client';
import { reconcileReadiness } from './readiness-transition';
import { invoiceDueDate, resolveInvoiceTerms } from './invoice-terms';
import type { GenerateInvoiceDto } from './generate-invoice.dto';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { PrismaService } from '../database/prisma.service';

import { LoadEventsService } from '../load-events/load-events.service';

function jsonValue(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const BUSINESS_TIME_ZONE = 'America/Chicago';

@Injectable()
export class CarrierInvoiceService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly loadEvents: LoadEventsService,
    private readonly storage: DocumentStorage,
  ) {}

  private async invoiceState(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    loadId: string,
  ) {
    const load = await tx.load.findFirst({
      where: { id: loadId, organizationId: user.organizationId },
      include: {
        stops: { orderBy: { sequence: 'asc' } },
        requirements: true,
        documents: { include: { document: { include: { versions: true } } } },
        chargeOpportunities: { orderBy: { id: 'asc' } },
        events: { orderBy: { id: 'asc' } },
        payments: true,
        carrierInvoices: {
          include: { documentVersion: true },
          orderBy: { issuedAt: 'asc' },
        },
      },
    });
    if (!load) throw new NotFoundException('Load was not found.');
    const company = await tx.organization.findFirst({
      where: { id: user.organizationId },
      select: {
        name: true,
        dbaName: true,
        mcNumber: true,
        usdotNumber: true,
        email: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        defaultPaymentTermsDays: true,
      },
    });
    const token = digest(JSON.parse(JSON.stringify({ load, company })));
    return { load, company, token };
  }

  async preview(user: AuthenticatedUser, loadId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      const { load, token } = await this.invoiceState(tx, user, loadId);
      const invoices = load.carrierInvoices.map((i) => {
        const payments = load.payments.filter(
          (p) => p.invoiceId === i.id || (!p.invoiceId && !i.originalInvoiceId),
        );
        const paid = payments.reduce(
          (s, p) => s.plus(p.amount),
          new Prisma.Decimal(0),
        );
        return {
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          originalInvoiceId: i.originalInvoiceId,
          totalAmount: i.totalAmount.toFixed(2),
          amountPaid: paid.toFixed(2),
          remainingBalance: i.totalAmount.minus(paid).toFixed(2),
          currency: i.currency,
          submittedAt: i.submittedAt,
          issuedAt: i.issuedAt,
          paymentDueAt: i.paymentDueAt,
          paymentTermsDays: i.paymentTermsDays,
          snapshot: i.snapshot,
        };
      });
      return {
        expectedToken: token,
        loadId,
        baseRate: load.totalRate.toFixed(2),
        hasOriginal:
          !!load.invoiceIssuedAt || invoices.some((i) => !i.originalInvoiceId),
        invoices,
        charges: load.chargeOpportunities.map((c) => ({
          id: c.id,
          description: c.description ?? c.type,
          status: c.status,
          amount: c.amount?.toFixed(2) ?? null,
          currency: c.currency,
        })),
        outstanding: invoices
          .filter((i) => i.submittedAt)
          .reduce((s, i) => s.plus(i.remainingBalance), new Prisma.Decimal(0))
          .toFixed(2),
      };
    });
  }

  private result(
    invoice: CarrierInvoice & { documentVersion: DocumentVersion },
    load: { id: string; loadNumber: string; status: string },
    created: boolean,
  ) {
    return {
      created,
      invoice: {
        id: invoice.id,
        documentId: invoice.documentVersion.documentId,
        invoiceNumber: invoice.invoiceNumber,
        invoiceIssuedAt: invoice.issuedAt,
        paymentTermsDays: invoice.paymentTermsDays,
        paymentDueAt: invoice.paymentDueAt,
        originalFileName: invoice.documentVersion.originalFileName,
        status: 'CONFIRMED',
        checksum: invoice.documentVersion.checksum,
        totalAmount: invoice.totalAmount.toFixed(2),
        originalInvoiceId: invoice.originalInvoiceId,
      },
      load: { id: load.id, loadNumber: load.loadNumber, status: load.status },
    };
  }

  async generate(
    user: AuthenticatedUser,
    loadId: string,
    input: GenerateInvoiceDto = {},
  ) {
    const organizationId = user.organizationId;
    const ids = [...(input.chargeIds ?? [])].sort();
    const supplemental = input.supplemental === true;
    const requestHash = digest({
      actor: user.id,
      loadId,
      supplemental,
      ids,
      paymentTermsDays: input.paymentTermsDays ?? null,
      expectedToken: input.expectedToken ?? null,
    });
    const key = input.idempotencyKey ?? `original:${loadId}`;
    let storageKey: string | undefined;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;
          const { load, company, token } = await this.invoiceState(
            tx,
            user,
            loadId,
          );
          const retry = await tx.carrierInvoice.findFirst({
            where: { organizationId, idempotencyKey: key },
            include: { documentVersion: true },
          });
          if (retry && input.idempotencyKey) {
            if (
              retry.requestHash !== requestHash ||
              retry.createdByUserId !== user.id
            )
              throw new ConflictException(
                'Invoice request key was already used for a different request.',
              );
            return this.result(retry, load, false);
          }
          let original = load.carrierInvoices.find((i) => !i.originalInvoiceId);
          if (
            !supplemental &&
            (original ||
              load.invoiceIssuedAt ||
              load.documents.some((d) => d.role === 'CARRIER_INVOICE'))
          ) {
            if (
              input.paymentTermsDays !== undefined &&
              input.paymentTermsDays !== load.paymentTermsDays
            )
              throw new ConflictException(
                'This invoice is already issued. Its payment terms cannot be changed.',
              );
            if (ids.length)
              throw new ConflictException(
                'An original invoice already exists. Review a supplemental invoice for additional charges.',
              );
            if (original) return this.result(original, load, false);
            const existing = load.documents.find(
              (d) => d.role === 'CARRIER_INVOICE',
            );
            if (!existing)
              throw new ConflictException(
                'Invoice reconciliation required: original document is missing.',
              );
            return {
              created: false,
              invoice: {
                documentId: existing.documentId,
                invoiceNumber: load.invoiceNumber,
                invoiceIssuedAt: load.invoiceIssuedAt,
                paymentTermsDays: load.paymentTermsDays,
                paymentDueAt: load.paymentDueAt,
                status: existing.document.status,
                originalFileName:
                  existing.document.versions[0]?.originalFileName ?? null,
              },
              load: {
                id: load.id,
                loadNumber: load.loadNumber,
                status: load.status,
              },
            };
          }
          if (
            supplemental ||
            ids.length ||
            load.chargeOpportunities.some((c) => c.status === 'APPROVED')
          ) {
            if (
              !input.idempotencyKey ||
              !input.expectedToken ||
              !input.chargeIds
            )
              throw new ConflictException(
                'Review the charge-aware invoice preview before issuing.',
              );
          }
          if (input.expectedToken && input.expectedToken !== token)
            throw new ConflictException(
              'Invoice preview changed. Refresh and review before retrying.',
            );
          if (new Set(ids).size !== ids.length || ids.length > 100)
            throw new BadRequestException(
              'Select each charge once, up to 100 charges.',
            );
          if (supplemental && ids.length === 0)
            throw new BadRequestException(
              'Select at least one approved charge for supplemental billing.',
            );
          if (
            !supplemental &&
            !['DELIVERED', 'PAYMENT_READY'].includes(load.status)
          )
            throw new BadRequestException(
              'Carrier invoices can only be generated for delivered loads.',
            );
          if (
            supplemental &&
            !['PAYMENT_READY', 'INVOICED', 'PAID'].includes(load.status)
          )
            throw new ConflictException(
              'Supplemental billing requires an eligible issued original invoice.',
            );
          if (!company?.name?.trim())
            throw new BadRequestException(
              'Company setup required: ask an Owner to save the Legal Company Name in Company Settings before generating an invoice.',
            );
          if (
            ids.length &&
            (await tx.financialTransaction.findFirst({
              where: {
                organizationId,
                loadId,
                status: 'POSTED',
                effect: 'INCOME',
              },
            }))
          )
            throw new ConflictException(
              'Reconcile existing manual load income before charge billing to avoid duplicate revenue.',
            );
          const selected = ids.map((id) => {
            const c = load.chargeOpportunities.find((c) => c.id === id);
            if (
              !c ||
              c.status !== 'APPROVED' ||
              !c.amount?.gt(0) ||
              c.currency !== load.currency
            )
              throw new ConflictException(
                'Each selected charge must be approved, positive, unbilled and in the invoice currency.',
              );
            return c;
          });
          if (
            load.chargeOpportunities.some((c) => c.status === 'BILLED') &&
            !original
          )
            throw new ConflictException(
              'Reconcile legacy billed charge attribution before invoice adoption.',
            );
          if (supplemental && !original)
            original = await this.adoptOriginal(tx, user, load);
          if (supplemental && !original)
            throw new ConflictException(
              'Original invoice reconciliation required.',
            );
          const requirement = load.requirements.find(
            (r) => r.documentType === 'CARRIER_INVOICE',
          );
          if (
            !supplemental &&
            (!requirement || requirement.status !== 'MISSING')
          )
            throw new ConflictException(
              'Carrier Invoice requirement must be configured and missing before issue.',
            );
          const { defaultPaymentTermsDays, ...profile } = company;
          const sender = { ...profile, name: profile.name.trim() };
          const terms = resolveInvoiceTerms(
            input.paymentTermsDays,
            load.paymentTermsDays,
            defaultPaymentTermsDays,
          );
          const issuedAt = new Date();
          const dueAt = invoiceDueDate(issuedAt, terms);
          const invoiceId = randomUUID();
          const documentId = randomUUID();
          const invoiceNumber = `${this.createInvoiceNumber(load.loadNumber, issuedAt).slice(0, 100)}${supplemental ? '-S' : ''}-${invoiceId.slice(0, 8)}`;
          const lines: {
            description: string;
            amount: string;
            chargeId?: string;
          }[] = [];
          if (!supplemental) {
            if (load.linehaul !== null)
              lines.push({
                description: 'Linehaul',
                amount: load.linehaul.toFixed(2),
              });
            if (load.fuelSurcharge !== null)
              lines.push({
                description: 'Fuel surcharge',
                amount: load.fuelSurcharge.toFixed(2),
              });
            const remainder = load.totalRate
              .minus(load.linehaul ?? 0)
              .minus(load.fuelSurcharge ?? 0);
            if (remainder.lt(0))
              throw new ConflictException(
                'Reconcile the base rate itemization before issuing an invoice.',
              );
            if (!remainder.isZero() || !lines.length)
              lines.push({
                description: 'Unallocated base rate',
                amount: remainder.toFixed(2),
              });
          }
          selected.forEach((c) =>
            lines.push({
              description: c.description ?? c.type,
              amount: c.amount!.toFixed(2),
              chargeId: c.id,
            }),
          );
          const total = lines.reduce(
            (s, l) => s.plus(l.amount),
            new Prisma.Decimal(0),
          );
          if (total.gt('9999999999.99'))
            throw new BadRequestException(
              'Invoice total exceeds supported monetary precision.',
            );
          const snapshot = {
            schemaVersion: 1,
            invoicePolicy: 'tenant-invoice-v2',
            sender,
            recipient: { name: load.brokerName, contact: load.brokerContact },
            lines,
            baseRate: supplemental ? '0.00' : load.totalRate.toFixed(2),
            totalAmount: total.toFixed(2),
            currency: load.currency,
            originalInvoiceNumber: supplemental
              ? original!.invoiceNumber
              : null,
            paymentTermsDays: terms,
            paymentDueAt: dueAt.toISOString(),
            billingTimeZone: BUSINESS_TIME_ZONE,
          };
          const bytes = await this.buildInvoicePdf({
            sender,
            invoiceNumber,
            invoiceIssuedAt: issuedAt,
            paymentTermsDays: terms,
            paymentDueAt: dueAt,
            loadNumber: load.loadNumber,
            brokerName: load.brokerName,
            brokerContact: load.brokerContact,
            equipment: load.equipment,
            currency: load.currency,
            linehaul: supplemental ? null : (load.linehaul?.toFixed(2) ?? null),
            fuelSurcharge: supplemental
              ? null
              : (load.fuelSurcharge?.toFixed(2) ?? null),
            totalRate: total.toFixed(2),
            pickup: load.stops[0] ?? null,
            delivery: load.stops.at(-1) ?? null,
            lines,
            originalInvoiceNumber: snapshot.originalInvoiceNumber,
          });
          storageKey = `documents/${documentId}/v1.pdf`;
          await this.storage.put(storageKey, Buffer.from(bytes));
          const doc = await tx.document.create({
            data: {
              id: documentId,
              organizationId,
              type: 'CARRIER_INVOICE',
              status: 'CONFIRMED',
              versions: {
                create: {
                  organizationId,
                  uploadedByUserId: user.id,
                  versionNumber: 1,
                  originalFileName: `${invoiceNumber}.pdf`,
                  mimeType: 'application/pdf',
                  sizeBytes: bytes.length,
                  checksum: createHash('sha256').update(bytes).digest('hex'),
                  storageKey,
                },
              },
            },
            include: { versions: true },
          });
          await tx.loadDocument.create({
            data: {
              organizationId,
              loadId,
              documentId,
              role: 'CARRIER_INVOICE',
            },
          });
          const invoice = await tx.carrierInvoice.create({
            data: {
              id: invoiceId,
              organizationId,
              loadId,
              originalInvoiceId: supplemental ? original!.id : null,
              invoiceNumber,
              issuedAt,
              paymentTermsDays: terms,
              paymentDueAt: dueAt,
              currency: load.currency,
              totalAmount: total,
              documentVersionId: doc.versions[0].id,
              snapshot,
              idempotencyKey: key,
              requestHash,
              createdByUserId: user.id,
            },
            include: { documentVersion: true },
          });
          for (const c of selected) {
            const approvals = load.events.filter(
              (e) =>
                e.type === 'CHARGE_OPPORTUNITY_APPROVED' &&
                jsonObject(e.metadata).opportunityId === c.id,
            );
            if (approvals.length !== 1)
              throw new ConflictException(
                'Charge approval evidence requires reconciliation.',
              );
            const sourceVersion = c.sourceDocumentId
              ? await tx.documentVersion.findFirst({
                  where: { organizationId, documentId: c.sourceDocumentId },
                  orderBy: { versionNumber: 'desc' },
                })
              : null;
            if (c.sourceDocumentId && !sourceVersion)
              throw new ConflictException(
                'Charge source document evidence requires reconciliation.',
              );
            await tx.carrierInvoiceCharge.create({
              data: {
                organizationId,
                loadId,
                invoiceId,
                chargeOpportunityId: c.id,
                amount: c.amount!,
                currency: c.currency,
                description: c.description ?? c.type,
                snapshot: jsonValue({
                  schemaVersion: 1,
                  opportunity: c,
                  approval: approvals[0],
                  sourceDocumentVersionId: sourceVersion?.id ?? null,
                  sourceChecksum: sourceVersion?.checksum ?? null,
                }),
              },
            });
            await tx.loadChargeOpportunity.update({
              where: { id: c.id, organizationId },
              data: { status: 'BILLED' },
            });
            await this.loadEvents.recordInTransaction(tx, {
              organizationId,
              loadId,
              type: 'CHARGE_OPPORTUNITY_BILLED',
              actorType: 'OWNER',
              actorId: user.id,
              metadata: {
                schemaVersion: 1,
                invoiceId,
                opportunityId: c.id,
                amount: c.amount!.toFixed(2),
                currency: c.currency,
              },
            });
          }
          let status = load.status;
          if (!supplemental) {
            await tx.loadRequirement.update({
              where: { id: requirement!.id, organizationId },
              data: {
                status: 'ACCEPTED',
                currentVersionId: doc.versions[0].id,
                reviewedVersionId: doc.versions[0].id,
                reviewedByUserId: user.id,
                reviewedAt: issuedAt,
                reviewReason: 'System-generated immutable carrier invoice',
              },
            });
            await tx.load.update({
              where: { id: loadId, organizationId },
              data: {
                invoiceNumber,
                invoiceIssuedAt: issuedAt,
                paymentTermsDays: terms,
                paymentDueAt: dueAt,
              },
            });
            status = (
              await reconcileReadiness(tx, user, loadId, this.loadEvents)
            ).status;
          }
          await this.loadEvents.recordInTransaction(tx, {
            organizationId,
            loadId,
            type: 'INVOICE_CREATED',
            actorType: 'SYSTEM',
            actorId: user.id,
            metadata: jsonValue({
              ...snapshot,
              invoiceId,
              invoiceNumber,
              documentId,
              totalRate: total.toFixed(2),
              originalInvoiceId: invoice.originalInvoiceId,
            }),
          });
          return this.result(invoice, { ...load, status }, true);
        },
        { timeout: 30000 },
      );
    } catch (error) {
      if (storageKey)
        try {
          if (
            !(await this.prisma.documentVersion.findFirst({
              where: { organizationId, storageKey },
            }))
          )
            await this.storage.removeUncommitted(storageKey);
        } catch {
          /* Unknown commit outcome: retain evidence. */
        }
      throw error;
    }
  }

  private async adoptOriginal(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    load: Awaited<ReturnType<CarrierInvoiceService['invoiceState']>>['load'],
  ) {
    const fail = () =>
      new ConflictException(
        'Original invoice reconciliation required: immutable identity, terms, dates, amount and receipts must agree.',
      );
    const issues = load.events.filter((e) => e.type === 'INVOICE_CREATED');
    const links = load.documents.filter((d) => d.role === 'CARRIER_INVOICE');
    if (
      issues.length !== 1 ||
      links.length !== 1 ||
      links[0].document.versions.length !== 1 ||
      !load.invoiceNumber ||
      !load.invoiceIssuedAt ||
      load.paymentTermsDays === null ||
      !load.paymentDueAt
    )
      throw fail();
    const issue = issues[0];
    const m = jsonObject(issue.metadata);
    const version = links[0].document.versions[0];
    const requirement = load.requirements.find(
      (r) => r.documentType === 'CARRIER_INVOICE',
    );
    const payments = load.payments.reduce(
      (s, p) => s.plus(p.amount),
      new Prisma.Decimal(0),
    );
    if (
      m.invoicePolicy !== 'tenant-invoice-v1' ||
      !jsonObject(m.sender).name ||
      m.invoiceNumber !== load.invoiceNumber ||
      m.documentId !== version.documentId ||
      m.totalRate !== load.totalRate.toString() ||
      m.currency !== load.currency ||
      m.paymentTermsDays !== load.paymentTermsDays ||
      m.paymentDueAt !== load.paymentDueAt.toISOString() ||
      issue.occurredAt.getTime() !== load.invoiceIssuedAt.getTime() ||
      requirement?.reviewedVersionId !== version.id ||
      requirement.status !== 'ACCEPTED' ||
      !payments.eq(load.amountPaid ?? 0) ||
      payments.gt(load.totalRate) ||
      load.payments.some((p) => p.invoiceId || p.currency !== load.currency) ||
      (load.status === 'PAID' && !payments.eq(load.totalRate))
    )
      throw fail();
    const submissions = load.events.filter(
      (e) => e.type === 'BILLING_SUBMITTED',
    );
    for (const payment of load.payments) {
      const matching = load.events.filter(
        (e) =>
          e.type === 'PAYMENT_RECEIVED' &&
          jsonObject(e.metadata).paymentId === payment.id,
      );
      if (matching.length !== 1) throw fail();
      const receipt = jsonObject(matching[0].metadata);
      if (
        typeof receipt.paymentAmount !== 'string' ||
        !payment.amount.eq(receipt.paymentAmount) ||
        receipt.currency !== payment.currency ||
        receipt.invoiceNumber !== load.invoiceNumber
      )
        throw fail();
    }
    if (load.status === 'INVOICED' || load.status === 'PAID') {
      if (
        !load.billingSubmittedAt ||
        submissions.length !== 1 ||
        jsonObject(submissions[0].metadata).invoiceNumber !==
          load.invoiceNumber ||
        jsonObject(submissions[0].metadata).totalRate !==
          load.totalRate.toString()
      )
        throw fail();
    } else if (
      load.billingSubmittedAt ||
      submissions.length ||
      !payments.isZero()
    )
      throw fail();
    const pdf = await this.storage.read(version.storageKey);
    if (createHash('sha256').update(pdf).digest('hex') !== version.checksum)
      throw fail();
    return tx.carrierInvoice.create({
      data: {
        organizationId: user.organizationId,
        loadId: load.id,
        invoiceNumber: load.invoiceNumber,
        issuedAt: load.invoiceIssuedAt,
        paymentTermsDays: load.paymentTermsDays,
        paymentDueAt: load.paymentDueAt,
        currency: load.currency,
        totalAmount: load.totalRate,
        documentVersionId: version.id,
        snapshot: jsonValue({
          schemaVersion: 1,
          legacy: true,
          issueEventId: issue.id,
          ...m,
        }),
        idempotencyKey: `adopt:${load.id}`,
        requestHash: digest({
          version: version.id,
          checksum: version.checksum,
        }),
        createdByUserId: user.id,
        submittedAt: load.billingSubmittedAt,
      },
      include: { documentVersion: true },
    });
  }

  async submitSupplement(
    user: AuthenticatedUser,
    loadId: string,
    invoiceId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      const i = await tx.carrierInvoice.findFirst({
        where: { id: invoiceId, loadId, organizationId: user.organizationId },
        include: { original: true },
      });
      if (!i) throw new NotFoundException('Invoice was not found.');
      if (!i.originalInvoiceId)
        throw new BadRequestException(
          'Submit original invoices through the existing billing readiness workflow.',
        );
      if (i.submittedAt) return { submitted: false, invoiceId };
      if (!i.original?.submittedAt)
        throw new ConflictException(
          'Submit the original invoice before supplemental billing.',
        );
      const submittedAt = new Date();
      await tx.carrierInvoice.update({
        where: { id: invoiceId, organizationId: user.organizationId },
        data: { submittedAt },
      });
      await this.loadEvents.recordInTransaction(tx, {
        organizationId: user.organizationId,
        loadId,
        type: 'BILLING_SUBMITTED',
        actorType: 'OWNER',
        actorId: user.id,
        metadata: {
          schemaVersion: 1,
          invoiceId,
          invoiceNumber: i.invoiceNumber,
          totalAmount: i.totalAmount.toFixed(2),
          submissionOnly: true,
        },
      });
      return { submitted: true, invoiceId, submittedAt };
    });
  }

  private createInvoiceNumber(loadNumber: string, issuedAt: Date) {
    const safeLoadNumber = loadNumber.trim().replace(/[^a-zA-Z0-9-_]/g, '-');

    const date = this.getBusinessDateStamp(issuedAt);

    return `LP-INV-${safeLoadNumber}-${date}`;
  }

  private async buildInvoicePdf(data: {
    lines: { description: string; amount: string; chargeId?: string }[];
    originalInvoiceNumber: string | null;
    sender: {
      name: string;
      dbaName: string | null;
      mcNumber: string | null;
      usdotNumber: string | null;
      email: string | null;
      phone: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string;
    };
    paymentTermsDays: number;
    paymentDueAt: Date;
    invoiceNumber: string;

    invoiceIssuedAt: Date;

    loadNumber: string;

    brokerName: string;

    brokerContact: string | null;

    equipment: string | null;

    currency: string;

    linehaul: string | null;

    fuelSurcharge: string | null;

    totalRate: string;

    pickup: {
      facilityName: string | null;

      address: string;
    } | null;

    delivery: {
      facilityName: string | null;

      address: string;
    } | null;
  }) {
    const pdf = await PDFDocument.create();

    const page = pdf.addPage([612, 792]);

    const regular = await pdf.embedFont(StandardFonts.Helvetica);

    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const dark = rgb(0.06, 0.09, 0.15);

    const muted = rgb(0.35, 0.4, 0.47);

    let y = 735;

    page.drawText('LOADPACKET', {
      x: 50,

      y,

      size: 20,

      font: bold,

      color: dark,
    });

    page.drawText('CARRIER INVOICE', {
      x: 390,

      y,

      size: 16,

      font: bold,

      color: dark,
    });

    y -= 42;

    this.drawLabelValue(
      page,
      regular,
      bold,
      'Invoice Number',
      data.invoiceNumber,
      50,
      y,
    );

    this.drawLabelValue(
      page,
      regular,
      bold,
      'Invoice Date',
      this.formatBusinessDate(data.invoiceIssuedAt),
      330,
      y,
    );

    y -= 52;

    page.drawText('FROM', {
      x: 50,

      y,

      size: 9,

      font: bold,

      color: muted,
    });

    this.drawSenderText(page, bold, data.sender.name, 50, y - 17, 250, 9);

    page.drawText('TO', {
      x: 330,

      y,

      size: 9,

      font: bold,

      color: muted,
    });

    page.drawText(data.brokerName, {
      x: 330,

      y: y - 17,

      size: 12,

      font: bold,

      color: dark,
    });

    if (data.brokerContact) {
      page.drawText(data.brokerContact.slice(0, 45), {
        x: 330,

        y: y - 34,

        size: 9,

        font: regular,

        color: muted,
      });
    }

    y -= 90;

    page.drawLine({
      start: {
        x: 50,

        y,
      },

      end: {
        x: 562,

        y,
      },

      thickness: 1,

      color: rgb(0.85, 0.87, 0.9),
    });

    y -= 30;

    page.drawText('LOAD DETAILS', {
      x: 50,

      y,

      size: 11,

      font: bold,

      color: dark,
    });

    y -= 27;

    this.drawLabelValue(
      page,
      regular,
      bold,
      'Load Number',
      data.loadNumber,
      50,
      y,
    );

    this.drawLabelValue(
      page,
      regular,
      bold,
      'Equipment',
      data.equipment ?? 'Not specified',
      330,
      y,
    );

    y -= 55;

    this.drawLabelValue(
      page,
      regular,
      bold,
      'Pickup',
      data.pickup
        ? `${data.pickup.facilityName ?? 'Pickup'} - ${data.pickup.address}`
        : 'Not specified',
      50,
      y,
      70,
    );

    y -= 55;

    this.drawLabelValue(
      page,
      regular,
      bold,
      'Delivery',
      data.delivery
        ? `${data.delivery.facilityName ?? 'Delivery'} - ${data.delivery.address}`
        : 'Not specified',
      50,
      y,
      70,
    );

    y -= 75;

    page.drawText('CHARGES', {
      x: 50,

      y,

      size: 11,

      font: bold,

      color: dark,
    });

    y -= 30;

    const linehaul = data.linehaul
      ? this.money(data.linehaul, data.currency)
      : '-';

    const fuel = data.fuelSurcharge
      ? this.money(data.fuelSurcharge, data.currency)
      : '-';

    const total = this.money(data.totalRate, data.currency);

    page.drawText('Linehaul', {
      x: 50,

      y,

      size: 11,

      font: regular,
    });

    page.drawText(linehaul, {
      x: 450,

      y,

      size: 11,

      font: regular,
    });

    y -= 27;

    page.drawText('Fuel Surcharge', {
      x: 50,

      y,

      size: 11,

      font: regular,
    });

    page.drawText(fuel, {
      x: 450,

      y,

      size: 11,

      font: regular,
    });

    y -= 22;

    page.drawLine({
      start: {
        x: 360,

        y,
      },

      end: {
        x: 562,

        y,
      },

      thickness: 1,

      color: rgb(0.25, 0.28, 0.32),
    });

    y -= 28;

    page.drawText('TOTAL DUE', {
      x: 360,

      y,

      size: 12,

      font: bold,

      color: dark,
    });

    page.drawText(total, {
      x: 450,

      y,

      size: 12,

      font: bold,

      color: dark,
    });

    y -= 80;

    page.drawText(
      `Payment terms: ${data.paymentTermsDays === 0 ? 'Due on invoice date (0 days)' : `Net ${data.paymentTermsDays} days`}. Due: ${this.formatBusinessDate(data.paymentDueAt)}.`,
      {
        x: 50,

        y,

        size: 9,

        font: regular,

        color: muted,
      },
    );

    page.drawText(`Reference load ${data.loadNumber} with payment.`, {
      x: 50,

      y: y - 16,

      size: 9,

      font: regular,

      color: muted,
    });

    page.drawText('Generated by LoadPacket', {
      x: 50,

      y: 45,

      size: 8,

      font: regular,

      color: muted,
    });

    // Full profile snapshot stays inside the immutable evidence, without truncating contact fields.
    const details = pdf.addPage([612, 792]);
    details.drawText('CARRIER DETAILS AT ISSUE', {
      x: 50,
      y: 735,
      size: 16,
      font: bold,
    });
    let detailY = 705;
    const entries = [
      ['Legal name', data.sender.name],
      ['DBA', data.sender.dbaName],
      ['MC', data.sender.mcNumber],
      ['USDOT', data.sender.usdotNumber],
      ['Email', data.sender.email],
      ['Phone', data.sender.phone],
      ['Address', data.sender.addressLine1],
      ['Address line 2', data.sender.addressLine2],
      ['City', data.sender.city],
      ['State', data.sender.state],
      ['Postal code', data.sender.postalCode],
      ['Country', data.sender.country],
    ];
    for (const [label, value] of entries) {
      if (value?.trim())
        detailY =
          this.drawSenderText(
            details,
            regular,
            `${label}: ${value.trim()}`,
            50,
            detailY,
            512,
            10,
          ) - 10;
    }
    details.drawText(`Billing dates: ${BUSINESS_TIME_ZONE}; calendar days.`, {
      x: 50,
      y: 65,
      size: 9,
      font: regular,
    });

    let itemPage = pdf.addPage([612, 792]);
    let itemY = 735;
    const drawItem = (text: string) => {
      // Bound individual wrapped lines so long descriptions cannot overflow a page.
      for (const chunk of text.match(/.{1,75}/gu) ?? ['']) {
        if (itemY < 65) {
          itemPage = pdf.addPage([612, 792]);
          itemY = 735;
        }
        itemY =
          this.drawSenderText(itemPage, regular, chunk, 50, itemY, 500, 10) -
          10;
      }
    };
    drawItem('INVOICE ITEMIZATION');
    drawItem(data.invoiceNumber);
    if (data.originalInvoiceNumber)
      drawItem('Supplement to original invoice: ' + data.originalInvoiceNumber);
    for (const line of data.lines) {
      drawItem(line.description + ' | ' + line.amount + ' ' + data.currency);
      if (line.chargeId) drawItem('Charge reference: ' + line.chargeId);
    }
    drawItem('Invoice total: ' + data.totalRate + ' ' + data.currency);
    return pdf.save();
  }

  private drawSenderText(
    page: PDFPage,
    font: PDFFont,
    text: string,
    x: number,
    y: number,
    width: number,
    size: number,
  ) {
    let line = '';
    try {
      for (const character of text.replace(/\s+/g, ' ')) {
        if (font.widthOfTextAtSize(line + character, size) > width) {
          page.drawText(line, { x, y, size, font });
          y -= size + 3;
          line = '';
        }
        line += character;
      }
      page.drawText(line, { x, y, size, font });
      return y - size - 3;
    } catch {
      throw new BadRequestException(
        'Company invoice fields contain characters unsupported by the current PDF font. Ask an Owner to review Company Settings. No invoice was issued.',
      );
    }
  }

  private drawLabelValue(
    page: PDFPage,
    regular: PDFFont,
    bold: PDFFont,
    label: string,
    value: string,
    x: number,
    y: number,
    maxLength = 45,
  ) {
    page.drawText(label.toUpperCase(), {
      x,

      y,

      size: 8,

      font: bold,

      color: rgb(0.35, 0.4, 0.47),
    });

    page.drawText(value.slice(0, maxLength), {
      x,

      y: y - 17,

      size: 10,

      font: regular,

      color: rgb(0.06, 0.09, 0.15),
    });
  }

  private money(value: string, currency: string) {
    const number = Number(value);

    if (Number.isNaN(number)) {
      return value;
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',

      currency: currency || 'USD',
    }).format(number);
  }

  private getBusinessDateStamp(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;

    const month = parts.find((part) => part.type === 'month')?.value;

    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new Error('Unable to resolve business date.');
    }

    return `${year}${month}${day}`;
  }

  private formatBusinessDate(date: Date) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,

      month: 'short',

      day: 'numeric',

      year: 'numeric',
    }).format(date);
  }
}

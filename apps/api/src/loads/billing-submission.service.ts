import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { evaluateReadiness } from './readiness-policy';
import {
  invoiceDueDate,
  resolveInvoiceTerms,
  validateInvoiceTerms,
} from './invoice-terms';

import {
  DocumentType,
  LoadEventActorType,
  LoadEventType,
  LoadStatus,
} from '../generated/prisma/enums';

import { LoadEventsService } from '../load-events/load-events.service';

type SubmitBillingInput = {
  paymentTermsDays?: number;

  billingRecipientName?: string;
  billingRecipientEmail?: string;

  /*
   * Support the shorter field names too
   * so existing clients remain compatible.
   */
  recipientName?: string;
  recipientEmail?: string;
};

@Injectable()
export class BillingSubmissionService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly loadEvents: LoadEventsService,
  ) {}

  async submit(currentUser: AuthenticatedUser, loadId: string, dto?: unknown) {
    const organizationId = currentUser.organizationId;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`,
      );

      const load = await tx.load.findFirst({
        where: {
          id: loadId,

          organizationId,
        },

        select: {
          id: true,

          loadNumber: true,

          status: true,

          brokerName: true,

          brokerContact: true,

          currency: true,

          totalRate: true,

          invoiceNumber: true,

          invoiceIssuedAt: true,

          billingSubmittedAt: true,

          paymentTermsDays: true,

          paymentDueAt: true,

          billingRecipientName: true,

          billingRecipientEmail: true,

          amountPaid: true,

          paidAt: true,

          requirements: true,

          documents: {
            where: {
              role: DocumentType.CARRIER_INVOICE,
            },

            select: {
              id: true,

              documentId: true,
            },
          },
        },
      });

      if (!load) {
        throw new NotFoundException('Load was not found.');
      }

      /*
       * Idempotency.
       *
       * A second Submit Billing click must
       * not create another timeline event.
       */
      if (
        load.status === LoadStatus.INVOICED ||
        load.status === LoadStatus.PAID
      ) {
        return {
          submitted: false,

          message: 'Billing has already been submitted.',

          load: this.serializeLoad(load),
        };
      }

      if (load.status !== LoadStatus.PAYMENT_READY) {
        throw new BadRequestException(
          `Billing can only be submitted when the load is Payment Ready. Current status: ${load.status}.`,
        );
      }

      const readiness = evaluateReadiness(load.requirements);
      if (!readiness.ready) {
        const blockers = readiness.blockers
          .map((requirement) => `${requirement.type}: ${requirement.reason}`)
          .join(', ');

        throw new BadRequestException(
          `Billing is blocked: ${blockers || 'Document requirements are not configured'}.`,
        );
      }

      /*
       * The carrier invoice must already
       * exist before billing is submitted.
       *
       * CarrierInvoiceService owns invoice
       * creation and invoice identity.
       */
      if (load.documents.length === 0) {
        throw new BadRequestException(
          'Generate the Carrier Invoice before submitting billing.',
        );
      }

      if (!load.invoiceNumber || !load.invoiceIssuedAt) {
        throw new BadRequestException(
          'Carrier invoice identity is missing. Generate the Carrier Invoice before submitting billing.',
        );
      }

      const input = this.normalizeInput(dto);

      const frozen = load.paymentTermsDays != null && load.paymentDueAt != null;
      if (
        frozen &&
        input.paymentTermsDays !== undefined &&
        input.paymentTermsDays !== load.paymentTermsDays
      ) {
        throw new ConflictException(
          'This invoice is already issued. Submit with its existing payment terms; changes require a separate invoice correction workflow.',
        );
      }
      const company =
        !frozen &&
        load.paymentTermsDays == null &&
        input.paymentTermsDays === undefined
          ? await tx.organization.findFirst({
              where: { id: organizationId },
              select: { defaultPaymentTermsDays: true },
            })
          : null;
      const paymentTermsDays = frozen
        ? validateInvoiceTerms(load.paymentTermsDays)
        : resolveInvoiceTerms(
            input.paymentTermsDays,
            load.paymentTermsDays,
            company?.defaultPaymentTermsDays,
          );

      const billingRecipientName =
        this.cleanText(input.billingRecipientName ?? input.recipientName) ??
        load.billingRecipientName ??
        load.brokerName;

      const requestedEmail = this.cleanText(
        input.billingRecipientEmail ?? input.recipientEmail,
      );

      const existingEmail = this.cleanText(load.billingRecipientEmail);

      const brokerEmail = this.extractEmail(load.brokerContact);

      const billingRecipientEmail =
        requestedEmail ?? existingEmail ?? brokerEmail;

      if (billingRecipientEmail && !this.isEmail(billingRecipientEmail)) {
        throw new BadRequestException('Billing recipient email is invalid.');
      }

      const billingSubmittedAt = new Date();

      /*
       * Payment terms begin from the
       * persisted invoice issue date.
       *
       * We never generate a second invoice
       * number/date here.
       */
      const paymentDueAt =
        load.paymentDueAt ??
        invoiceDueDate(load.invoiceIssuedAt, paymentTermsDays);

      const canonical = await tx.carrierInvoice.findFirst({
        where: { organizationId, loadId, originalInvoiceId: null },
      });
      if (canonical && !canonical.submittedAt)
        await tx.carrierInvoice.update({
          where: { id: canonical.id, organizationId },
          data: { submittedAt: billingSubmittedAt },
        });
      const updated = await (async () => {
        const updatedLoad = await tx.load.update({
          where: { organizationId: currentUser.organizationId, id: load.id },

          data: {
            status: LoadStatus.INVOICED,

            billingSubmittedAt,

            paymentTermsDays,

            paymentDueAt,

            billingRecipientName,

            billingRecipientEmail,
          },

          select: {
            id: true,

            loadNumber: true,

            status: true,

            brokerName: true,

            currency: true,

            totalRate: true,

            invoiceNumber: true,

            invoiceIssuedAt: true,

            billingSubmittedAt: true,

            paymentTermsDays: true,

            paymentDueAt: true,

            billingRecipientName: true,

            billingRecipientEmail: true,

            amountPaid: true,

            paidAt: true,
          },
        });

        await this.loadEvents.recordInTransaction(tx, {
          actorId: currentUser.id,
          organizationId,

          loadId: load.id,

          type: LoadEventType.BILLING_SUBMITTED,

          actorType: LoadEventActorType.OWNER,

          actorName: `${currentUser.firstName} ${currentUser.lastName}`,

          occurredAt: billingSubmittedAt,

          metadata: {
            invoiceNumber: load.invoiceNumber,

            previousLoadStatus: LoadStatus.PAYMENT_READY,

            loadStatus: LoadStatus.INVOICED,

            totalRate: load.totalRate.toString(),

            currency: load.currency,

            paymentTermsDays,

            paymentDueAt: paymentDueAt.toISOString(),

            billingRecipientName,

            billingRecipientEmail,
          },
        });

        return updatedLoad;
      })();

      return {
        submitted: true,

        message: 'Billing submitted successfully.',

        load: this.serializeLoad(updated),
      };
    });
  }

  /*
   * Alias retained so either controller
   * naming convention continues to work.
   */
  async submitBilling(
    currentUser: AuthenticatedUser,
    loadId: string,
    dto?: unknown,
  ) {
    return this.submit(currentUser, loadId, dto);
  }

  private normalizeInput(value: unknown): SubmitBillingInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const input = value as Record<string, unknown>;

    return {
      paymentTermsDays:
        input.paymentTermsDays === undefined
          ? undefined
          : validateInvoiceTerms(input.paymentTermsDays),

      billingRecipientName:
        typeof input.billingRecipientName === 'string'
          ? input.billingRecipientName
          : undefined,

      billingRecipientEmail:
        typeof input.billingRecipientEmail === 'string'
          ? input.billingRecipientEmail
          : undefined,

      recipientName:
        typeof input.recipientName === 'string'
          ? input.recipientName
          : undefined,

      recipientEmail:
        typeof input.recipientEmail === 'string'
          ? input.recipientEmail
          : undefined,
    };
  }

  private serializeLoad(load: {
    id: string;

    loadNumber: string;

    status: LoadStatus;

    brokerName?: string;

    currency?: string;

    totalRate: {
      toString(): string;
    };

    invoiceNumber: string | null;

    invoiceIssuedAt: Date | null;

    billingSubmittedAt: Date | null;

    paymentTermsDays: number | null;

    paymentDueAt: Date | null;

    billingRecipientName: string | null;

    billingRecipientEmail: string | null;

    amountPaid: {
      toString(): string;
    } | null;

    paidAt: Date | null;
  }) {
    return {
      id: load.id,

      loadNumber: load.loadNumber,

      status: load.status,

      brokerName: load.brokerName,

      currency: load.currency,

      totalRate: load.totalRate.toString(),

      invoiceNumber: load.invoiceNumber,

      invoiceIssuedAt: load.invoiceIssuedAt,

      billingSubmittedAt: load.billingSubmittedAt,

      paymentTermsDays: load.paymentTermsDays,

      paymentDueAt: load.paymentDueAt,

      billingRecipientName: load.billingRecipientName,

      billingRecipientEmail: load.billingRecipientEmail,

      amountPaid: load.amountPaid?.toString() ?? null,

      paidAt: load.paidAt,
    };
  }

  private cleanText(value: string | null | undefined) {
    if (!value) {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }

  private extractEmail(value: string | null) {
    if (!value) {
      return null;
    }

    const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

    return match?.[0] ?? null;
  }

  private isEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}

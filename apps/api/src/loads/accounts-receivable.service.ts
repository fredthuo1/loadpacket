import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { RecordPaymentDto } from './record-payment.dto';

import { LoadStatus } from '../generated/prisma/enums';

import { LoadEventsService } from '../load-events/load-events.service';
import { getBusinessDateIso } from './business-date.util';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

type InvoiceRow = {
  id: string;

  loadNumber: string;

  brokerName: string;

  status: LoadStatus;

  currency: string;

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
};

@Injectable()
export class AccountsReceivableService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly loadEvents: LoadEventsService,
  ) {}

  async getDashboard(currentUser: AuthenticatedUser) {
    const organizationId = currentUser.organizationId;

    const now = new Date();

    const loads = await this.prisma.load.findMany({
      where: {
        organizationId,

        status: {
          in: [LoadStatus.INVOICED, LoadStatus.PAID],
        },
      },

      orderBy: [
        {
          billingSubmittedAt: 'desc',
        },

        {
          createdAt: 'desc',
        },
      ],

      select: {
        id: true,

        loadNumber: true,

        brokerName: true,

        status: true,

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

    const canonical = await this.prisma.carrierInvoice.findMany({
      where: { organizationId },
      include: { load: true },
    });
    const receipts = await this.prisma.loadPayment.findMany({
      where: { organizationId },
    });
    const rows = loads
      .filter(
        (l) =>
          !canonical.some((i) => i.loadId === l.id && !i.originalInvoiceId),
      )
      .map((l) => ({
        ...l,
        invoiceId: null as string | null,
        loadId: l.id,
        originalInvoiceId: null as string | null,
      }));
    for (const i of canonical.filter((i) => i.submittedAt)) {
      const invoiceReceipts = receipts.filter(
        (p) =>
          p.loadId === i.loadId &&
          (p.invoiceId === i.id || (!p.invoiceId && !i.originalInvoiceId)),
      );
      const paid = invoiceReceipts.reduce(
        (s, p) => s.plus(p.amount),
        new Prisma.Decimal(0),
      );
      rows.push({
        ...i.load,
        invoiceId: i.id,
        loadId: i.loadId,
        originalInvoiceId: i.originalInvoiceId,
        status: paid.eq(i.totalAmount) ? LoadStatus.PAID : LoadStatus.INVOICED,
        totalRate: i.totalAmount,
        amountPaid: paid,
        paidAt: paid.eq(i.totalAmount)
          ? invoiceReceipts.reduce<Date | null>(
              (latest, p) =>
                !latest || p.recordedAt > latest ? p.recordedAt : latest,
              null,
            )
          : null,
        invoiceNumber: i.invoiceNumber,
        invoiceIssuedAt: i.issuedAt,
        paymentTermsDays: i.paymentTermsDays,
        paymentDueAt: i.paymentDueAt,
        billingSubmittedAt: i.submittedAt,
      });
    }
    const invoices = rows.map((load) => {
      const aging = this.getAging(load.status, load.paymentDueAt, now);

      return {
        id: load.originalInvoiceId ? load.invoiceId! : load.id,
        invoiceId: load.invoiceId,
        loadId: load.loadId,
        originalInvoiceId: load.originalInvoiceId,

        loadNumber: load.loadNumber,

        brokerName: load.brokerName,

        status: load.status,

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
        remainingBalance: Prisma.Decimal.max(
          0,
          new Prisma.Decimal(load.totalRate.toString()).minus(
            load.amountPaid?.toString() ?? '0',
          ),
        ).toFixed(2),

        paidAt: load.paidAt,

        agingStatus: aging.agingStatus,

        daysUntilDue: aging.daysUntilDue,
      };
    });

    let outstandingCents = 0n;

    let outstandingCount = 0;

    let dueSoonCents = 0n;

    let dueSoonCount = 0;

    let overdueCents = 0n;

    let overdueCount = 0;

    let paidCents = 0n;

    let paidCount = 0;

    for (const invoice of invoices) {
      const totalRateCents = this.parseMoneyToCents(invoice.totalRate);
      const remainingCents = this.parseMoneyToCents(invoice.remainingBalance);

      if (invoice.status === LoadStatus.INVOICED) {
        outstandingCents += remainingCents;

        outstandingCount += 1;

        if (invoice.agingStatus === 'DUE_SOON') {
          dueSoonCents += remainingCents;

          dueSoonCount += 1;
        }

        if (invoice.agingStatus === 'OVERDUE') {
          overdueCents += remainingCents;

          overdueCount += 1;
        }
      }

      if (invoice.status === LoadStatus.PAID) {
        const paymentCents = invoice.amountPaid
          ? this.parseMoneyToCents(invoice.amountPaid)
          : totalRateCents;

        paidCents += paymentCents;

        paidCount += 1;
      }
    }

    return {
      generatedAt: now.toISOString(),

      summary: {
        outstanding: {
          amount: this.formatCents(outstandingCents),

          count: outstandingCount,
        },

        dueSoon: {
          amount: this.formatCents(dueSoonCents),

          count: dueSoonCount,
        },

        overdue: {
          amount: this.formatCents(overdueCents),

          count: overdueCount,
        },

        paid: {
          amount: this.formatCents(paidCents),

          count: paidCount,
        },
      },

      invoices,
    };
  }

  /*
   * Alias retained for compatibility
   * with either service naming style.
   */
  async getAccountsReceivable(currentUser: AuthenticatedUser) {
    return this.getDashboard(currentUser);
  }

  async markPaid(
    currentUser: AuthenticatedUser,
    loadId: string,
    dto: RecordPaymentDto,
  ) {
    if (
      !dto ||
      typeof dto.amountPaid !== 'string' ||
      !/^\d{1,10}(\.\d{1,2})?$/.test(dto.amountPaid) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        dto.idempotencyKey ?? '',
      )
    )
      throw new BadRequestException(
        'A valid payment amount and operation key are required.',
      );
    const amount = new Prisma.Decimal(dto.amountPaid);
    if (!amount.gt(0))
      throw new BadRequestException(
        'Payment amount must be greater than zero.',
      );
    const recordedAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (!Number.isFinite(recordedAt.getTime()))
      throw new BadRequestException('Payment date is invalid.');
    const organizationId = currentUser.organizationId;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`,
      );
      const load = await tx.load.findFirst({
        where: { id: loadId, organizationId },
      });
      if (!load) throw new NotFoundException('Load was not found.');
      const canonical = await tx.carrierInvoice.findFirst({
        where: {
          organizationId,
          loadId,
          ...(dto.invoiceId
            ? { id: dto.invoiceId }
            : { originalInvoiceId: null }),
        },
      });
      if (dto.invoiceId && !canonical)
        throw new NotFoundException('Invoice was not found.');
      const effectiveInvoiceId = canonical?.id ?? null;
      const previous = await tx.loadPayment.findFirst({
        where: { organizationId, loadId, idempotencyKey: dto.idempotencyKey },
      });
      if (previous) {
        if (
          !new Prisma.Decimal(previous.amount.toString()).eq(amount) ||
          previous.currency !== load.currency ||
          ((previous.invoiceId ?? null) !== effectiveInvoiceId &&
            !(
              previous.invoiceId === null &&
              !dto.invoiceId &&
              !canonical?.originalInvoiceId
            )) ||
          (dto.paidAt && previous.recordedAt.getTime() !== recordedAt.getTime())
        )
          throw new ConflictException(
            'This payment key was already used for a different payment.',
          );
        return {
          recorded: false,
          message: 'This payment has already been recorded.',
          load: this.serializeLoad(load),
        };
      }
      if (canonical ? !canonical.submittedAt : load.status !== 'INVOICED')
        throw new ConflictException(
          'Payment requires a submitted invoice with an outstanding balance.',
        );
      const payments = await tx.loadPayment.findMany({
        where: { organizationId, loadId },
      });
      const scoped = payments.filter((p) =>
        canonical
          ? p.invoiceId === canonical.id ||
            (!p.invoiceId && !canonical.originalInvoiceId)
          : !p.invoiceId,
      );
      const paid = scoped.reduce(
        (sum, p) => sum.plus(p.amount),
        new Prisma.Decimal(0),
      );
      if (!canonical?.originalInvoiceId && !paid.eq(load.amountPaid ?? 0))
        throw new ConflictException(
          'The payment ledger does not match the original invoice balance. Reconcile existing records.',
        );
      const remaining = new Prisma.Decimal(
        canonical?.totalAmount ?? load.totalRate,
      ).minus(paid);
      if (amount.gt(remaining))
        throw new BadRequestException(
          'Payment exceeds the invoice remaining balance.',
        );
      const cumulative = paid.plus(amount);
      const balance = remaining.minus(amount);
      const status = balance.isZero() ? 'PAID' : 'INVOICED';
      const payment = await tx.loadPayment.create({
        data: {
          organizationId,
          loadId,
          invoiceId: effectiveInvoiceId,
          amount: amount.toFixed(2),
          currency: load.currency,
          idempotencyKey: dto.idempotencyKey,
          recordedByUserId: currentUser.id,
          recordedAt,
        },
      });
      const updated = canonical?.originalInvoiceId
        ? load
        : await tx.load.update({
            where: { id: loadId, organizationId },
            data: {
              amountPaid: cumulative.toFixed(2),
              status,
              paidAt: balance.isZero() ? recordedAt : null,
            },
          });
      await this.loadEvents.recordInTransaction(tx, {
        organizationId,
        loadId,
        type: 'PAYMENT_RECEIVED',
        actorType: currentUser.role === 'OWNER' ? 'OWNER' : 'SYSTEM',
        actorId: currentUser.id,
        actorName: `${currentUser.firstName} ${currentUser.lastName}`,
        occurredAt: recordedAt,
        metadata: {
          paymentId: payment.id,
          invoiceId: effectiveInvoiceId,
          paymentAmount: amount.toFixed(2),
          cumulativeAmountPaid: cumulative.toFixed(2),
          remainingBalance: balance.toFixed(2),
          currency: load.currency,
          invoiceNumber: canonical?.invoiceNumber ?? load.invoiceNumber,
          previousLoadStatus: 'INVOICED',
          loadStatus: status,
        },
      });
      return {
        recorded: true,
        invoice: {
          id: effectiveInvoiceId,
          invoiceNumber: canonical?.invoiceNumber ?? load.invoiceNumber,
          totalAmount: (canonical?.totalAmount ?? load.totalRate).toFixed(2),
          amountPaid: cumulative.toFixed(2),
          remainingBalance: balance.toFixed(2),
          status,
        },
        message:
          status === 'PAID'
            ? 'Payment recorded. Invoice is fully paid.'
            : 'Partial payment recorded.',
        load: this.serializeLoad(updated),
      };
    });
  }
  private serializeLoad(load: InvoiceRow) {
    return {
      id: load.id,

      loadNumber: load.loadNumber,

      brokerName: load.brokerName,

      status: load.status,

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
      remainingBalance: Prisma.Decimal.max(
        0,
        new Prisma.Decimal(load.totalRate.toString()).minus(
          load.amountPaid?.toString() ?? '0',
        ),
      ).toFixed(2),

      paidAt: load.paidAt,
    };
  }

  private getAging(status: LoadStatus, paymentDueAt: Date | null, now: Date) {
    if (status === LoadStatus.PAID) {
      return {
        agingStatus: 'PAID',

        daysUntilDue: null,
      };
    }

    if (!paymentDueAt) {
      return {
        agingStatus: 'OPEN',

        daysUntilDue: null,
      };
    }

    const daysUntilDue =
      (Date.parse(getBusinessDateIso(paymentDueAt)) -
        Date.parse(getBusinessDateIso(now))) /
      MILLISECONDS_PER_DAY;

    if (daysUntilDue < 0) {
      return {
        agingStatus: 'OVERDUE',

        daysUntilDue,
      };
    }

    if (daysUntilDue <= 7) {
      return {
        agingStatus: 'DUE_SOON',

        daysUntilDue,
      };
    }

    return {
      agingStatus: 'OUTSTANDING',

      daysUntilDue,
    };
  }

  /*
   * Money is converted to integer cents
   * rather than summed with JS floating
   * point numbers.
   */
  private parseMoneyToCents(value: string | number) {
    const raw = String(value).trim();

    if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) {
      throw new BadRequestException(`Invalid money value: ${raw}`);
    }

    const negative = raw.startsWith('-');

    const unsigned = negative ? raw.slice(1) : raw;

    const [whole, fraction = ''] = unsigned.split('.');

    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));

    return negative ? -cents : cents;
  }

  private formatCents(cents: bigint) {
    const negative = cents < 0n;

    const absolute = negative ? -cents : cents;

    const whole = absolute / 100n;

    const fraction = (absolute % 100n).toString().padStart(2, '0');

    return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
  }
}

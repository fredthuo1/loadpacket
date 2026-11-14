import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccountsReceivableService } from '../loads/accounts-receivable.service';
import { CreateFinancialTransactionDto, FinanceQuery } from './finance.dto';
import { csv, dateOnly, money } from './finance-domain';
import { guardLegacySettlementPay } from './settlements-domain';
import type {
  FinanceTransaction,
  FinanceOverview,
} from '../../../../packages/api-contracts/finance';

const fields = Prisma.sql`id, date::text, type, effect, category, amount::text, description, source, status,
 load_id::text AS "loadId",load_number AS "loadNumber",driver_id::text AS "driverId",driver_name AS "driverName",
 broker_name AS "brokerName",document_id::text AS "documentId",import_batch_id::text AS "importBatchId",
 import_row_number AS "importRowNumber",source_column AS "sourceColumn",historical_load_id::text AS "historicalLoadId"`;

@Injectable()
export class FinanceService {
  constructor(
    private readonly db: PrismaService,
    private readonly ar: AccountsReceivableService,
  ) {}
  async lookups(user: AuthenticatedUser, q: FinanceQuery) {
    const organizationId = user.organizationId;
    const [loads, drivers, documents] = await Promise.all([
      this.db.load.findMany({
        where: {
          organizationId,
          ...(q.search
            ? {
                loadNumber: {
                  contains: q.search,
                  mode: 'insensitive' as const,
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, loadNumber: true },
      }),
      this.db.driver.findMany({
        where: { organizationId },
        orderBy: { lastName: 'asc' },
        take: 100,
        select: { id: true, firstName: true, lastName: true },
      }),
      this.db.document.findMany({
        where: {
          organizationId,
          ...(user.role !== 'OWNER' ? { driverDocument: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          type: true,
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: { originalFileName: true },
          },
        },
      }),
    ]);
    return { loads, drivers, documents };
  }
  async profitability(user: AuthenticatedUser, q: FinanceQuery) {
    return this.db.$queryRaw<
      {
        broker: string;
        revenue: string;
        expenses: string;
        net: string;
        loads: number;
      }[]
    >(
      Prisma.sql`SELECT COALESCE(broker_name,'Unattributed') AS broker,COALESCE(sum(amount) FILTER(WHERE effect='INCOME'),0)::text AS revenue,COALESCE(sum(amount) FILTER(WHERE effect='EXPENSE'),0)::text AS expenses,sum(CASE WHEN effect='INCOME' THEN amount WHEN effect='EXPENSE' THEN -amount ELSE 0 END)::text AS net,count(DISTINCT COALESCE(load_id,historical_load_id))::int AS loads FROM finance_records WHERE ${this.where(user.organizationId, q)} AND effect<>'PAYMENT' GROUP BY broker_name ORDER BY sum(CASE WHEN effect='INCOME' THEN amount WHEN effect='EXPENSE' THEN -amount ELSE 0 END) DESC LIMIT 100`,
    );
  }
  async payroll(user: AuthenticatedUser, q: FinanceQuery) {
    const filter = this.where(user.organizationId, { ...q, type: undefined });
    const entries = await this.db.$queryRaw<FinanceTransaction[]>(
      Prisma.sql`SELECT ${fields} FROM finance_records WHERE ${filter} AND (type='DRIVER_PAY' OR id IN (SELECT c.id::text FROM financial_transactions c JOIN financial_transactions p ON p.id=c.correction_of_id AND p.organization_id=c.organization_id WHERE c.organization_id=${user.organizationId}::uuid AND p.type='DRIVER_PAY')) ORDER BY driver_name,date,id LIMIT 1001`,
    );
    if (entries.length > 1000)
      throw new BadRequestException(
        'Narrow the pay period to at most 1,000 pay entries.',
      );
    return {
      entries,
      preparedPay: entries
        .reduce((s, r) => s.plus(r.amount), new Prisma.Decimal(0))
        .toFixed(2),
      period: { from: q.from ?? null, to: q.to ?? null },
      status: 'RECORDED',
    };
  }
  async payrollExport(user: AuthenticatedUser, q: FinanceQuery) {
    const pay = await this.payroll(user, q);
    return csv(
      [
        'Record ID',
        'Driver',
        'Driver ID',
        'Period Start',
        'Period End',
        'Date',
        'Load',
        'Type',
        'Recorded Pay USD',
        'Source',
      ],
      pay.entries.map((r) => [
        r.id,
        r.driverName,
        r.driverId,
        q.from,
        q.to,
        r.date,
        r.loadNumber,
        r.type,
        r.amount,
        r.source,
      ]),
    );
  }
  where(org: string, q: FinanceQuery) {
    const parts = [
      Prisma.sql`organization_id=${org}::uuid`,
      Prisma.sql`status='POSTED'`,
      Prisma.sql`currency='USD'`,
    ];
    if (q.from) {
      dateOnly(q.from);
      parts.push(Prisma.sql`date>=${q.from}::date`);
    }
    if (q.to) {
      dateOnly(q.to);
      parts.push(Prisma.sql`date<=${q.to}::date`);
    }
    if (q.from && q.to && q.from > q.to)
      throw new BadRequestException('Start date must not follow end date.');
    if (q.type) parts.push(Prisma.sql`type=${q.type}`);
    if (q.category) parts.push(Prisma.sql`category=${q.category}`);
    if (q.source) parts.push(Prisma.sql`source=${q.source}`);
    if (q.loadId) parts.push(Prisma.sql`load_id=${q.loadId}::uuid`);
    if (q.driverId) parts.push(Prisma.sql`driver_id=${q.driverId}::uuid`);
    if (q.importBatchId)
      parts.push(Prisma.sql`import_batch_id=${q.importBatchId}::uuid`);
    if (q.search)
      parts.push(
        Prisma.sql`(strpos(lower(concat_ws(' ',description,load_number,broker_name,driver_name)),lower(${q.search}))>0)`,
      );
    return Prisma.join(parts, ' AND ');
  }
  async transactions(user: AuthenticatedUser, q: FinanceQuery) {
    const where = this.where(user.organizationId, q);
    const direction =
      q.direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const sort = q.sort === 'amount' ? Prisma.sql`amount` : Prisma.sql`date`;
    const [items, counts] = await Promise.all([
      this.db.$queryRaw<FinanceTransaction[]>(
        Prisma.sql`SELECT ${fields} FROM finance_records WHERE ${where} ORDER BY ${sort} ${direction},id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      ),
      this.db.$queryRaw<{ count: number }[]>(
        Prisma.sql`SELECT count(*)::int AS count FROM finance_records WHERE ${where}`,
      ),
    ]);
    return {
      items,
      total: counts[0].count,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async detail(user: AuthenticatedUser, id: string) {
    if (!/^(?:(?:load|payment|invoice|settlement):)?[0-9a-f-]{36}$/i.test(id))
      throw new NotFoundException('Financial record not found.');
    const rows = await this.db.$queryRaw<FinanceTransaction[]>(
      Prisma.sql`SELECT ${fields} FROM finance_records WHERE organization_id=${user.organizationId}::uuid AND id=${id}`,
    );
    if (!rows[0]) throw new NotFoundException('Financial record not found.');
    const record = rows[0];
    const audit = await this.db.financialAuditEvent.findMany({
      where: {
        organizationId: user.organizationId,
        recordId: id.replace(/^(load|payment|invoice|settlement):/, ''),
      },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { firstName: true, lastName: true } } },
    });
    const batch = record.importBatchId
      ? await this.db.financialImportBatch.findFirst({
          where: {
            id: record.importBatchId,
            organizationId: user.organizationId,
          },
          select: { fileName: true, fileChecksum: true },
        })
      : null;
    const entry = !id.includes(':')
      ? await this.db.financialTransaction.findFirst({
          where: { id, organizationId: user.organizationId },
          select: {
            memo: true,
            vendorName: true,
            correctionOfId: true,
            createdAt: true,
            createdBy: { select: { firstName: true, lastName: true } },
          },
        })
      : null;
    return { record, audit, batch, entry };
  }
  async create(user: AuthenticatedUser, dto: CreateFinancialTransactionDto) {
    const amount = money(dto.amount, dto.type === 'ADJUSTMENT');
    const date = dateOnly(dto.transactionDate);
    if (new Prisma.Decimal(amount).isZero())
      throw new BadRequestException('Amount must not be zero.');
    if (!dto.category.trim() || !dto.description.trim())
      throw new BadRequestException('Category and description are required.');
    if (dto.type === 'DRIVER_PAY' && !dto.driverId)
      throw new BadRequestException('Select a driver for driver pay.');
    if (
      dto.type === 'ADJUSTMENT' &&
      (!dto.effect || !dto.correctionOfId || !dto.memo?.trim())
    )
      throw new BadRequestException(
        'Adjustments require an original record, effect and reason.',
      );
    if (dto.type !== 'ADJUSTMENT' && dto.correctionOfId)
      throw new BadRequestException('Use an adjustment to correct a record.');
    if (dto.type === 'PAYMENT' && dto.loadId) {
      if (
        dto.driverId ||
        dto.documentId ||
        dto.memo ||
        dto.vendorName ||
        dto.brokerName ||
        (dto.effect && dto.effect !== 'PAYMENT')
      )
        throw new BadRequestException(
          'Load payments use the invoice details. Use Accounts Receivable for invoice review; extra associations and notes are not supported on receipts.',
        );
      // Existing payment ledger owns invoice balance changes and idempotency.
      return this.ar.markPaid(user, dto.loadId, {
        amountPaid: amount,
        paidAt: date.toISOString(),
        idempotencyKey: dto.idempotencyKey,
      });
    }
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.organizationId},0))`;
      const old = await tx.financialTransaction.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: user.organizationId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      const effect =
        dto.type === 'ADJUSTMENT'
          ? dto.effect!
          : dto.type === 'DRIVER_PAY'
            ? 'EXPENSE'
            : dto.type;
      if (dto.type !== 'ADJUSTMENT' && dto.effect && dto.effect !== effect)
        throw new BadRequestException('Effect must match transaction type.');
      if (old) {
        if (
          old.amount.toFixed(2) !== amount ||
          old.type !== dto.type ||
          old.transactionDate.getTime() !== date.getTime() ||
          old.description !== dto.description.trim() ||
          old.category !== dto.category.trim() ||
          old.loadId !== (dto.loadId ?? null) ||
          old.driverId !== (dto.driverId ?? null) ||
          old.documentId !== (dto.documentId ?? null) ||
          old.memo !== (dto.memo ?? null) ||
          old.effect !== effect ||
          old.correctionOfId !== (dto.correctionOfId ?? null) ||
          old.vendorName !== (dto.vendorName ?? null) ||
          old.brokerName !== (dto.brokerName ?? null)
        )
          throw new ConflictException(
            'This request identifier was already used for different details.',
          );
        return old;
      }
      if (
        dto.loadId &&
        !(await tx.load.findFirst({
          where: { id: dto.loadId, organizationId: user.organizationId },
        }))
      )
        throw new NotFoundException('Load not found.');
      if (
        dto.driverId &&
        !(await tx.driver.findFirst({
          where: { id: dto.driverId, organizationId: user.organizationId },
        }))
      )
        throw new NotFoundException('Driver not found.');
      if (dto.documentId) {
        const document = await tx.document.findFirst({
          where: { id: dto.documentId, organizationId: user.organizationId },
          include: { driverDocument: true },
        });
        if (!document || (document.driverDocument && user.role !== 'OWNER'))
          throw new NotFoundException('Supporting document not found.');
      }
      let historicalLoadId: string | null = null;
      let driverPay = dto.type === 'DRIVER_PAY';
      if (dto.correctionOfId) {
        const original = await tx.financialTransaction.findFirst({
          where: {
            id: dto.correctionOfId,
            organizationId: user.organizationId,
            status: 'POSTED',
          },
        });
        if (
          !original ||
          original.type === 'ADJUSTMENT' ||
          original.effect !== effect ||
          original.loadId !== (dto.loadId ?? null) ||
          original.driverId !== (dto.driverId ?? null)
        )
          throw new BadRequestException(
            'Correction must reference an original entry and retain its effect, load and driver.',
          );
        historicalLoadId = original.historicalLoadId;
        driverPay = original.type === 'DRIVER_PAY';
      }
      if (driverPay)
        await guardLegacySettlementPay(
          tx,
          user.organizationId,
          date,
          dto.driverId,
          dto.loadId,
        );
      if (dto.loadId && effect === 'INCOME') {
        await tx.$queryRaw`SELECT id FROM loads WHERE id=${dto.loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
        if (
          await tx.carrierInvoice.findFirst({
            where: { loadId: dto.loadId, organizationId: user.organizationId },
          })
        )
          throw new ConflictException(
            'Use reviewed invoice charges for this load. Manual income could duplicate canonical invoice revenue.',
          );
      }
      const record = await tx.financialTransaction.create({
        data: {
          ...dto,
          amount,
          effect,
          historicalLoadId,
          transactionDate: date,
          category: dto.category.trim(),
          description: dto.description.trim(),
          organizationId: user.organizationId,
          createdById: user.id,
        },
      });
      await tx.financialAuditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action:
            dto.type === 'ADJUSTMENT'
              ? 'ADJUSTMENT_CREATED'
              : 'TRANSACTION_CREATED',
          recordType: 'TRANSACTION',
          recordId: record.id,
          summary:
            dto.type === 'ADJUSTMENT'
              ? 'Financial correction recorded'
              : 'Financial entry recorded',
          details: {
            amount,
            effect,
            correctionOfId: dto.correctionOfId ?? null,
            reason: dto.memo ?? null,
          },
        },
      });
      return record;
    });
  }
  async aging(user: AuthenticatedUser) {
    const current = await this.ar.getDashboard(user);
    const historical = await this.db.historicalLoadRecord.findMany({
      where: { organizationId: user.organizationId, status: 'POSTED' },
      select: {
        id: true,
        loadNumber: true,
        invoiceNumber: true,
        brokerName: true,
        grossRevenue: true,
        dueDate: true,
        paymentStatus: true,
        transactions: {
          where: { status: 'POSTED', effect: { in: ['INCOME', 'PAYMENT'] } },
          select: { amount: true, effect: true },
        },
      },
    });
    const invoices = [
      ...current.invoices
        .filter((i) => i.currency === 'USD')
        .map((i) => ({
          id: i.id,
          loadNumber: i.loadNumber,
          invoiceNumber: i.invoiceNumber,
          brokerName: i.brokerName,
          balance: i.remainingBalance,
          dueDate: i.paymentDueAt,
          source: 'LOADPACKET',
        })),
      ...historical
        .filter((h) => h.invoiceNumber)
        .map((h) => ({
          id: h.id,
          loadNumber: h.loadNumber,
          invoiceNumber: h.invoiceNumber,
          brokerName: h.brokerName,
          balance: Prisma.Decimal.max(
            0,
            h.transactions
              .filter((p) => p.effect === 'INCOME')
              .reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0))
              .minus(
                h.transactions
                  .filter((p) => p.effect === 'PAYMENT')
                  .reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0)),
              ),
          ).toFixed(2),
          dueDate: h.dueDate,
          source: 'IMPORT',
        })),
    ];
    const today = dateOnly(new Date().toISOString().slice(0, 10)).getTime();
    const buckets = new Map(
      ['Current', '1–30', '31–60', '61–90', '90+', 'Due date missing'].map(
        (bucket) => [
          bucket,
          { bucket, amount: new Prisma.Decimal(0), count: 0 },
        ],
      ),
    );
    for (const i of invoices) {
      if (new Prisma.Decimal(i.balance).lte(0)) continue;
      const age = i.dueDate
        ? Math.floor(
            (today - dateOnly(i.dueDate.toISOString().slice(0, 10)).getTime()) /
              86400000,
          )
        : null;
      const name =
        age === null
          ? 'Due date missing'
          : age <= 0
            ? 'Current'
            : age <= 30
              ? '1–30'
              : age <= 60
                ? '31–60'
                : age <= 90
                  ? '61–90'
                  : '90+';
      const b = buckets.get(name)!;
      b.amount = b.amount.plus(i.balance);
      b.count++;
    }
    return {
      invoices,
      buckets: [...buckets.values()].map((b) => ({
        ...b,
        amount: b.amount.toFixed(2),
      })),
      outstanding: invoices
        .reduce((s, i) => s.plus(i.balance), new Prisma.Decimal(0))
        .toFixed(2),
    };
  }
  async overview(
    user: AuthenticatedUser,
    q: FinanceQuery,
  ): Promise<FinanceOverview> {
    const where = this.where(user.organizationId, q);
    const [totals, trend, categories, aging] = await Promise.all([
      this.db.$queryRaw<
        {
          revenue: string;
          expenses: string;
          net: string;
          collected: string;
          transactionCount: number;
        }[]
      >(
        Prisma.sql`SELECT COALESCE(sum(amount) FILTER(WHERE effect='INCOME'),0)::text AS revenue,COALESCE(sum(amount) FILTER(WHERE effect='EXPENSE'),0)::text AS expenses,COALESCE(sum(CASE WHEN effect='INCOME' THEN amount WHEN effect='EXPENSE' THEN -amount ELSE 0 END),0)::text AS net,COALESCE(sum(amount) FILTER(WHERE effect='PAYMENT'),0)::text AS collected,count(*)::int AS "transactionCount" FROM finance_records WHERE ${where}`,
      ),
      this.db.$queryRaw<FinanceOverview['trend']>(
        Prisma.sql`SELECT to_char(date,'YYYY-MM') AS month,COALESCE(sum(amount) FILTER(WHERE effect='INCOME'),0)::text AS revenue,COALESCE(sum(amount) FILTER(WHERE effect='EXPENSE'),0)::text AS expenses,sum(CASE WHEN effect='INCOME' THEN amount WHEN effect='EXPENSE' THEN -amount ELSE 0 END)::text AS net FROM finance_records WHERE ${where} GROUP BY month ORDER BY month`,
      ),
      this.db.$queryRaw<FinanceOverview['categories']>(
        Prisma.sql`SELECT category,effect,sum(amount)::text AS amount FROM finance_records WHERE ${where} GROUP BY category,effect ORDER BY effect,category`,
      ),
      this.aging(user),
    ]);
    const counts = await this.db.$queryRaw<
      { count: number; revenue: string }[]
    >(
      Prisma.sql`SELECT count(DISTINCT COALESCE(load_id,historical_load_id))::int AS count,COALESCE(sum(amount),0)::text AS revenue FROM finance_records WHERE ${where} AND effect='INCOME' AND COALESCE(load_id,historical_load_id) IS NOT NULL`,
    );
    return {
      ...totals[0],
      outstanding: aging.outstanding,
      aging: aging.buckets,
      trend,
      categories,
      recordedLoads: counts[0].count,
      averageRevenuePerLoad: counts[0].count
        ? new Prisma.Decimal(counts[0].revenue).div(counts[0].count).toFixed(2)
        : null,
      revenuePerMile: null,
      costPerMile: null,
      profitPerMile: null,
    };
  }
  async export(user: AuthenticatedUser, q: FinanceQuery) {
    const count = await this.transactions(user, { ...q, page: 1, pageSize: 1 });
    if (count.total > 10000)
      throw new BadRequestException(
        'Narrow the date range to export at most 10,000 records.',
      );
    const rows = await this.db.$queryRaw<FinanceTransaction[]>(
      Prisma.sql`SELECT ${fields} FROM finance_records WHERE ${this.where(user.organizationId, q)} ORDER BY date,id LIMIT 10000`,
    );
    return csv(
      [
        'Record ID',
        'Date',
        'Type',
        'Category',
        'Description',
        'Load',
        'Driver',
        'Source',
        'Amount USD',
        'Import Batch',
        'Import Row',
        'Original Column',
      ],
      rows.map((r) => [
        r.id,
        r.date,
        r.type,
        r.category,
        r.description,
        r.loadNumber,
        r.driverName,
        r.source,
        r.amount,
        r.importBatchId,
        r.importRowNumber,
        r.sourceColumn,
      ]),
    );
  }
  async audit(user: AuthenticatedUser, q: FinanceQuery) {
    if (q.from) dateOnly(q.from);
    if (q.to) dateOnly(q.to);
    const filter = Prisma.sql`organization_id=${user.organizationId}::uuid ${q.from ? Prisma.sql`AND created_at>=${q.from}::date` : Prisma.empty} ${q.to ? Prisma.sql`AND created_at<${q.to}::date+interval '1 day'` : Prisma.empty}`;
    return this.db.$queryRaw<
      {
        id: string;
        action: string;
        recordId: string;
        summary: string;
        createdAt: Date;
        actor: string;
      }[]
    >(
      Prisma.sql`SELECT * FROM (SELECT a.id::text,a.action,a.record_id::text AS "recordId",a.summary,a.created_at AS "createdAt",u.first_name||' '||u.last_name AS actor FROM financial_audit_events a JOIN users u ON u.id=a.actor_id AND u.organization_id=a.organization_id WHERE a.organization_id=${user.organizationId}::uuid ${q.from ? Prisma.sql`AND a.created_at>=${q.from}::date` : Prisma.empty} ${q.to ? Prisma.sql`AND a.created_at<${q.to}::date+interval '1 day'` : Prisma.empty} UNION ALL SELECT id::text,type::text,load_id::text,type::text,created_at,actor_name FROM load_events WHERE ${filter} AND type IN ('PAYMENT_RECEIVED','INVOICE_CREATED','BILLING_SUBMITTED')) entries ORDER BY "createdAt" DESC,id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    );
  }
  async loadSummary(user: AuthenticatedUser, id: string) {
    const load = await this.db.load.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        carrierInvoices: true,
        chargeOpportunities: {
          where: { status: 'APPROVED' },
        },
      },
    });
    if (!load) throw new NotFoundException('Load not found.');
    const manual = await this.db.financialTransaction.groupBy({
      by: ['effect', 'category'],
      where: {
        organizationId: user.organizationId,
        loadId: id,
        status: 'POSTED',
      },
      _sum: { amount: true },
    });
    const additional = manual
      .filter((r) => r.effect === 'INCOME')
      .reduce((s, r) => s.plus(r._sum.amount ?? 0), new Prisma.Decimal(0));
    const expense = manual
      .filter((r) => r.effect === 'EXPENSE')
      .reduce((s, r) => s.plus(r._sum.amount ?? 0), new Prisma.Decimal(0));
    const submitted = load.carrierInvoices.filter((i) => i.submittedAt);
    const billed = submitted.reduce(
      (sum, i) => sum.plus(i.totalAmount),
      new Prisma.Decimal(0),
    );
    const recognizedBase = load.carrierInvoices.length
      ? billed
      : load.totalRate;
    return {
      loadId: id,
      loadNumber: load.loadNumber,
      linehaul: load.linehaul?.toFixed(2) ?? null,
      fuelSurcharge: load.fuelSurcharge?.toFixed(2) ?? null,
      agreedRate: load.totalRate.toFixed(2),
      additionalRevenue: additional
        .plus(Prisma.Decimal.max(0, billed.minus(load.totalRate)))
        .toFixed(2),
      grossRevenue: recognizedBase.plus(additional).toFixed(2),
      expenses: expense.toFixed(2),
      net: recognizedBase.plus(additional).minus(expense).toFixed(2),
      categories: manual.map((r) => ({
        category: r.category,
        effect: r.effect,
        amount: r._sum.amount?.toFixed(2) ?? '0.00',
      })),
      miles: null,
      unrecognizedCharges: load.chargeOpportunities.map((c) => ({
        type: c.type,
        amount: c.amount?.toFixed(2),
        status: c.status,
      })),
    };
  }
}

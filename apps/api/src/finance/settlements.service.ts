import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DocumentStorage } from '../documents/document-storage';
import { dateOnly, money } from './finance-domain';
import {
  settlementDay,
  settlementFinanceLock,
  settlementPeriod,
  settlementTotals,
} from './settlements-domain';
import {
  CancelSettlementDto,
  EditSettlementDto,
  PrepareSettlementDto,
  SettlementCommand,
  SettlementPaymentDto,
  SettlementQuery,
} from './settlements.dto';
import type {
  SettlementItem,
  SettlementTotals,
  SettlementView,
  SettlementReceipt,
} from '../../../../packages/api-contracts/settlements';

const include = {
  driver: true,
  work: true,
  items: { orderBy: { position: 'asc' as const } },
  payments: { orderBy: { createdAt: 'asc' as const } },
  adjustments: { orderBy: { createdAt: 'asc' as const } },
  documentVersion: true,
} satisfies Prisma.DriverSettlementInclude;
type Row = Prisma.DriverSettlementGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;
type Source = {
  loadId: string;
  loadNumber: string;
  completionEventId: string;
  completedAt: string;
  assignmentId: string;
  assignedAt: string;
  driverId: string;
};
type Snapshot = {
  version: 1;
  driverName: string;
  organizationName: string;
  totals: SettlementTotals;
  items: SettlementItem[];
  work: Source[];
  policy: string;
  statementChecksum?: string;
};
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const hash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

@Injectable()
export class SettlementsService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: DocumentStorage,
  ) {}
  private authorize(user: AuthenticatedUser) {
    if (!['OWNER', 'BACK_OFFICE'].includes(user.role))
      throw new ForbiddenException(
        'Settlement access requires Owner or Back Office permission.',
      );
  }
  private async row(tx: Tx, organizationId: string, id: string) {
    const row = await tx.driverSettlement.findFirst({
      where: { id, organizationId },
      include,
    });
    if (!row) throw new NotFoundException('Settlement not found.');
    return row;
  }
  private async view(tx: Tx, row: Row): Promise<SettlementView> {
    const snapshot = row.snapshot as unknown as Snapshot;
    const root = row.originalSettlementId
      ? await this.row(tx, row.organizationId, row.originalSettlementId)
      : row;
    const approvedObligation = root.adjustments
      .filter((a) => a.state === 'APPROVED')
      .reduce((sum, a) => sum.plus(a.netAmount), root.netAmount);
    const obligation =
      root.state === 'APPROVED' ? approvedObligation : new Prisma.Decimal(0);
    const paid = root.payments.reduce(
      (sum, p) => sum.plus(p.amount),
      new Prisma.Decimal(0),
    );
    const remaining = obligation.minus(paid);
    const history = await tx.financialAuditEvent.findMany({
      where: {
        organizationId: row.organizationId,
        recordType: 'DRIVER_SETTLEMENT',
        recordId: row.id,
      },
      orderBy: { createdAt: 'asc' },
      select: { action: true, actorId: true, createdAt: true },
    });
    return {
      id: row.id,
      driverId: row.driverId,
      driverName: snapshot.driverName,
      kind: row.kind,
      state: row.state,
      revision: row.revision,
      originalSettlementId: row.originalSettlementId,
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEnd: row.periodEnd.toISOString().slice(0, 10),
      currency: row.currency,
      totals: snapshot.totals,
      effectiveObligation: obligation.toFixed(2),
      recordedPayments: paid.toFixed(2),
      remainingPayable: remaining.toFixed(2),
      paymentStatus:
        row.state !== 'APPROVED'
          ? 'NOT_APPROVED'
          : remaining.eq(0)
            ? paid.eq(0)
              ? 'CLOSED_BY_ADJUSTMENT'
              : 'PAID'
            : paid.gt(0)
              ? 'PARTIALLY_PAID'
              : 'UNPAID',
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      cancellationReason: row.cancellationReason,
      items: snapshot.items,
      work: snapshot.work,
      documentVersionId: row.documentVersionId,
      payments: root.payments.map((p) => ({
        id: p.id,
        amount: p.amount.toFixed(2),
        paymentDate: p.paymentDate.toISOString().slice(0, 10),
        method: p.method,
        reference: p.reference,
        createdAt: p.createdAt.toISOString(),
      })),
      adjustments: root.adjustments.map((a) => ({
        id: a.id,
        state: a.state,
        amount: a.netAmount.toFixed(2),
        approvedAt: a.approvedAt?.toISOString() ?? null,
      })),
      history: history.map((h) => ({
        ...h,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }
  async list(user: AuthenticatedUser) {
    this.authorize(user);
    const rows = await this.db.driverSettlement.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include,
    });
    return Promise.all(rows.map((row) => this.view(this.db, row)));
  }
  async detail(user: AuthenticatedUser, id: string) {
    this.authorize(user);
    return this.view(this.db, await this.row(this.db, user.organizationId, id));
  }

  private async source(
    tx: Tx,
    organizationId: string,
    driverId: string,
    loadId: string,
    start: string,
    end: string,
  ): Promise<Source> {
    const load = await tx.load.findFirst({
      where: { id: loadId, organizationId },
      include: {
        assignments: true,
        events: { where: { type: 'LOAD_COMPLETED' } },
      },
    });
    const assignment = load?.assignments[0],
      event = load?.events[0];
    const metadata = event?.metadata as Record<string, unknown> | undefined;
    if (
      !load ||
      load.currency !== 'USD' ||
      !['DELIVERED', 'PAYMENT_READY', 'INVOICED', 'PAID'].includes(
        load.status,
      ) ||
      load.assignments.length !== 1 ||
      load.events.length !== 1 ||
      !assignment ||
      assignment.status !== 'COMPLETED' ||
      assignment.driverId !== driverId ||
      !assignment.completedAt ||
      !event ||
      metadata?.assignmentId !== assignment.id ||
      event.occurredAt.getTime() !== assignment.completedAt.getTime() ||
      settlementDay(event.occurredAt) < start ||
      settlementDay(event.occurredAt) > end
    )
      throw new ConflictException(
        'Selected work is incomplete, outside the period, cancelled, or has ambiguous Driver history.',
      );
    return {
      loadId,
      loadNumber: load.loadNumber,
      completionEventId: event.id,
      completedAt: event.occurredAt.toISOString(),
      assignmentId: assignment.id,
      assignedAt: assignment.assignedAt.toISOString(),
      driverId,
    };
  }
  private async legacy(
    tx: Tx,
    organizationId: string,
    driverId: string,
    start: Date,
    end: Date,
    loadIds: string[],
  ) {
    const ids = loadIds.length
      ? Prisma.join(loadIds.map((id) => Prisma.sql`${id}::uuid`))
      : Prisma.sql`NULL::uuid`;
    const conflicts = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT t.id FROM financial_transactions t LEFT JOIN financial_transactions p ON p.id=t.correction_of_id AND p.organization_id=t.organization_id
      WHERE t.organization_id=${organizationId}::uuid AND t.status='POSTED' AND (t.type='DRIVER_PAY' OR p.type='DRIVER_PAY')
      AND (t.load_id IN (${ids}) OR (t.transaction_date BETWEEN ${start}::date AND ${end}::date AND (t.driver_id=${driverId}::uuid OR t.driver_id IS NULL))) LIMIT 1`);
    if (conflicts.length)
      throw new ConflictException(
        'Legacy Driver pay overlaps this work or period. Reconciliation is required before settlement; no payment has been assumed.',
      );
  }
  async eligible(user: AuthenticatedUser, query: SettlementQuery) {
    this.authorize(user);
    const { from, to } = settlementPeriod(query.periodStart, query.periodEnd);
    const driver = await this.db.driver.findFirst({
      where: { id: query.driverId, organizationId: user.organizationId },
    });
    if (!driver) throw new NotFoundException('Driver not found.');
    await this.legacy(this.db, user.organizationId, driver.id, from, to, []);
    const loads = await this.db.load.findMany({
      where: {
        organizationId: user.organizationId,
        assignments: { some: { driverId: driver.id, status: 'COMPLETED' } },
        settlementWork: { none: { releasedAt: null } },
      },
      orderBy: { createdAt: 'desc' },
      take: 101,
    });
    const work: Source[] = [];
    for (const load of loads.slice(0, 100)) {
      try {
        const source = await this.source(
          this.db,
          user.organizationId,
          driver.id,
          load.id,
          query.periodStart,
          query.periodEnd,
        );
        await this.legacy(this.db, user.organizationId, driver.id, from, to, [
          load.id,
        ]);
        work.push(source);
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    return {
      work,
      limited: loads.length > 100,
      driverName: `${driver.firstName} ${driver.lastName}`,
      inactive: driver.status === 'INACTIVE',
    };
  }
  private async snapshot(
    tx: Tx,
    user: AuthenticatedUser,
    driverId: string,
    start: string,
    end: string,
    loadIds: string[],
    items: SettlementItem[],
    adjustment: boolean,
  ): Promise<Snapshot> {
    const totals = settlementTotals(items, loadIds, adjustment);
    const driver = await tx.driver.findFirst({
      where: { id: driverId, organizationId: user.organizationId },
    });
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
    });
    if (!driver) throw new NotFoundException('Driver not found.');
    const work: Source[] = [];
    for (const id of [...loadIds].sort())
      work.push(
        await this.source(tx, user.organizationId, driverId, id, start, end),
      );
    await this.legacy(
      tx,
      user.organizationId,
      driverId,
      dateOnly(start),
      dateOnly(end),
      loadIds,
    );
    return {
      version: 1,
      driverName: `${driver.firstName} ${driver.lastName}`,
      organizationName: org.name,
      totals,
      items: items.map((i) => ({
        ...i,
        amount: money(i.amount, adjustment),
        description: i.description.trim(),
      })),
      work,
      policy:
        'Explicit reviewed USD compensation; America/Chicago calendar; recorded payments are not bank execution.',
    };
  }
  private async replaceItems(tx: Tx, row: Row, snapshot: Snapshot) {
    const workIds = new Map<string, string>();
    for (const work of row.work) {
      if (
        !snapshot.work.some((w) => w.loadId === work.loadId) &&
        !work.releasedAt
      )
        await tx.driverSettlementWork.update({
          where: { id: work.id },
          data: { releasedAt: new Date() },
        });
    }
    for (const source of snapshot.work) {
      const previous = row.work.find((w) => w.loadId === source.loadId);
      if (previous && hash(previous.sourceSnapshot) !== hash(source))
        throw new ConflictException(
          'Retained work evidence changed; cancel this draft and prepare a new settlement.',
        );
      const work = previous
        ? await tx.driverSettlementWork.update({
            where: { id: previous.id },
            data: { releasedAt: null },
          })
        : await tx.driverSettlementWork.create({
            data: {
              organizationId: row.organizationId,
              settlementId: row.id,
              loadId: source.loadId,
              completionEventId: source.completionEventId,
              sourceSnapshot: json(source),
            },
          });
      workIds.set(source.loadId, work.id);
    }
    await tx.driverSettlementItem.deleteMany({
      where: { organizationId: row.organizationId, settlementId: row.id },
    });
    for (const [position, item] of snapshot.items.entries())
      await tx.driverSettlementItem.create({
        data: {
          organizationId: row.organizationId,
          settlementId: row.id,
          position: position + 1,
          kind: item.kind,
          workId: item.loadId ? workIds.get(item.loadId)! : null,
          amount: item.amount,
          description: item.description,
          snapshot: json(item),
        },
      });
  }

  private async command(
    user: AuthenticatedUser,
    action: string,
    id: string | null,
    dto: { idempotencyKey: string },
    driverId: string | undefined,
    run: (tx: Tx, row: Row | null, uploads: string[]) => Promise<string>,
  ): Promise<SettlementReceipt> {
    this.authorize(user);
    const requestHash = hash({ actorId: user.id, action, id, dto });
    const uploads: string[] = [];
    try {
      return await this.db.$transaction(
        async (tx) => {
          await settlementFinanceLock(tx, user.organizationId);
          const prior = await tx.financialAuditEvent.findFirst({
            where: {
              organizationId: user.organizationId,
              recordType: 'DRIVER_SETTLEMENT',
              details: { path: ['requestKey'], equals: dto.idempotencyKey },
            },
          });
          if (prior) {
            const details = prior.details as {
              requestHash: string;
              response: unknown;
            };
            if (details.requestHash !== requestHash)
              throw new ConflictException(
                'Idempotency key was already used for different settlement details.',
              );
            return details.response as SettlementReceipt;
          }
          let row = id ? await this.row(tx, user.organizationId, id) : null;
          const targetDriver = row?.driverId ?? driverId;
          const locked = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM drivers WHERE id=${targetDriver}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
          if (!locked.length) throw new NotFoundException('Driver not found.');
          const original =
            row?.originalSettlementId ??
            (dto as Partial<PrepareSettlementDto>).originalSettlementId;
          if (original)
            await tx.$queryRaw`SELECT id FROM driver_settlements WHERE id=${original}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
          if (row) {
            await tx.$queryRaw`SELECT id FROM driver_settlements WHERE id=${row.id}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
            row = await this.row(tx, user.organizationId, row.id);
          }
          const selected = new Set([
            ...(row?.work.map((w) => w.loadId) ?? []),
            ...((dto as Partial<PrepareSettlementDto>).loadIds ?? []),
          ]);
          for (const lid of [...selected].sort())
            await tx.$queryRaw`SELECT id FROM loads WHERE id=${lid}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
          const before = row
            ? {
                state: row.state,
                revision: row.revision,
                snapshot: row.snapshot,
              }
            : null;
          const resultId = await run(tx, row, uploads);
          const after = await this.row(tx, user.organizationId, resultId);
          const v = await this.view(tx, after);
          const response: SettlementReceipt = {
            id: v.id,
            driverId: v.driverId,
            driverName: v.driverName,
            kind: v.kind,
            state: v.state,
            revision: v.revision,
            originalSettlementId: v.originalSettlementId,
            periodStart: v.periodStart,
            periodEnd: v.periodEnd,
            currency: v.currency,
            totals: v.totals,
            effectiveObligation: v.effectiveObligation,
            recordedPayments: v.recordedPayments,
            remainingPayable: v.remainingPayable,
            paymentStatus: v.paymentStatus,
            reviewedAt: v.reviewedAt,
            approvedAt: v.approvedAt,
            cancellationReason: v.cancellationReason,
            documentVersionId: v.documentVersionId,
          };
          const createdAt = new Date();
          await tx.financialAuditEvent.create({
            data: {
              organizationId: user.organizationId,
              actorId: user.id,
              action,
              recordId: resultId,
              recordType: 'DRIVER_SETTLEMENT',
              summary: 'Driver settlement command recorded',
              createdAt,
              details: json({
                version: 1,
                requestKey: dto.idempotencyKey,
                requestHash,
                action,
                revision: response.revision,
                before,
                after: {
                  state: after.state,
                  revision: after.revision,
                  snapshot: after.snapshot,
                },
                response,
              }),
            },
          });
          return response;
        },
        { timeout: 30000, maxWait: 10000 },
      );
    } catch (error) {
      // Never remove evidence after an uncertain commit. Read-after-error is required.
      for (const key of uploads) {
        try {
          const committed = await this.db.documentVersion.findFirst({
            where: { organizationId: user.organizationId, storageKey: key },
          });
          if (!committed) await this.storage.removeUncommitted(key);
        } catch {
          /* Keep private artifact for reconciliation if database/storage is unavailable. */
        }
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2003', 'P2004', 'P2010', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'Settlement changed or violates a financial constraint. Refresh and retry the same request key.',
        );
      throw error;
    }
  }
  prepare(user: AuthenticatedUser, dto: PrepareSettlementDto) {
    settlementPeriod(dto.periodStart, dto.periodEnd);
    if (dto.currency !== 'USD')
      throw new BadRequestException('Only USD settlements are supported.');
    return this.command(
      user,
      'SETTLEMENT_PREPARED',
      null,
      dto,
      dto.driverId,
      async (tx) => {
        if (dto.originalSettlementId) {
          const root = await this.row(
            tx,
            user.organizationId,
            dto.originalSettlementId,
          );
          if (
            root.state !== 'APPROVED' ||
            root.kind !== 'BASE' ||
            root.driverId !== dto.driverId ||
            root.periodStart.toISOString().slice(0, 10) !== dto.periodStart ||
            root.periodEnd.toISOString().slice(0, 10) !== dto.periodEnd
          )
            throw new BadRequestException(
              'Adjustment must retain the approved original Driver and period.',
            );
        }
        const snapshot = await this.snapshot(
          tx,
          user,
          dto.driverId,
          dto.periodStart,
          dto.periodEnd,
          dto.loadIds,
          dto.items,
          !!dto.originalSettlementId,
        );
        const row = await tx.driverSettlement.create({
          data: {
            organizationId: user.organizationId,
            driverId: dto.driverId,
            kind: dto.originalSettlementId ? 'ADJUSTMENT' : 'BASE',
            originalSettlementId: dto.originalSettlementId,
            periodStart: dateOnly(dto.periodStart),
            periodEnd: dateOnly(dto.periodEnd),
            currency: 'USD',
            netAmount: snapshot.totals.net,
            snapshot: json(snapshot),
            createdById: user.id,
          },
          include,
        });
        await this.replaceItems(tx, row, snapshot);
        return row.id;
      },
    );
  }
  private revision(row: Row, dto: SettlementCommand) {
    if (row.revision !== dto.revision)
      throw new ConflictException(
        'This settlement revision is stale. Refresh before continuing.',
      );
  }
  edit(user: AuthenticatedUser, id: string, dto: EditSettlementDto) {
    return this.command(
      user,
      'SETTLEMENT_EDITED',
      id,
      dto,
      undefined,
      async (tx, row) => {
        this.revision(row!, dto);
        if (!['DRAFT', 'REVIEWED'].includes(row!.state))
          throw new ConflictException(
            'Only unapproved settlements may be edited.',
          );
        const snapshot = await this.snapshot(
          tx,
          user,
          row!.driverId,
          row!.periodStart.toISOString().slice(0, 10),
          row!.periodEnd.toISOString().slice(0, 10),
          dto.loadIds,
          dto.items,
          row!.kind === 'ADJUSTMENT',
        );
        await tx.driverSettlement.update({
          where: { id },
          data: {
            state: 'DRAFT',
            revision: { increment: 1 },
            reviewedById: null,
            reviewedAt: null,
            reviewedRevision: null,
            snapshot: json(snapshot),
            netAmount: snapshot.totals.net,
          },
        });
        await this.replaceItems(tx, row!, snapshot);
        return id;
      },
    );
  }
  private async revalidate(tx: Tx, row: Row) {
    const snapshot = row.snapshot as unknown as Snapshot;
    await this.legacy(
      tx,
      row.organizationId,
      row.driverId,
      row.periodStart,
      row.periodEnd,
      snapshot.work.map((w) => w.loadId),
    );
    for (const work of snapshot.work) {
      const source = await this.source(
        tx,
        row.organizationId,
        row.driverId,
        work.loadId,
        row.periodStart.toISOString().slice(0, 10),
        row.periodEnd.toISOString().slice(0, 10),
      );
      if (hash(source) !== hash(work))
        throw new ConflictException(
          'Work evidence changed. Edit and review the settlement again.',
        );
    }
  }
  review(user: AuthenticatedUser, id: string, dto: SettlementCommand) {
    return this.command(
      user,
      'SETTLEMENT_REVIEWED',
      id,
      dto,
      undefined,
      async (tx, row) => {
        this.revision(row!, dto);
        if (row!.state !== 'DRAFT')
          throw new ConflictException('Only drafts can be reviewed.');
        await this.revalidate(tx, row!);
        await tx.driverSettlement.update({
          where: { id },
          data: {
            state: 'REVIEWED',
            reviewedById: user.id,
            reviewedAt: new Date(),
            reviewedRevision: row!.revision,
          },
        });
        return id;
      },
    );
  }
  cancel(user: AuthenticatedUser, id: string, dto: CancelSettlementDto) {
    if (dto.reason.trim().length < 3)
      throw new BadRequestException('A cancellation reason is required.');
    return this.command(
      user,
      'SETTLEMENT_CANCELLED',
      id,
      dto,
      undefined,
      async (tx, row) => {
        this.revision(row!, dto);
        if (!['DRAFT', 'REVIEWED'].includes(row!.state))
          throw new ConflictException(
            'Approved settlements cannot be cancelled.',
          );
        await tx.driverSettlement.update({
          where: { id },
          data: {
            state: 'DRAFT',
            revision: { increment: 1 },
            reviewedById: null,
            reviewedAt: null,
            reviewedRevision: null,
          },
        });
        await tx.driverSettlementWork.updateMany({
          where: {
            settlementId: id,
            organizationId: user.organizationId,
            releasedAt: null,
          },
          data: { releasedAt: new Date() },
        });
        await tx.driverSettlement.update({
          where: { id },
          data: {
            state: 'CANCELLED',
            cancelledById: user.id,
            cancelledAt: new Date(),
            cancellationReason: dto.reason.trim(),
          },
        });
        return id;
      },
    );
  }
  approve(user: AuthenticatedUser, id: string, dto: SettlementCommand) {
    return this.command(
      user,
      'SETTLEMENT_APPROVED',
      id,
      dto,
      undefined,
      async (tx, row, uploads) => {
        this.revision(row!, dto);
        if (row!.state !== 'REVIEWED' || row!.reviewedRevision !== dto.revision)
          throw new ConflictException(
            'Approval requires the exact reviewed revision.',
          );
        await this.revalidate(tx, row!);
        const snapshot = row!.snapshot as unknown as Snapshot;
        if (row!.originalSettlementId) {
          const root = await this.view(
            tx,
            await this.row(tx, user.organizationId, row!.originalSettlementId),
          );
          if (
            new Prisma.Decimal(root.remainingPayable).plus(row!.netAmount).lt(0)
          )
            throw new ConflictException(
              'Adjustment would reduce the obligation below recorded payments.',
            );
        }
        const bytes = await this.pdf(row!);
        const checksum = createHash('sha256').update(bytes).digest('hex');
        const documentId = randomUUID(),
          versionId = randomUUID(),
          key = `documents/${documentId}/${versionId}.pdf`;
        uploads.push(key);
        await this.storage.put(key, bytes);
        await tx.document.create({
          data: {
            id: documentId,
            organizationId: user.organizationId,
            type: 'OTHER',
            status: 'CONFIRMED',
          },
        });
        await tx.documentVersion.create({
          data: {
            id: versionId,
            organizationId: user.organizationId,
            documentId,
            versionNumber: 1,
            originalFileName: `Settlement-${id}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: bytes.length,
            checksum,
            storageKey: key,
            uploadedByUserId: user.id,
            uploadKey: randomUUID(),
          },
        });
        await tx.driverSettlement.update({
          where: { id },
          data: {
            state: 'APPROVED',
            approvedById: user.id,
            approvedAt: new Date(),
            documentVersionId: versionId,
            snapshot: json({ ...snapshot, statementChecksum: checksum }),
          },
        });
        return id;
      },
    );
  }
  pay(user: AuthenticatedUser, id: string, dto: SettlementPaymentDto) {
    const amount = new Prisma.Decimal(money(dto.amount));
    dateOnly(dto.paymentDate);
    if (
      !amount.gt(0) ||
      dto.currency !== 'USD' ||
      !['CASH', 'CHECK', 'ACH', 'WIRE', 'OTHER'].includes(dto.method) ||
      (dto.method !== 'CASH' && !dto.reference?.trim())
    )
      throw new BadRequestException(
        'Enter a positive USD payment and an appropriate method/reference.',
      );
    return this.command(
      user,
      'SETTLEMENT_PAYMENT_RECORDED',
      id,
      dto,
      undefined,
      async (tx, row) => {
        this.revision(row!, dto);
        if (row!.state !== 'APPROVED' || row!.kind !== 'BASE')
          throw new ConflictException(
            'Record payments against the approved original settlement.',
          );
        const current = await this.view(tx, row!);
        if (amount.gt(current.remainingPayable))
          throw new ConflictException('Payment exceeds remaining payable.');
        await tx.driverSettlementPayment.create({
          data: {
            organizationId: user.organizationId,
            settlementId: id,
            amount,
            currency: dto.currency,
            paymentDate: dateOnly(dto.paymentDate),
            method: dto.method,
            reference: dto.reference?.trim() || null,
            recordedById: user.id,
            idempotencyKey: dto.idempotencyKey,
            requestHash: hash({ actorId: user.id, id, dto }),
          },
        });
        return id;
      },
    );
  }
  private async pdf(row: Row) {
    const snapshot = row.snapshot as unknown as Snapshot;
    const lines = [
      'LoadPacket Driver Settlement',
      snapshot.organizationName,
      `Settlement: ${row.id}`,
      `Driver: ${snapshot.driverName}`,
      `Period: ${row.periodStart.toISOString().slice(0, 10)} to ${row.periodEnd.toISOString().slice(0, 10)} (America/Chicago)`,
      ...(row.originalSettlementId
        ? [`Adjustment to: ${row.originalSettlementId}`]
        : []),
      '',
      ...snapshot.items.map(
        (i) =>
          `${i.kind} | ${i.loadId ?? ''} | USD ${i.amount} | ${i.description}`,
      ),
      '',
      ...Object.entries(snapshot.totals).map(
        ([key, value]) => `${key}: USD ${value}`,
      ),
      '',
      ...snapshot.work.map(
        (w) =>
          `Work: ${w.loadNumber} | ${w.loadId} | completed ${w.completedAt}`,
      ),
      '',
      snapshot.policy,
      'This statement records approved compensation. Payment history is separate.',
    ];
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([612, 792]),
      y = 750;
    try {
      for (const line of lines) {
        for (const text of line.match(/.{1,85}/gu) ?? ['']) {
          if (y < 45) {
            page = pdf.addPage([612, 792]);
            y = 750;
          }
          page.drawText(text, {
            x: 36,
            y,
            size: 10,
            font,
            color: rgb(0.035, 0.153, 0.192),
          });
          y -= 15;
        }
      }
    } catch {
      throw new BadRequestException(
        'Statement text contains unsupported font characters. Correct the draft text before approval.',
      );
    }
    return Buffer.from(await pdf.save());
  }
  async download(user: AuthenticatedUser, id: string) {
    this.authorize(user);
    const row = await this.row(this.db, user.organizationId, id);
    if (row.state !== 'APPROVED' || !row.documentVersion)
      throw new NotFoundException('Approved statement not found.');
    const bytes = await this.storage.read(row.documentVersion.storageKey);
    if (
      createHash('sha256').update(bytes).digest('hex') !==
      row.documentVersion.checksum
    )
      throw new ConflictException(
        'Statement checksum does not match stored evidence.',
      );
    return bytes;
  }
}

import { guardLegacySettlementPay } from './settlements-domain';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { Prisma, type FinancialImportBatch } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ConfirmImportDto, ImportMappingDto } from './finance.dto';
import { dateOnly } from './finance-domain';
import {
  normalizeRow,
  parseSpreadsheet,
  suggestMapping,
  validateMapping,
  type NormalizedRow,
} from './import-parser';

@Injectable()
export class FinanceImportService {
  constructor(private readonly db: PrismaService) {}
  private view(batch: FinancialImportBatch) {
    const { fileBytes, mimeType, createdById, organizationId, ...safe } = batch;
    void fileBytes;
    void mimeType;
    void createdById;
    void organizationId;
    return safe;
  }
  async list(user: AuthenticatedUser) {
    const rows = await this.db.financialImportBatch.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        fileName: true,
        fileChecksum: true,
        status: true,
        revision: true,
        headers: true,
        columnMapping: true,
        counts: true,
        createdAt: true,
        completedAt: true,
      },
    });
    return rows;
  }
  async get(user: AuthenticatedUser, id: string) {
    const batch = await this.db.financialImportBatch.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!batch) throw new NotFoundException('Import not found.');
    return batch;
  }
  async detail(user: AuthenticatedUser, id: string) {
    const batch = await this.get(user, id);
    return {
      ...this.view(batch),
      rows: await this.db.financialImportRow.findMany({
        where: { organizationId: user.organizationId, batchId: id },
        orderBy: { rowNumber: 'asc' },
        select: {
          rowNumber: true,
          status: true,
          normalizedData: true,
          issues: true,
        },
      }),
    };
  }
  async upload(user: AuthenticatedUser, file: Express.Multer.File) {
    if (!file?.buffer)
      throw new BadRequestException('Choose a CSV or XLSX file.');
    const parsed = await parseSpreadsheet(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    const fileChecksum = createHash('sha256').update(file.buffer).digest('hex');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.organizationId},0))`;
      const existing = await tx.financialImportBatch.findUnique({
        where: {
          organizationId_fileChecksum: {
            organizationId: user.organizationId,
            fileChecksum,
          },
        },
      });
      if (existing) return { ...this.view(existing), duplicate: true };
      const batch = await tx.financialImportBatch.create({
        data: {
          organizationId: user.organizationId,
          createdById: user.id,
          fileName: basename(file.originalname.replaceAll('\\', '/'))
            .split('')
            .filter((c) => c.charCodeAt(0) > 31)
            .join('')
            .slice(0, 200),
          mimeType: file.mimetype,
          fileChecksum,
          fileBytes: new Uint8Array(file.buffer),
          headers: parsed.headers,
          columnMapping: suggestMapping(parsed.headers),
          counts: { total: parsed.rows.length },
        },
      });
      await this.audit(
        tx,
        user,
        batch.id,
        'IMPORT_UPLOADED',
        'Original spreadsheet retained; no financial rows imported.',
        { fileChecksum, rows: parsed.rows.length },
      );
      return { ...this.view(batch), duplicate: false };
    });
  }
  private async duplicates(
    tx: Prisma.TransactionClient,
    org: string,
    rows: NormalizedRow[],
  ) {
    const loads = rows
      .map((r) => r.loadNumber?.trim().toLowerCase())
      .filter((v): v is string => !!v);
    const invoices = rows
      .map((r) => r.invoiceNumber?.trim().toLowerCase())
      .filter((v): v is string => !!v);
    if (!loads.length)
      return { loads: new Set<string>(), invoices: new Set<string>() };
    const found = await tx.$queryRaw<
      { load: string; invoice: string | null }[]
    >(
      Prisma.sql`SELECT lower(btrim(load_number)) AS load,lower(btrim(invoice_number)) AS invoice FROM loads WHERE organization_id=${org}::uuid AND (lower(btrim(load_number)) IN (${Prisma.join(loads)}) ${invoices.length ? Prisma.sql`OR lower(btrim(invoice_number)) IN (${Prisma.join(invoices)})` : Prisma.empty}) UNION ALL SELECT lower(btrim(load_number)),lower(btrim(invoice_number)) FROM historical_load_records WHERE organization_id=${org}::uuid AND (lower(btrim(load_number)) IN (${Prisma.join(loads)}) ${invoices.length ? Prisma.sql`OR lower(btrim(invoice_number)) IN (${Prisma.join(invoices)})` : Prisma.empty})`,
    );
    return {
      loads: new Set(found.map((r) => r.load)),
      invoices: new Set(
        found.map((r) => r.invoice).filter((s): s is string => !!s),
      ),
    };
  }
  async preview(user: AuthenticatedUser, id: string, dto: ImportMappingDto) {
    const batch = await this.get(user, id);
    const parsed = await parseSpreadsheet(
      Buffer.from(batch.fileBytes),
      batch.fileName,
      batch.mimeType,
    );
    const mapping = validateMapping(dto.mapping, parsed.headers);
    const normalized = parsed.rows.map((row) =>
      normalizeRow(row, parsed.headers, mapping),
    );
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.organizationId},0))`;
      const current = await tx.financialImportBatch.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (
        !current ||
        current.revision !== dto.revision ||
        !['DRAFT', 'PREVIEWED'].includes(current.status)
      )
        throw new ConflictException(
          'This import changed. Reload before previewing.',
        );
      const seen = await this.duplicates(
        tx,
        user.organizationId,
        normalized.map((r) => r.data),
      );
      const counts: Record<string, number> = {
        total: normalized.length,
        VALID: 0,
        WARNING: 0,
        INVALID: 0,
        DUPLICATE: 0,
        imported: 0,
      };
      await tx.financialImportRow.deleteMany({
        where: { batchId: id, organizationId: user.organizationId },
      }); // Only unconfirmed staging rows; original file stays immutable.
      const rows = normalized.map((row, index) => {
        const load = row.data.loadNumber?.toLowerCase() ?? '',
          invoice = row.data.invoiceNumber?.toLowerCase();
        if (
          row.status !== 'INVALID' &&
          (seen.loads.has(load) || (!!invoice && seen.invoices.has(invoice)))
        ) {
          row.status = 'DUPLICATE';
          row.issues.push(
            'Load or invoice already exists in this organization or file.',
          );
        }
        if (row.status !== 'INVALID') {
          seen.loads.add(load);
          if (invoice) seen.invoices.add(invoice);
        }
        counts[row.status]++;
        return {
          organizationId: user.organizationId,
          batchId: id,
          rowNumber: index + 2,
          status: row.status,
          normalizedData: row.data,
          issues: row.issues,
        };
      });
      await tx.financialImportRow.createMany({ data: rows });
      await tx.financialImportBatch.update({
        where: { id, organizationId: user.organizationId },
        data: {
          status: 'PREVIEWED',
          columnMapping: mapping,
          counts,
          revision: { increment: 1 },
        },
      });
    });
    return this.detail(user, id);
  }
  async confirm(user: AuthenticatedUser, id: string, dto: ConfirmImportDto) {
    await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.organizationId},0))`;
        const batch = await tx.financialImportBatch.findFirst({
          where: { id, organizationId: user.organizationId },
        });
        if (!batch) throw new NotFoundException('Import not found.');
        if (batch.status === 'CONFIRMED' && batch.revision === dto.revision)
          return;
        if (batch.status !== 'PREVIEWED' || batch.revision !== dto.revision)
          throw new ConflictException(
            'Preview changed. Review the latest preview before confirming.',
          );
        const rows = await tx.financialImportRow.findMany({
          where: { organizationId: user.organizationId, batchId: id },
          orderBy: { rowNumber: 'asc' },
        });
        if (
          rows.some((r) => ['INVALID', 'DUPLICATE'].includes(r.status)) &&
          !dto.skipInvalidRows
        )
          throw new BadRequestException(
            'Explicitly acknowledge skipping invalid and duplicate rows.',
          );
        if (rows.some((r) => r.status === 'WARNING') && !dto.acceptWarnings)
          throw new BadRequestException(
            'Review and explicitly accept the warning rows.',
          );
        const eligible = rows.filter((r) =>
          ['VALID', 'WARNING'].includes(r.status),
        );
        if (!eligible.length)
          throw new BadRequestException('No eligible rows to import.');
        const seen = await this.duplicates(
          tx,
          user.organizationId,
          eligible.map((r) => r.normalizedData as NormalizedRow),
        );
        const mapping = batch.columnMapping as Record<string, string>;
        for (const row of eligible) {
          const data = row.normalizedData as Required<NormalizedRow>;
          if (data.driverPay && new Prisma.Decimal(data.driverPay).gt(0))
            await guardLegacySettlementPay(
              tx,
              user.organizationId,
              dateOnly(data.deliveryDate),
            );
          if (
            seen.loads.has(data.loadNumber.toLowerCase()) ||
            (data.invoiceNumber &&
              seen.invoices.has(data.invoiceNumber.toLowerCase()))
          )
            throw new ConflictException(
              'A load or invoice was added after preview. Preview this import again.',
            );
          const historical = await tx.historicalLoadRecord.create({
            data: {
              organizationId: user.organizationId,
              loadNumber: data.loadNumber,
              invoiceNumber: data.invoiceNumber || null,
              brokerName: data.brokerName,
              deliveryDate: dateOnly(data.deliveryDate),
              origin: data.origin || null,
              destination: data.destination || null,
              miles: data.miles || null,
              driverName: data.driverName || null,
              truckReference: data.truckReference || null,
              grossRevenue: data.grossRevenue,
              paymentStatus: data.paymentStatus,
              dueDate: data.dueDate ? dateOnly(data.dueDate) : null,
              importBatchId: id,
              importRowNumber: row.rowNumber,
            },
          });
          const parts = [
            {
              field: 'grossRevenue',
              type: 'INCOME',
              category: 'Linehaul',
              amount: new Prisma.Decimal(data.grossRevenue)
                .minus(data.fuelSurcharge || 0)
                .toFixed(2),
            },
            {
              field: 'fuelSurcharge',
              type: 'INCOME',
              category: 'Fuel Surcharge',
              amount: data.fuelSurcharge,
            },
            {
              field: 'fuelExpense',
              type: 'EXPENSE',
              category: 'Fuel',
              amount: data.fuelExpense,
            },
            {
              field: 'driverPay',
              type: 'DRIVER_PAY',
              category: 'Driver Pay',
              amount: data.driverPay,
            },
            {
              field: 'otherExpenses',
              type: 'EXPENSE',
              category: 'Other',
              amount: data.otherExpenses,
            },
            {
              field: 'paymentStatus',
              type: 'PAYMENT',
              category: 'Customer Payment',
              amount:
                data.paymentStatus === 'PAID' ? data.grossRevenue : undefined,
            },
          ] as const;
          for (const part of parts)
            if (part.amount && new Prisma.Decimal(part.amount).gt(0))
              await tx.financialTransaction.create({
                data: {
                  organizationId: user.organizationId,
                  createdById: user.id,
                  type: part.type,
                  effect: part.type === 'DRIVER_PAY' ? 'EXPENSE' : part.type,
                  category: part.category,
                  amount: part.amount,
                  transactionDate: dateOnly(
                    part.type === 'PAYMENT'
                      ? data.paymentDate
                      : data.deliveryDate,
                  ),
                  description: `Historical ${data.loadNumber}: ${part.category}`,
                  brokerName: data.brokerName,
                  historicalLoadId: historical.id,
                  source: 'IMPORT',
                  importBatchId: id,
                  importRowNumber: row.rowNumber,
                  sourceColumn: mapping[part.field],
                  idempotencyKey: `${id}:${row.rowNumber}:${part.field}`,
                },
              });
        }
        await tx.financialImportBatch.update({
          where: { id, organizationId: user.organizationId },
          data: {
            status: 'CONFIRMED',
            completedAt: new Date(),
            counts: {
              ...(batch.counts as Record<string, number>),
              imported: eligible.length,
            },
          },
        });
        await this.audit(
          tx,
          user,
          id,
          'IMPORT_CONFIRMED',
          'Historical records confirmed; no live load events created.',
          {
            revision: batch.revision,
            imported: eligible.length,
            skipped: rows.length - eligible.length,
          },
        );
      },
      { timeout: 60000 },
    );
    return this.detail(user, id);
  }
  async reverse(user: AuthenticatedUser, id: string, reason: string) {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.organizationId},0))`;
      const batch = await tx.financialImportBatch.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!batch) throw new NotFoundException('Import not found.');
      if (batch.status === 'REVERSED') return;
      if (batch.status !== 'CONFIRMED')
        throw new ConflictException('Only confirmed imports can be reversed.');
      const modified = await tx.financialTransaction.count({
        where: {
          organizationId: user.organizationId,
          correctionOf: {
            importBatchId: id,
            organizationId: user.organizationId,
          },
        },
      });
      if (modified)
        throw new ConflictException(
          `Cannot reverse this import: ${modified} subsequent corrections require review.`,
        );
      await tx.financialTransaction.updateMany({
        where: {
          organizationId: user.organizationId,
          importBatchId: id,
          status: 'POSTED',
        },
        data: { status: 'VOID' },
      });
      await tx.historicalLoadRecord.updateMany({
        where: { organizationId: user.organizationId, importBatchId: id },
        data: { status: 'VOID' },
      });
      await tx.financialImportBatch.update({
        where: { id, organizationId: user.organizationId },
        data: { status: 'REVERSED' },
      });
      await this.audit(
        tx,
        user,
        id,
        'IMPORT_REVERSED',
        'Imported entries voided; original evidence and history retained.',
        { reason },
      );
    });
    return this.detail(user, id);
  }
  private audit(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    id: string,
    action: string,
    summary: string,
    details: Prisma.InputJsonValue,
  ) {
    return tx.financialAuditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        recordId: id,
        recordType: 'IMPORT',
        action,
        summary,
        details,
      },
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { Prisma, type DocumentProcessingRun } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DocumentsService } from './documents.service';
import { RateConDraftService } from './ratecon-draft.service';
import { RateConProcessor } from './ratecon-processor';
import { withEvidence } from './ratecon-evidence';
import { rateconFile } from './ratecon-file';
import type { DocumentIntelligence } from '../../../../packages/api-contracts/document-intelligence';
import type { RateConDraftResponse } from '../../../../packages/api-contracts/ratecon';
export const PIPELINE =
  'ratecon-v1/pdf-parse-2.4.5/tesseract-7.0.0/eng-1.0.0/pages10/chars100000/ai-disabled';
const pipelineKey = createHash('sha256').update(PIPELINE).digest('hex');
export const processingJson = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function reviewHash(v: unknown): string {
  const sort = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, y]) => [k, sort(y)]),
          )
        : x;
  return createHash('sha256')
    .update(JSON.stringify(sort(v)))
    .digest('hex');
}
type Result = ReturnType<typeof withEvidence> & {
  pages: DocumentIntelligence['pages'];
  ocrPages: number;
  characters: number;
};
@Injectable()
export class DocumentIntelligenceService {
  constructor(
    private readonly db: PrismaService,
    private readonly documents: DocumentsService,
    private readonly parser: RateConDraftService,
    private readonly processor: RateConProcessor,
  ) {}
  async process(user: AuthenticatedUser, id: string, retry = false) {
    const document = await this.documents.findDocument(user, id);
    if (document.type !== 'RATE_CONFIRMATION' || !document.versions[0])
      throw new BadRequestException('A Rate Confirmation source is required.');
    const source = document.versions[0];
    const claim = await this.db.$transaction(async (tx) => {
      // One cross-process admission lock: max two workers globally, one per tenant.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(78123451)`;
      await tx.$queryRaw`SELECT id FROM documents WHERE id=${id}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      let run = await tx.documentProcessingRun.findFirst({
        where: {
          organizationId: user.organizationId,
          documentVersionId: source.id,
          pipelineKey,
        },
      });
      if (!run)
        run = await tx.documentProcessingRun.create({
          data: {
            organizationId: user.organizationId,
            documentId: id,
            documentVersionId: source.id,
            sourceChecksum: source.checksum,
            pipelineKey,
            requestedByUserId: user.id,
          },
        });
      if (run.review || run.status === 'SUCCEEDED')
        return { run, claimed: false };
      if (run.status === 'RUNNING') {
        if (run.leaseExpiresAt!.getTime() > Date.now())
          throw new ConflictException(
            'Document is processing. Wait before refreshing.',
          );
        run = await tx.documentProcessingRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            leaseToken: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
            errorCode: 'WORKER_INTERRUPTED',
            attempts: processingJson([
              ...(run.attempts as unknown[]),
              {
                attempt: run.attemptCount,
                outcome: 'WORKER_INTERRUPTED',
                reservedPages: 10,
                tokens: 0,
              },
            ]),
          },
        });
      }
      if (run.status === 'FAILED' && (!retry || run.attemptCount >= 2))
        return { run, claimed: false };
      const since = new Date(Date.now() - 86400000);
      const used = await tx.documentProcessingRun.aggregate({
        where: {
          organizationId: user.organizationId,
          startedAt: { gte: since },
        },
        _sum: { attemptCount: true },
      });
      const active = await tx.documentProcessingRun.findMany({
        where: { status: 'RUNNING', leaseExpiresAt: { gt: new Date() } },
        select: { organizationId: true },
      });
      if (
        (used._sum.attemptCount ?? 0) >= 100 ||
        active.length >= 2 ||
        active.some((r) => r.organizationId === user.organizationId)
      )
        throw new ConflictException(
          'Processing capacity reached. Retry later; your original document is safe.',
        );
      run = await tx.documentProcessingRun.update({
        where: { id: run.id },
        data: {
          status: 'RUNNING',
          attemptCount: run.attemptCount + 1,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + 150000),
          startedAt: new Date(),
          finishedAt: null,
          errorCode: null,
        },
      });
      return { run, claimed: true };
    });
    if (!claim.claimed) return this.view(claim.run);
    const start = Date.now();
    let result: Result | undefined,
      errorCode: string | null = null;
    try {
      const bytes = await this.documents.readStoredFile(user, id);
      if (createHash('sha256').update(bytes).digest('hex') !== source.checksum)
        throw Error('SOURCE_CHANGED');
      rateconFile(bytes, source.mimeType, source.originalFileName);
      const text = await this.processor.process(bytes, source.mimeType);
      result = {
        ...withEvidence(
          this.parser.parseExtraction(
            {
              text: text.pages.map((p) => p.text).join('\n'),
              pageCount: text.pages.length,
            },
            id,
          ),
          text.pages,
        ),
        ...text,
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      errorCode = [
        'TIMEOUT',
        'SOURCE_CHANGED',
        'PAGE_LIMIT',
        'IMAGE_LIMIT',
        'TEXT_LIMIT',
        'NO_TEXT',
        'WORKER_UNAVAILABLE',
        'OUTPUT_LIMIT',
      ].includes(code)
        ? code
        : 'PROCESSING_FAILED';
    }
    const run = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM document_processing_runs WHERE id=${claim.run.id}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      const current = await tx.documentProcessingRun.findUniqueOrThrow({
        where: { id: claim.run.id },
      });
      if (
        current.status !== 'RUNNING' ||
        current.leaseToken !== claim.run.leaseToken
      )
        throw new ConflictException(
          'Processing attempt expired. Refresh for the authoritative result.',
        );
      return tx.documentProcessingRun.update({
        where: { id: current.id },
        data: {
          status: result ? 'SUCCEEDED' : 'FAILED',
          result: result ? processingJson(result) : Prisma.DbNull,
          errorCode,
          leaseToken: null,
          leaseExpiresAt: null,
          finishedAt: new Date(),
          attempts: processingJson([
            ...(current.attempts as unknown[]),
            {
              attempt: current.attemptCount,
              outcome: result ? 'SUCCEEDED' : errorCode,
              elapsedMs: Date.now() - start,
              pages: result?.pages.length ?? null,
              ocrPages: result?.ocrPages ?? null,
              characters: result?.characters ?? null,
              reservedPages: 10,
              tokens: 0,
              ai: 'DISABLED',
            },
          ]),
        },
      });
    });
    return this.view(run);
  }
  private view(
    run: DocumentProcessingRun,
  ): RateConDraftResponse & { intelligence: DocumentIntelligence } {
    const r = run.result as Result | null;
    const empty = withEvidence(
      this.parser.parseExtraction({ text: '', pageCount: 0 }, run.documentId),
      [],
    );
    const data = r ?? empty;
    return {
      ...data.draft,
      extraction: {
        pageCount: r?.pages.length ?? null,
        characterCount: r?.characters ?? 0,
      },
      warnings: [
        ...data.draft.warnings,
        ...(!r
          ? [
              'Processing could not complete. Review the original and enter the fields manually, or explicitly retry once.',
            ]
          : []),
      ],
      intelligence: {
        runId: run.id,
        versionId: run.documentVersionId,
        checksum: run.sourceChecksum,
        status: run.status,
        attemptCount: run.attemptCount,
        retryAllowed:
          run.status === 'FAILED' && run.attemptCount < 2 && !run.review,
        pipeline: PIPELINE,
        classification: data.classification,
        fields: data.fields,
        pages: r?.pages ?? [],
        errorCode: run.errorCode,
        ai: 'DISABLED',
      },
    };
  }
  async source(user: AuthenticatedUser, id: string) {
    const d = await this.documents.findDocument(user, id);
    if (d.type !== 'RATE_CONFIRMATION') throw new NotFoundException();
    const v = d.versions[0];
    if (!v) throw new NotFoundException();
    return {
      bytes: await this.documents.readStoredFile(user, id),
      mime: v.mimeType,
    };
  }
}

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

import { LoadEventActorType, LoadEventType } from '../generated/prisma/enums';

import type { Prisma } from '../generated/prisma/client';

type EventClient = Pick<Prisma.TransactionClient, 'loadEvent'>;

export type RecordLoadEventInput = {
  organizationId: string;
  loadId: string;

  type: LoadEventType;

  actorType?: LoadEventActorType;
  actorId?: string | null;
  actorName?: string | null;

  occurredAt?: Date;

  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class LoadEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordLoadEventInput) {
    return this.createEvent(this.prisma, input);
  }

  async recordInTransaction(
    tx: Prisma.TransactionClient,
    input: RecordLoadEventInput,
  ) {
    return this.createEvent(tx, input);
  }

  async findForLoad(organizationId: string, loadId: string) {
    return this.prisma.loadEvent.findMany({
      where: {
        organizationId,
        loadId,
      },

      orderBy: [
        {
          occurredAt: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async hasEvent(organizationId: string, loadId: string, type: LoadEventType) {
    const existing = await this.prisma.loadEvent.findFirst({
      where: {
        organizationId,
        loadId,
        type,
      },

      select: {
        id: true,
      },
    });

    return existing !== null;
  }

  private async createEvent(client: EventClient, input: RecordLoadEventInput) {
    return client.loadEvent.create({
      data: {
        organizationId: input.organizationId,

        loadId: input.loadId,

        type: input.type,

        actorType: input.actorType ?? LoadEventActorType.SYSTEM,

        actorId: input.actorId ?? null,

        actorName: input.actorName ?? null,

        occurredAt: input.occurredAt ?? new Date(),

        metadata: input.metadata,
      },
    });
  }
}

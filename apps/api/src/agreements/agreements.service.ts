import type {
  Agreement,
  AgreementVersion,
  AgreementAcceptance,
  Load,
} from '../generated/prisma/client';
type AgreementView = Agreement & {
  load?: Pick<Load, 'id' | 'loadNumber' | 'brokerName'>;
  versions?: (AgreementVersion & { acceptances?: AgreementAcceptance[] })[];
};
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { createHash } from 'node:crypto';

import { PrismaService } from '../database/prisma.service';

import {
  AgreementAcceptanceMethod,
  AgreementPartyRole,
  AgreementStatus,
  AgreementType,
  DocumentType,
  LoadEventActorType,
  LoadEventType,
} from '../generated/prisma/enums';

import { LoadEventsService } from '../load-events/load-events.service';

type AcceptAgreementInput = {
  acceptedByName?: string;
  acceptedByTitle?: string;
  acceptedByEmail?: string;
};

@Injectable()
export class AgreementsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly loadEvents: LoadEventsService,
  ) {}

  async createRateConfirmationAgreement(
    currentUser: AuthenticatedUser,
    loadId: string,
  ) {
    const organizationId = currentUser.organizationId;

    const load = await this.prisma.load.findFirst({
      where: {
        id: loadId,

        organizationId,
      },

      include: {
        stops: {
          orderBy: {
            sequence: 'asc',
          },
        },

        requirements: {
          orderBy: {
            createdAt: 'asc',
          },
        },

        documents: {
          where: {
            role: DocumentType.RATE_CONFIRMATION,
          },

          include: {
            document: {
              include: {
                versions: {
                  orderBy: {
                    versionNumber: 'desc',
                  },

                  take: 1,
                },
              },
            },
          },

          take: 1,
        },
      },
    });

    if (!load) {
      throw new NotFoundException('Load was not found.');
    }

    /*
     * Idempotency:
     * one active Rate Confirmation
     * agreement per load for this MVP.
     */
    const existing = await this.prisma.agreement.findFirst({
      where: {
        organizationId,

        loadId,

        type: AgreementType.RATE_CONFIRMATION,

        status: {
          not: AgreementStatus.VOIDED,
        },
      },

      orderBy: {
        createdAt: 'desc',
      },

      include: {
        versions: {
          orderBy: {
            versionNumber: 'desc',
          },

          include: {
            acceptances: true,
          },
        },
      },
    });

    if (existing) {
      return {
        created: false,

        message: 'Rate Confirmation agreement already exists.',

        agreement: this.serializeAgreement(existing),
      };
    }

    const rateConLink = load.documents[0];

    const sourceVersion = rateConLink?.document.versions[0];

    if (!sourceVersion) {
      throw new BadRequestException(
        'The load does not have a Rate Confirmation document version.',
      );
    }

    /*
     * This is the structured representation
     * of what the carrier is agreeing to.
     *
     * The source PDF remains immutable and
     * the AgreementVersion stores its own
     * content hash.
     */
    const terms = {
      schemaVersion: 1,

      agreementType: 'RATE_CONFIRMATION',

      sourceDocument: {
        documentId: rateConLink.document.id,

        documentVersionId: sourceVersion.id,

        versionNumber: sourceVersion.versionNumber,

        checksum: sourceVersion.checksum,

        originalFileName: sourceVersion.originalFileName,
      },

      load: {
        id: load.id,

        loadNumber: load.loadNumber,

        brokerName: load.brokerName,

        brokerContact: load.brokerContact,

        equipment: load.equipment,
      },

      rate: {
        currency: load.currency,

        linehaul: load.linehaul?.toString() ?? null,

        fuelSurcharge: load.fuelSurcharge?.toString() ?? null,

        totalRate: load.totalRate.toString(),
      },

      route: load.stops.map((stop) => ({
        sequence: stop.sequence,

        type: stop.type,

        facilityName: stop.facilityName,

        address: stop.address,

        appointmentText: stop.appointmentText,

        referenceNumber: stop.referenceNumber,
      })),

      documentRequirements: load.requirements.map((requirement) => ({
        documentType: requirement.documentType,

        requirement: requirement.requirement,
      })),
    };

    const contentHash = this.hashTerms(terms);

    const created = await this.prisma.$transaction(async (tx) => {
      const agreement = await tx.agreement.create({
        data: {
          organizationId,

          loadId: load.id,

          type: AgreementType.RATE_CONFIRMATION,

          status: AgreementStatus.PENDING,

          title: `Rate Confirmation - ${load.loadNumber}`,
        },
      });

      const version = await tx.agreementVersion.create({
        data: {
          organizationId,

          agreementId: agreement.id,

          sourceDocumentVersionId: sourceVersion.id,

          versionNumber: 1,

          contentHash,

          terms,

          totalAmount: load.totalRate,

          currency: load.currency,
        },

        include: {
          acceptances: true,
        },
      });

      await this.loadEvents.recordInTransaction(tx, {
        actorId: currentUser.id,
        organizationId,

        loadId: load.id,

        type: LoadEventType.AGREEMENT_CREATED,

        actorType: LoadEventActorType.SYSTEM,

        actorName: `${currentUser.firstName} ${currentUser.lastName}`,

        metadata: {
          agreementId: agreement.id,

          agreementType: agreement.type,

          agreementStatus: agreement.status,

          agreementVersionId: version.id,

          versionNumber: version.versionNumber,

          contentHash,

          sourceDocumentId: rateConLink.document.id,

          sourceDocumentVersionId: sourceVersion.id,
        },
      });

      return {
        ...agreement,

        versions: [version],
      };
    });

    return {
      created: true,

      agreement: this.serializeAgreement(created),
    };
  }

  async accept(
    currentUser: AuthenticatedUser,
    agreementId: string,
    input?: AcceptAgreementInput,
  ) {
    const organizationId = currentUser.organizationId;

    const acceptedByName = input?.acceptedByName?.trim();

    const acceptedByTitle = input?.acceptedByTitle?.trim() || null;

    const acceptedByEmail = input?.acceptedByEmail?.trim() || null;

    if (!acceptedByName || acceptedByName.length < 2) {
      throw new BadRequestException('acceptedByName is required.');
    }

    if (acceptedByEmail && !this.isEmail(acceptedByEmail)) {
      throw new BadRequestException('acceptedByEmail is invalid.');
    }

    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,

        organizationId,
      },

      include: {
        load: {
          select: {
            id: true,

            loadNumber: true,

            brokerName: true,
          },
        },

        versions: {
          orderBy: {
            versionNumber: 'desc',
          },

          take: 1,

          include: {
            acceptances: true,
          },
        },
      },
    });

    if (!agreement) {
      throw new NotFoundException('Agreement was not found.');
    }

    const version = agreement.versions[0];

    if (!version) {
      throw new BadRequestException(
        'Agreement does not have a version to accept.',
      );
    }

    const existingAcceptance = version.acceptances.find(
      (acceptance) => acceptance.partyRole === AgreementPartyRole.CARRIER,
    );

    /*
     * Idempotency:
     * repeated clicks do not create
     * duplicate acceptances or events.
     */
    if (existingAcceptance && agreement.status === AgreementStatus.EXECUTED) {
      return {
        accepted: false,

        message: 'Agreement has already been accepted.',

        agreement: await this.getById(currentUser, agreement.id),
      };
    }

    if (
      agreement.status !== AgreementStatus.PENDING &&
      agreement.status !== AgreementStatus.DRAFT
    ) {
      throw new BadRequestException(
        `Agreement cannot be accepted while status is ${agreement.status}.`,
      );
    }

    if (existingAcceptance) {
      throw new BadRequestException(
        'Carrier acceptance already exists for this agreement version.',
      );
    }

    const acceptedAt = new Date();

    const consentText = `I accept Rate Confirmation version ${version.versionNumber} for load ${agreement.load.loadNumber} on behalf of the carrier.`;

    await this.prisma.$transaction(async (tx) => {
      const acceptance = await tx.agreementAcceptance.create({
        data: {
          organizationId,

          agreementVersionId: version.id,

          partyRole: AgreementPartyRole.CARRIER,

          method: AgreementAcceptanceMethod.CLICK_ACCEPT,

          acceptedByName,

          acceptedByTitle,

          acceptedByEmail,

          consentText,

          acceptedAt,
        },
      });

      await this.loadEvents.recordInTransaction(tx, {
        actorId: currentUser.id,
        organizationId,

        loadId: agreement.load.id,

        type: LoadEventType.AGREEMENT_ACCEPTED,

        actorType: LoadEventActorType.OWNER,

        actorName: `${currentUser.firstName} ${currentUser.lastName}`,

        occurredAt: acceptedAt,

        metadata: {
          agreementId: agreement.id,

          agreementVersionId: version.id,

          acceptanceId: acceptance.id,

          partyRole: AgreementPartyRole.CARRIER,

          method: AgreementAcceptanceMethod.CLICK_ACCEPT,

          acceptedByTitle,

          acceptedByEmail,
        },
      });

      /*
       * For the Rate Confirmation flow,
       * the broker supplied the offer
       * and the carrier's acceptance
       * executes the agreement.
       */
      await tx.agreement.update({
        where: { organizationId: currentUser.organizationId, id: agreement.id },

        data: {
          status: AgreementStatus.EXECUTED,
        },
      });

      await this.loadEvents.recordInTransaction(tx, {
        actorId: currentUser.id,
        organizationId,

        loadId: agreement.load.id,

        type: LoadEventType.AGREEMENT_EXECUTED,

        actorType: LoadEventActorType.SYSTEM,

        actorName: `${currentUser.firstName} ${currentUser.lastName}`,

        occurredAt: acceptedAt,

        metadata: {
          agreementId: agreement.id,

          agreementVersionId: version.id,

          versionNumber: version.versionNumber,

          contentHash: version.contentHash,
        },
      });
    });

    return {
      accepted: true,

      message: 'Agreement accepted and executed.',

      agreement: await this.getById(currentUser, agreement.id),
    };
  }

  async findForLoad(currentUser: AuthenticatedUser, loadId: string) {
    const organizationId = currentUser.organizationId;

    const load = await this.prisma.load.findFirst({
      where: {
        id: loadId,

        organizationId,
      },

      select: {
        id: true,
      },
    });

    if (!load) {
      throw new NotFoundException('Load was not found.');
    }

    const agreements = await this.prisma.agreement.findMany({
      where: {
        organizationId,

        loadId,
      },

      orderBy: {
        createdAt: 'desc',
      },

      include: {
        versions: {
          orderBy: {
            versionNumber: 'desc',
          },

          include: {
            acceptances: {
              orderBy: {
                acceptedAt: 'asc',
              },
            },
          },
        },
      },
    });

    return agreements.map((agreement) => this.serializeAgreement(agreement));
  }

  async getById(currentUser: AuthenticatedUser, agreementId: string) {
    const organizationId = currentUser.organizationId;

    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,

        organizationId,
      },

      include: {
        load: {
          select: {
            id: true,

            loadNumber: true,

            brokerName: true,
          },
        },

        versions: {
          orderBy: {
            versionNumber: 'desc',
          },

          include: {
            acceptances: {
              orderBy: {
                acceptedAt: 'asc',
              },
            },
          },
        },
      },
    });

    if (!agreement) {
      throw new NotFoundException('Agreement was not found.');
    }

    return this.serializeAgreement(agreement);
  }

  private serializeAgreement(agreement: AgreementView) {
    return {
      id: agreement.id,

      loadId: agreement.loadId,

      type: agreement.type,

      status: agreement.status,

      title: agreement.title,

      createdAt: agreement.createdAt,

      updatedAt: agreement.updatedAt,

      load: agreement.load
        ? {
            id: agreement.load.id,

            loadNumber: agreement.load.loadNumber,

            brokerName: agreement.load.brokerName,
          }
        : undefined,

      versions:
        agreement.versions?.map((version) => ({
          id: version.id,

          versionNumber: version.versionNumber,

          sourceDocumentVersionId: version.sourceDocumentVersionId,

          contentHash: version.contentHash,

          terms: version.terms,

          totalAmount: version.totalAmount?.toString() ?? null,

          currency: version.currency,

          createdAt: version.createdAt,

          acceptances:
            version.acceptances?.map((acceptance) => ({
              id: acceptance.id,

              partyRole: acceptance.partyRole,

              method: acceptance.method,

              acceptedByName: acceptance.acceptedByName,

              acceptedByTitle: acceptance.acceptedByTitle,

              acceptedByEmail: acceptance.acceptedByEmail,

              consentText: acceptance.consentText,

              acceptedAt: acceptance.acceptedAt,
            })) ?? [],
        })) ?? [],
    };
  }

  private hashTerms(terms: unknown) {
    const canonical = JSON.stringify(this.sortValue(terms));

    return createHash('sha256').update(canonical).digest('hex');
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item));
    }

    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>;

      const sorted: Record<string, unknown> = {};

      for (const key of Object.keys(source).sort()) {
        sorted[key] = this.sortValue(source[key]);
      }

      return sorted;
    }

    return value;
  }

  private isEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}

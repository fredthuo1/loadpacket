import type { AuthenticatedUser } from '../auth/auth.types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import {
  evaluateReadiness,
  requirementApplies,
} from '../loads/readiness-policy';

import {
  DocumentType,
  LoadAssignmentStatus,
  LoadChargeOpportunityStatus,
  LoadEventType,
  LoadStatus,
  RequirementStatus,
} from '../generated/prisma/enums';

const DRIVER_DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.BOL,
  DocumentType.POD,
  DocumentType.LUMPER_RECEIPT,
  DocumentType.SCALE_TICKET,
];

const DRIVER_DOCUMENT_PRIORITY: DocumentType[] = [
  DocumentType.BOL,
  DocumentType.POD,
  DocumentType.LUMPER_RECEIPT,
  DocumentType.SCALE_TICKET,
];

@Injectable()
export class AutopilotService {
  constructor(private readonly prisma: PrismaService) {}

  async getLoadAutopilot(currentUser: AuthenticatedUser, loadId: string) {
    const organizationId = currentUser.organizationId;

    const load = await this.prisma.load.findFirst({
      where: {
        id: loadId,
        organizationId,
        ...(currentUser.role === 'DRIVER'
          ? {
              assignments: {
                some: {
                  organizationId,
                  driverId: currentUser.driverId ?? '',
                  status: { not: LoadAssignmentStatus.CANCELLED },
                },
              },
            }
          : {}),
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

        assignments: {
          where: {
            status: {
              not: LoadAssignmentStatus.CANCELLED,
            },
          },

          orderBy: {
            assignedAt: 'desc',
          },

          take: 1,

          include: {
            driver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },

        events: {
          orderBy: [
            {
              occurredAt: 'asc',
            },
            {
              createdAt: 'asc',
            },
          ],
        },

        chargeOpportunities: {
          where: {
            status: {
              in: [
                LoadChargeOpportunityStatus.DETECTED,
                LoadChargeOpportunityStatus.APPROVED,
              ],
            },
          },

          orderBy: {
            detectedAt: 'desc',
          },
        },
      },
    });

    if (!load) {
      throw new NotFoundException('Load was not found.');
    }

    const assignment = load.assignments[0] ?? null;

    const driverRequirements = load.requirements.filter((requirement) =>
      DRIVER_DOCUMENT_TYPES.includes(requirement.documentType),
    );

    const requiredDriverDocuments =
      driverRequirements.filter(requirementApplies);

    const missingRequiredDriverDocuments = requiredDriverDocuments.filter(
      (requirement) =>
        requirement.status === RequirementStatus.MISSING ||
        requirement.status === RequirementStatus.REJECTED,
    );

    const readiness = evaluateReadiness(load.requirements);
    const allMissingRequiredDocuments = load.requirements.filter(
      (requirement) =>
        readiness.blockers.some(
          (blocker) => blocker.requirementId === requirement.id,
        ),
    );

    const driverAction = this.determineDriverAction({
      loadStatus: load.status,

      assignmentStatus: assignment?.status ?? null,

      missingRequiredDriverDocuments,
    });

    const deliveryGuard = this.determineDeliveryGuard({
      loadStatus: load.status,

      assignmentStatus: assignment?.status ?? null,

      missingRequiredDriverDocuments,
    });

    const ownerAction = this.determineOwnerAction({
      paperworkReady: readiness.ready,
      loadStatus: load.status,

      assignmentStatus: assignment?.status ?? null,

      allMissingRequiredDocuments,
    });

    return {
      load: {
        id: load.id,

        loadNumber: load.loadNumber,

        status: load.status,

        brokerName: load.brokerName,

        totalRate: load.totalRate.toString(),

        currency: load.currency,
      },

      driver: assignment
        ? {
            id: assignment.driver.id,

            name: `${assignment.driver.firstName} ${assignment.driver.lastName}`,

            assignmentId: assignment.id,

            assignmentStatus: assignment.status,
          }
        : null,

      driverAction,

      deliveryGuard,

      ownerAction,
      readiness,

      paperwork: {
        required: {
          complete:
            requiredDriverDocuments.length -
            missingRequiredDriverDocuments.length,

          total: requiredDriverDocuments.length,

          missing: missingRequiredDriverDocuments.map((requirement) => ({
            documentType: requirement.documentType,

            status: requirement.status,
          })),
        },
      },

      moneyOpportunities: load.chargeOpportunities.map((opportunity) => ({
        id: opportunity.id,

        type: opportunity.type,

        status: opportunity.status,

        amount: opportunity.amount?.toString() ?? null,

        currency: opportunity.currency,

        description: opportunity.description,

        detectedAt: opportunity.detectedAt,
      })),

      timeline: load.events.map((event) => ({
        id: event.id,

        type: event.type,

        label: this.getEventLabel(event.type),

        actorType: event.actorType,

        actorName: event.actorName,

        occurredAt: event.occurredAt,

        metadata: event.metadata,
      })),
    };
  }

  async getTimeline(currentUser: AuthenticatedUser, loadId: string) {
    const result = await this.getLoadAutopilot(currentUser, loadId);

    return {
      load: result.load,
      timeline: result.timeline,
    };
  }

  private determineDriverAction(input: {
    loadStatus: LoadStatus;

    assignmentStatus: LoadAssignmentStatus | null;

    missingRequiredDriverDocuments: Array<{
      documentType: DocumentType;

      status: RequirementStatus;
    }>;
  }) {
    if (!input.assignmentStatus) {
      return {
        type: 'WAITING_FOR_ASSIGNMENT',

        label: 'Waiting for Driver Assignment',

        reason: 'An owner must assign a driver before this load can begin.',

        blocking: true,
      };
    }

    if (input.assignmentStatus === LoadAssignmentStatus.ASSIGNED) {
      return {
        type: 'ACCEPT_LOAD',

        label: 'Accept Load',

        reason: 'Review and accept the assigned load.',

        blocking: false,
      };
    }

    if (
      input.assignmentStatus === LoadAssignmentStatus.ACCEPTED &&
      input.loadStatus === LoadStatus.BOOKED
    ) {
      return {
        type: 'START_LOAD',

        label: 'Start Load',

        reason: 'The load has been accepted and is ready to begin.',

        blocking: false,
      };
    }

    if (
      input.assignmentStatus === LoadAssignmentStatus.IN_PROGRESS &&
      input.loadStatus === LoadStatus.IN_TRANSIT
    ) {
      const nextMissingDocument = this.getNextMissingDriverDocument(
        input.missingRequiredDriverDocuments,
      );

      if (nextMissingDocument) {
        return {
          type: this.getDocumentActionType(nextMissingDocument),

          label: this.getDocumentActionLabel(nextMissingDocument),

          reason: `${this.getDocumentDisplayName(
            nextMissingDocument,
          )} is required before this load can be completed.`,

          blocking: true,

          documentType: nextMissingDocument,
        };
      }

      return {
        type: 'COMPLETE_LOAD',

        label: 'Complete Delivery',

        reason: 'All required driver paperwork has been captured.',

        blocking: false,
      };
    }

    if (input.loadStatus === LoadStatus.DELIVERED) {
      const correction = this.getNextMissingDriverDocument(
        input.missingRequiredDriverDocuments,
      );
      if (correction)
        return {
          type: this.getDocumentActionType(correction),
          label: `Replace ${this.getDocumentDisplayName(correction)}`,
          reason: 'Rejected or missing paperwork needs a new upload.',
          blocking: true,
          documentType: correction,
        };
    }
    if (
      input.assignmentStatus === LoadAssignmentStatus.COMPLETED ||
      input.loadStatus === LoadStatus.DELIVERED ||
      input.loadStatus === LoadStatus.PAYMENT_READY ||
      input.loadStatus === LoadStatus.INVOICED ||
      input.loadStatus === LoadStatus.PAID
    ) {
      return {
        type: 'DRIVER_COMPLETE',

        label: 'Driver Work Complete',

        reason: 'No additional driver action is required for this load.',

        blocking: false,
      };
    }

    return {
      type: 'WAIT',

      label: 'No Driver Action',

      reason: 'LoadPacket is waiting for the next workflow state.',

      blocking: false,
    };
  }

  private determineDeliveryGuard(input: {
    loadStatus: LoadStatus;

    assignmentStatus: LoadAssignmentStatus | null;

    missingRequiredDriverDocuments: Array<{
      documentType: DocumentType;

      status: RequirementStatus;
    }>;
  }) {
    const blockers = input.missingRequiredDriverDocuments.map(
      (requirement) => ({
        type: requirement.documentType,

        message: `${this.getDocumentDisplayName(
          requirement.documentType,
        )} is still required.`,
      }),
    );

    if (
      input.assignmentStatus !== LoadAssignmentStatus.IN_PROGRESS ||
      input.loadStatus !== LoadStatus.IN_TRANSIT
    ) {
      return {
        applicable: false,

        canLeave: false,

        blockingCount: blockers.length,

        blockers,

        message: 'Delivery Guard becomes active while the load is in progress.',
      };
    }

    if (blockers.length > 0) {
      return {
        applicable: true,

        canLeave: false,

        blockingCount: blockers.length,

        blockers,

        message: 'Do not leave yet. Required paperwork is still missing.',
      };
    }

    return {
      applicable: true,

      canLeave: true,

      blockingCount: 0,

      blockers: [],

      message: "Required driver paperwork is complete. You're clear to leave.",
    };
  }

  private determineOwnerAction(input: {
    paperworkReady: boolean;
    loadStatus: LoadStatus;

    assignmentStatus: LoadAssignmentStatus | null;

    allMissingRequiredDocuments: Array<{
      documentType: DocumentType;

      status: RequirementStatus;
    }>;
  }) {
    if (input.loadStatus === LoadStatus.BOOKED && !input.assignmentStatus) {
      return {
        type: 'ASSIGN_DRIVER',

        priority: 'HIGH',

        label: 'Assign Driver',

        message: 'This load is booked but does not have a driver.',
      };
    }

    if (input.loadStatus === LoadStatus.BOOKED && input.assignmentStatus) {
      return {
        type: 'WAITING_ON_DRIVER',

        priority: 'NORMAL',

        label: 'Driver Workflow',

        message: 'The load is assigned and waiting on the driver workflow.',
      };
    }

    if (input.loadStatus === LoadStatus.IN_TRANSIT) {
      return {
        type: 'WAITING_ON_DRIVER',

        priority: 'NORMAL',

        label: 'Load In Transit',

        message:
          'The driver is currently executing this load. No owner action is required unless an exception occurs.',
      };
    }

    if (
      input.loadStatus === LoadStatus.DELIVERED ||
      (input.loadStatus === LoadStatus.PAYMENT_READY && !input.paperworkReady)
    ) {
      const driverBlockers = input.allMissingRequiredDocuments.filter(
        (requirement) =>
          requirement.documentType !== DocumentType.CARRIER_INVOICE,
      );

      if (driverBlockers.length > 0) {
        return {
          type: 'RESOLVE_DOCUMENT_BLOCKERS',

          priority: 'HIGH',

          label: 'Review or Replace Documents',

          message: `${driverBlockers.length} required document${driverBlockers.length === 1 ? '' : 's'} still block payment.`,

          blockers: driverBlockers.map(
            (requirement) => requirement.documentType,
          ),
        };
      }

      const carrierInvoiceMissing = input.allMissingRequiredDocuments.some(
        (requirement) =>
          requirement.documentType === DocumentType.CARRIER_INVOICE,
      );

      if (carrierInvoiceMissing) {
        return {
          type: 'GENERATE_CARRIER_INVOICE',

          priority: 'HIGH',

          label: 'Generate Carrier Invoice',

          message:
            'Driver paperwork is complete. Generate the carrier invoice to continue toward Payment Ready.',
        };
      }

      return {
        type: 'CONTINUE_BACK_OFFICE',

        priority: 'HIGH',

        label: 'Continue Billing',

        message:
          'Delivery is complete. Continue the Back Office payment-readiness workflow.',
      };
    }

    if (input.loadStatus === LoadStatus.PAYMENT_READY) {
      return {
        type: 'SUBMIT_BILLING',

        priority: 'HIGH',

        label: 'Submit Billing',

        message: 'This load is Payment Ready and can be submitted for payment.',
      };
    }

    if (input.loadStatus === LoadStatus.INVOICED) {
      return {
        type: 'WAITING_FOR_PAYMENT',

        priority: 'NORMAL',

        label: 'Await Payment',

        message:
          'Billing has been submitted. Track the invoice until payment is received.',
      };
    }

    if (input.loadStatus === LoadStatus.PAID) {
      return {
        type: 'COMPLETE',

        priority: 'LOW',

        label: 'Complete',

        message: 'This load has been paid and requires no operational action.',
      };
    }

    return {
      type: 'REVIEW_LOAD',

      priority: 'NORMAL',

      label: 'Review Load',

      message: 'Review this load for the next required action.',
    };
  }

  private getNextMissingDriverDocument(
    requirements: Array<{
      documentType: DocumentType;

      status: RequirementStatus;
    }>,
  ) {
    for (const documentType of DRIVER_DOCUMENT_PRIORITY) {
      const missing = requirements.find(
        (requirement) =>
          requirement.documentType === documentType &&
          (requirement.status === RequirementStatus.MISSING ||
            requirement.status === RequirementStatus.REJECTED),
      );

      if (missing) {
        return documentType;
      }
    }

    return null;
  }

  private getDocumentActionType(documentType: DocumentType) {
    switch (documentType) {
      case DocumentType.BOL:
        return 'UPLOAD_BOL';

      case DocumentType.POD:
        return 'UPLOAD_POD';

      case DocumentType.LUMPER_RECEIPT:
        return 'UPLOAD_LUMPER_RECEIPT';

      case DocumentType.SCALE_TICKET:
        return 'UPLOAD_SCALE_TICKET';

      default:
        return 'UPLOAD_DOCUMENT';
    }
  }

  private getDocumentActionLabel(documentType: DocumentType) {
    return `Upload ${this.getDocumentDisplayName(documentType)}`;
  }

  private getDocumentDisplayName(documentType: DocumentType) {
    switch (documentType) {
      case DocumentType.BOL:
        return 'Bill of Lading';

      case DocumentType.POD:
        return 'Proof of Delivery';

      case DocumentType.CARRIER_INVOICE:
        return 'Carrier Invoice';

      case DocumentType.LUMPER_RECEIPT:
        return 'Lumper Receipt';

      case DocumentType.SCALE_TICKET:
        return 'Scale Ticket';

      case DocumentType.RATE_CONFIRMATION:
        return 'Rate Confirmation';

      default:
        return 'Document';
    }
  }

  private getEventLabel(type: LoadEventType) {
    switch (type) {
      case LoadEventType.LOAD_CORRECTED:
        return 'Load corrected';
      case LoadEventType.DRIVER_UNASSIGNED:
        return 'Driver unassigned';
      case LoadEventType.LOAD_CANCELLED:
        return 'Load cancelled';
      case LoadEventType.LOAD_CREATED:
        return 'Load created';

      case LoadEventType.DRIVER_ASSIGNED:
        return 'Driver assigned';

      case LoadEventType.DRIVER_ACCEPTED:
        return 'Driver accepted load';

      case LoadEventType.LOAD_STARTED:
        return 'Load started';

      case LoadEventType.ARRIVED_PICKUP:
        return 'Arrived at pickup';

      case LoadEventType.DEPARTED_PICKUP:
        return 'Departed pickup';

      case LoadEventType.ARRIVED_DELIVERY:
        return 'Arrived at delivery';

      case LoadEventType.DEPARTED_DELIVERY:
        return 'Departed delivery';

      case LoadEventType.DOCUMENT_CAPTURED:
        return 'Document captured';

      case LoadEventType.DOCUMENT_VALIDATED:
        return 'Document validated';

      case LoadEventType.DELIVERY_CONFIRMED:
        return 'Delivery confirmed';

      case LoadEventType.LOAD_COMPLETED:
        return 'Load completed';

      case LoadEventType.AGREEMENT_CREATED:
        return 'Agreement created';

      case LoadEventType.AGREEMENT_ACCEPTED:
        return 'Agreement accepted';

      case LoadEventType.AGREEMENT_EXECUTED:
        return 'Agreement executed';

      case LoadEventType.AGREEMENT_SUPERSEDED:
        return 'Agreement superseded';

      case LoadEventType.CHARGE_OPPORTUNITY_DETECTED:
        return 'Money opportunity detected';

      case LoadEventType.CHARGE_OPPORTUNITY_APPROVED:
        return 'Money opportunity approved';

      case LoadEventType.CHARGE_OPPORTUNITY_DISMISSED:
        return 'Money opportunity dismissed';

      case LoadEventType.CHARGE_OPPORTUNITY_BILLED:
        return 'Money opportunity billed';

      case LoadEventType.PAYMENT_READY:
        return 'Payment ready';

      case LoadEventType.INVOICE_CREATED:
        return 'Invoice created';

      case LoadEventType.BILLING_SUBMITTED:
        return 'Billing submitted';

      case LoadEventType.PAYMENT_RECEIVED:
        return 'Payment received';

      default:
        return type;
    }
  }
}

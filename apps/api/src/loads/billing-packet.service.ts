import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DocumentStorage } from '../documents/document-storage';
import { evaluateReadiness, requirementApplies } from './readiness-policy';

import { PDFDocument, PDFImage, StandardFonts, rgb } from 'pdf-lib';

import { PrismaService } from '../database/prisma.service';

import { DocumentType, LoadStatus } from '../generated/prisma/enums';

const PACKET_ORDER: DocumentType[] = [
  DocumentType.CARRIER_INVOICE,
  DocumentType.BOL,
  DocumentType.POD,
  DocumentType.LUMPER_RECEIPT,
  DocumentType.SCALE_TICKET,
];

@Injectable()
export class BillingPacketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorage,
  ) {}

  async generate(
    currentUser: AuthenticatedUser,
    loadId: string,
    invoiceId?: string,
  ) {
    const organizationId = currentUser.organizationId;

    const load = await this.prisma.load.findFirst({
      where: {
        id: loadId,
        organizationId,
      },

      include: {
        requirements: true,

        stops: {
          orderBy: {
            sequence: 'asc',
          },
        },

        documents: {
          include: {
            document: {
              include: {
                versions: {
                  orderBy: {
                    versionNumber: 'desc',
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!load) {
      throw new NotFoundException('Load was not found.');
    }

    if (
      load.status !== LoadStatus.PAYMENT_READY &&
      load.status !== LoadStatus.INVOICED &&
      load.status !== LoadStatus.PAID
    ) {
      throw new BadRequestException(
        'The load must be Payment Ready before a billing packet can be generated.',
      );
    }

    /*
     * Every REQUIRED document must have
     * an actual linked document before
     * we generate a billing packet.
     */
    const readiness = evaluateReadiness(load.requirements);
    if (!readiness.ready)
      throw new BadRequestException(
        `Billing packet is blocked: ${readiness.blockers.map((item) => `${item.type}: ${item.reason}`).join(', ') || 'Document requirements are not configured'}.`,
      );
    const requiredTypes = load.requirements
      .filter(
        (requirement) =>
          requirementApplies(requirement) && requirement.status !== 'WAIVED',
      )
      .map((requirement) => requirement.documentType);

    const linkedTypes = new Set(
      load.documents.map((loadDocument) => loadDocument.role),
    );

    const missingFiles = requiredTypes.filter((type) => !linkedTypes.has(type));

    if (missingFiles.length > 0) {
      throw new BadRequestException(
        `Billing packet cannot be generated because linked files are missing: ${missingFiles.join(
          ', ',
        )}.`,
      );
    }

    const canonical = await this.prisma.carrierInvoice.findFirst({
      where: {
        organizationId,
        loadId,
        ...(invoiceId ? { id: invoiceId } : { originalInvoiceId: null }),
      },
      include: { documentVersion: true },
    });
    if (invoiceId && !canonical)
      throw new NotFoundException('Invoice was not found.');
    const packet = await PDFDocument.create();

    const includedDocuments: string[] = [];

    const pickup = load.stops[0] ?? null;

    const delivery =
      load.stops.length > 0 ? load.stops[load.stops.length - 1] : null;

    await this.addCoverPage(packet, {
      loadNumber: load.loadNumber,

      brokerName: load.brokerName,

      totalRate: canonical?.totalAmount.toFixed(2) ?? load.totalRate.toString(),

      pickup: pickup?.facilityName ?? pickup?.address ?? 'Pickup',

      delivery: delivery?.facilityName ?? delivery?.address ?? 'Delivery',
    });

    for (const documentType of PACKET_ORDER) {
      if (documentType === 'CARRIER_INVOICE' && canonical) {
        const bytes = await this.storage.read(
          canonical.documentVersion.storageKey,
        );
        const invoicePdf = await PDFDocument.load(bytes);
        for (const page of await packet.copyPages(
          invoicePdf,
          invoicePdf.getPageIndices(),
        ))
          packet.addPage(page);
        includedDocuments.push('CARRIER_INVOICE');
        continue;
      }
      const requirement = load.requirements.find(
        (item) => item.documentType === documentType,
      );
      if (!requirement || requirement.status !== 'ACCEPTED') continue;
      const approvedVersionId =
        requirement.reviewedVersionId ?? requirement.currentVersionId;
      const linkedDocument = load.documents.find(
        (item) =>
          item.role === documentType &&
          (!approvedVersionId ||
            item.document.versions.some(
              (version) => version.id === approvedVersionId,
            )),
      );

      if (!linkedDocument) {
        throw new BadRequestException(
          `${documentType} approved file version is missing. Review the linked evidence before generating a packet.`,
        );
      }

      const version = approvedVersionId
        ? linkedDocument.document.versions.find(
            (item) => item.id === approvedVersionId,
          )
        : linkedDocument.document.versions[0];

      if (!version) {
        throw new BadRequestException(
          `${documentType} does not have a file version.`,
        );
      }

      const filePath = version.storageKey;

      let fileBytes: Buffer;

      try {
        fileBytes = await this.storage.read(filePath);
      } catch {
        throw new BadRequestException(
          `Unable to read ${documentType} from storage.`,
        );
      }

      await this.appendDocument(
        packet,
        fileBytes,
        version.mimeType,
        documentType,
      );

      includedDocuments.push(documentType);
    }

    const pdfBytes = await packet.save();

    const safeLoadNumber = load.loadNumber.replace(/[^a-zA-Z0-9-_]/g, '-');

    return {
      buffer: Buffer.from(pdfBytes),

      fileName: `${safeLoadNumber}_Billing_Packet.pdf`,

      includedDocuments,
    };
  }

  private async addCoverPage(
    packet: PDFDocument,
    data: {
      loadNumber: string;
      brokerName: string;
      totalRate: string;
      pickup: string;
      delivery: string;
    },
  ) {
    const page = packet.addPage([612, 792]);

    const regular = await packet.embedFont(StandardFonts.Helvetica);

    const bold = await packet.embedFont(StandardFonts.HelveticaBold);

    const dark = rgb(0.06, 0.09, 0.15);

    const muted = rgb(0.4, 0.45, 0.52);

    page.drawText('LOADPACKET', {
      x: 50,
      y: 725,
      size: 21,
      font: bold,
      color: dark,
    });

    page.drawText('BILLING PACKET', {
      x: 50,
      y: 675,
      size: 28,
      font: bold,
      color: dark,
    });

    page.drawText(`Load ${this.safeText(data.loadNumber)}`, {
      x: 50,
      y: 640,
      size: 15,
      font: regular,
      color: muted,
    });

    let y = 570;

    const drawField = (label: string, value: string) => {
      page.drawText(this.safeText(label.toUpperCase()), {
        x: 50,
        y,
        size: 9,
        font: bold,
        color: muted,
      });

      page.drawText(this.safeText(value).slice(0, 80), {
        x: 50,
        y: y - 20,
        size: 12,
        font: regular,
        color: dark,
      });

      y -= 65;
    };

    drawField('Broker', data.brokerName);

    /*
     * Use ASCII -> rather than the
     * Unicode arrow character because
     * pdf-lib's StandardFonts use
     * WinAnsi encoding.
     */
    drawField('Route', `${data.pickup} -> ${data.delivery}`);

    drawField('Invoice Face Amount', this.money(data.totalRate));

    page.drawLine({
      start: {
        x: 50,
        y: 280,
      },

      end: {
        x: 562,
        y: 280,
      },

      thickness: 1,

      color: rgb(0.85, 0.87, 0.9),
    });

    page.drawText('PACKET CONTENTS', {
      x: 50,
      y: 245,
      size: 11,
      font: bold,
      color: dark,
    });

    const contents = [
      'Carrier Invoice',
      'Bill of Lading',
      'Proof of Delivery',
      'Supporting receipts, if applicable',
    ];

    let contentY = 220;

    for (const line of contents) {
      /*
       * Use a normal dash instead of a
       * Unicode bullet for StandardFonts
       * compatibility.
       */
      page.drawText(`- ${this.safeText(line)}`, {
        x: 60,
        y: contentY,
        size: 10,
        font: regular,
        color: dark,
      });

      contentY -= 22;
    }

    page.drawText('Generated by LoadPacket', {
      x: 50,
      y: 45,
      size: 8,
      font: regular,
      color: muted,
    });
  }

  private async appendDocument(
    packet: PDFDocument,
    bytes: Buffer,
    mimeType: string,
    documentType: DocumentType,
  ) {
    if (mimeType === 'application/pdf') {
      try {
        const source = await PDFDocument.load(bytes);

        const pages = await packet.copyPages(source, source.getPageIndices());

        for (const page of pages) {
          packet.addPage(page);
        }

        return;
      } catch {
        throw new BadRequestException(
          `${documentType} could not be read as a valid PDF.`,
        );
      }
    }

    if (mimeType === 'image/jpeg') {
      try {
        const image = await packet.embedJpg(bytes);

        this.addImagePage(packet, image);

        return;
      } catch {
        throw new BadRequestException(
          `${documentType} could not be read as a valid JPEG image.`,
        );
      }
    }

    if (mimeType === 'image/png') {
      try {
        const image = await packet.embedPng(bytes);

        this.addImagePage(packet, image);

        return;
      } catch {
        throw new BadRequestException(
          `${documentType} could not be read as a valid PNG image.`,
        );
      }
    }

    throw new BadRequestException(
      `${documentType} has an unsupported file format: ${mimeType}.`,
    );
  }

  private addImagePage(packet: PDFDocument, image: PDFImage) {
    const page = packet.addPage([612, 792]);

    const maxWidth = 532;
    const maxHeight = 712;

    const widthScale = maxWidth / image.width;

    const heightScale = maxHeight / image.height;

    const scale = Math.min(widthScale, heightScale, 1);

    const dimensions = image.scale(scale);

    page.drawImage(image, {
      x: (612 - dimensions.width) / 2,

      y: (792 - dimensions.height) / 2,

      width: dimensions.width,

      height: dimensions.height,
    });
  }

  /*
   * Standard pdf-lib fonts use WinAnsi.
   * Normalize characters that commonly
   * arrive from copied RateCons or names.
   */
  private safeText(value: string) {
    return value
      .replaceAll('→', '->')
      .replaceAll('•', '-')
      .replaceAll('–', '-')
      .replaceAll('—', '-')
      .replaceAll('“', '"')
      .replaceAll('”', '"')
      .replaceAll('‘', "'")
      .replaceAll('’', "'");
  }

  private money(value: string) {
    const amount = Number(value);

    if (Number.isNaN(amount)) {
      return value;
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',

      currency: 'USD',
    }).format(amount);
  }
}

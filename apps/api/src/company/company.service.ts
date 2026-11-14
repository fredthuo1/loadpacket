import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateCompanyDto } from './update-company.dto';
import type { CompanyProfile } from '../../../../packages/api-contracts/company-drivers';

const profileSelect = {
  id: true,
  name: true,
  dbaName: true,
  mcNumber: true,
  usdotNumber: true,
  phone: true,
  email: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  timezone: true,
  defaultPaymentTermsDays: true,
  updatedAt: true,
} as const;
@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);
  constructor(private readonly prisma: PrismaService) {}
  async get(user: AuthenticatedUser): Promise<CompanyProfile> {
    const company = await this.prisma.organization.findFirst({
      where: { id: user.organizationId },
      select: profileSelect,
    });
    if (!company) throw new NotFoundException('Company was not found.');
    return { ...company, updatedAt: company.updatedAt.toISOString() };
  }
  async update(
    user: AuthenticatedUser,
    dto: UpdateCompanyDto,
  ): Promise<CompanyProfile> {
    const company = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: dto,
      select: profileSelect,
    });
    this.logger.log({
      action: 'company.updated',
      actorId: user.id,
      organizationId: user.organizationId,
    });
    return { ...company, updatedAt: company.updatedAt.toISOString() };
  }
}

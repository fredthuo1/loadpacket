import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma, DriverStatus } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateDriverDto, UpdateDriverDto } from './driver-profile.dto';
import { ACTIVE_ASSIGNMENTS, lockDriver } from './driver-lock';
import type {
  DriverProfile,
  DriverSummary,
} from '../../../../packages/api-contracts/company-drivers';

const contactSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  status: true,
  userId: true,
  invitation: { select: { status: true, lastSentAt: true } },
} as const;
function accountState(
  userId: string | null,
  invitation: { status: string; lastSentAt: Date } | null,
): Pick<
  DriverSummary,
  'accountConnected' | 'accountStatus' | 'invitationLastSentAt'
> {
  const accountStatus =
    invitation?.status === 'PENDING'
      ? 'INVITE_PENDING'
      : invitation?.status === 'CANCELLED'
        ? 'INVITE_CANCELLED'
        : userId
          ? 'CONNECTED'
          : 'NOT_INVITED';
  return {
    accountStatus,
    accountConnected: accountStatus === 'CONNECTED',
    invitationLastSentAt: invitation?.lastSentAt.toISOString() ?? null,
  };
}
const assignmentSelect = {
  status: true,
  assignedAt: true,
  load: {
    select: {
      id: true,
      loadNumber: true,
      status: true,
      stops: {
        orderBy: { sequence: 'asc' },
        select: { type: true, address: true },
      },
    },
  },
} satisfies Prisma.LoadAssignmentSelect;
type Assignment = Prisma.LoadAssignmentGetPayload<{
  select: typeof assignmentSelect;
}>;
function summary(assignment: Assignment) {
  return {
    id: assignment.load.id,
    loadNumber: assignment.load.loadNumber,
    status: assignment.load.status,
    assignmentStatus: assignment.status,
    assignedAt: assignment.assignedAt.toISOString(),
    origin:
      assignment.load.stops.find((stop) => stop.type === 'PICKUP')?.address ??
      null,
    destination:
      assignment.load.stops.filter((stop) => stop.type === 'DELIVERY').at(-1)
        ?.address ?? null,
  };
}
function profileInput(dto: CreateDriverDto | UpdateDriverDto) {
  return {
    ...dto,
    cdlExpirationDate: dto.cdlExpirationDate
      ? new Date(`${dto.cdlExpirationDate}T00:00:00.000Z`)
      : dto.cdlExpirationDate,
    hireDate: dto.hireDate
      ? new Date(`${dto.hireDate}T00:00:00.000Z`)
      : dto.hireDate,
  };
}
@Injectable()
export class DriverManagementService {
  private readonly logger = new Logger(DriverManagementService.name);
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser): Promise<DriverSummary[]> {
    const drivers = await this.prisma.driver.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        ...contactSelect,
        assignments: {
          where: {
            organizationId: user.organizationId,
            status: { in: [...ACTIVE_ASSIGNMENTS] },
          },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: assignmentSelect,
        },
      },
    });
    return drivers.map(({ userId, invitation, assignments, ...driver }) => ({
      ...driver,
      ...accountState(userId, invitation),
      currentLoad: assignments[0] ? summary(assignments[0]) : null,
    }));
  }

  async detail(
    user: AuthenticatedUser,
    driverId: string,
  ): Promise<DriverProfile> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId: user.organizationId },
      select: {
        ...contactSelect,
        cdlNumber: true,
        cdlState: true,
        cdlExpirationDate: true,
        hireDate: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!driver) throw new NotFoundException('Driver was not found.');
    const scope = { organizationId: user.organizationId, driverId };
    const [current, recent, totalLoadCount] = await Promise.all([
      this.prisma.loadAssignment.findFirst({
        where: { ...scope, status: { in: [...ACTIVE_ASSIGNMENTS] } },
        orderBy: { assignedAt: 'desc' },
        select: assignmentSelect,
      }),
      this.prisma.loadAssignment.findMany({
        where: { ...scope, status: { not: 'CANCELLED' } },
        orderBy: { assignedAt: 'desc' },
        take: 10,
        select: assignmentSelect,
      }),
      this.prisma.loadAssignment.count({
        where: { ...scope, status: { not: 'CANCELLED' } },
      }),
    ]);
    const { userId, invitation, ...profile } = driver;
    return {
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      cdlExpirationDate:
        profile.cdlExpirationDate?.toISOString().slice(0, 10) ?? null,
      hireDate: profile.hireDate?.toISOString().slice(0, 10) ?? null,
      ...accountState(userId, invitation),
      currentLoad: current ? summary(current) : null,
      recentLoads: recent.map(summary),
      totalLoadCount,
    };
  }

  private async uniqueEmail(
    tx: Prisma.TransactionClient,
    organizationId: string,
    email: string | null | undefined,
    excludeId?: string,
  ) {
    if (!email) return;
    const existing = await tx.driver.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
        email: { equals: email, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException(
        'An active driver with this email already exists in your company.',
      );
  }
  private async write<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'An active driver with this email already exists in your company.',
        );
      throw error;
    }
  }
  private audit(user: AuthenticatedUser, driverId: string, action: string) {
    this.logger.log({
      action,
      driverId,
      organizationId: user.organizationId,
      actorId: user.id,
    });
  }
  async create(user: AuthenticatedUser, dto: CreateDriverDto) {
    const driver = await this.write(async (tx) => {
      await this.uniqueEmail(tx, user.organizationId, dto.email);
      return tx.driver.create({
        data: {
          ...profileInput(dto),
          organizationId: user.organizationId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
    });
    this.audit(user, driver.id, 'driver.created');
    return this.detail(user, driver.id);
  }
  async update(
    user: AuthenticatedUser,
    driverId: string,
    dto: UpdateDriverDto,
  ) {
    await this.write(async (tx) => {
      await lockDriver(tx, user.organizationId, driverId);
      const driver = await tx.driver.findFirst({
        where: { id: driverId, organizationId: user.organizationId },
      });
      if (!driver) throw new NotFoundException('Driver was not found.');
      if (
        driver.userId &&
        dto.email !== undefined &&
        (dto.email?.toLowerCase() ?? null) !== driver.email?.toLowerCase()
      )
        throw new ConflictException(
          'Email is read-only for invited or connected drivers. Contact your administrator for account email changes.',
        );
      if (driver.status === 'ACTIVE')
        await this.uniqueEmail(tx, user.organizationId, dto.email, driverId);
      await tx.driver.update({
        where: { id: driverId, organizationId: user.organizationId },
        data: profileInput(dto),
      });
    });
    this.audit(user, driverId, 'driver.updated');
    return this.detail(user, driverId);
  }
  async setStatus(
    user: AuthenticatedUser,
    driverId: string,
    status: DriverStatus,
  ) {
    const changed = await this.write(async (tx) => {
      await lockDriver(tx, user.organizationId, driverId);
      const driver = await tx.driver.findFirst({
        where: { id: driverId, organizationId: user.organizationId },
      });
      if (!driver) throw new NotFoundException('Driver was not found.');
      if (driver.status === status) return false;
      if (status === 'INACTIVE') {
        const active = await tx.loadAssignment.findFirst({
          where: {
            organizationId: user.organizationId,
            driverId,
            status: { in: [...ACTIVE_ASSIGNMENTS] },
          },
          select: { load: { select: { loadNumber: true } } },
        });
        if (active)
          throw new ConflictException(
            `${driver.firstName} ${driver.lastName} cannot be deactivated while load ${active.load.loadNumber} is active. Complete or reassign the load first.`,
          );
      } else
        await this.uniqueEmail(tx, user.organizationId, driver.email, driverId);
      await tx.driver.update({
        where: { id: driverId, organizationId: user.organizationId },
        data: { status },
      });
      return true;
    });
    if (changed)
      this.audit(
        user,
        driverId,
        status === 'ACTIVE' ? 'driver.activated' : 'driver.deactivated',
      );
    return this.detail(user, driverId);
  }
}

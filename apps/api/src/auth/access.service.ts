import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { Prisma, type StaffInvitation } from '../generated/prisma/client';
import type { AuthenticatedUser } from './auth.types';
import { TokenVerifier } from './token-verifier';
import {
  AccountIdentityProvider,
  type VerifiedAccount,
} from './account-identity-provider';
import {
  AcceptStaffDto,
  ChangeStaffRoleDto,
  InviteStaffDto,
  ProvisionAccountDto,
} from './access.dto';
import type {
  AccountStatus,
  StaffInvite,
  StaffInviteResult,
} from '../../../../packages/api-contracts/access';

type Tx = Prisma.TransactionClient;
const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export const invitationHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
function digest(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(sort(value)))
    .digest('hex');
}
export function names(first: string, last: string) {
  if (!first.trim() || !last.trim())
    throw new BadRequestException('First and last name are required.');
  return { firstName: first.trim(), lastName: last.trim() };
}
export function invitationState(
  invite: Pick<StaffInvitation, 'status' | 'expiresAt'>,
  now = Date.now(),
) {
  return invite.status === 'PENDING' && invite.expiresAt.getTime() <= now
    ? 'EXPIRED'
    : invite.status;
}
@Injectable()
export class AccessService {
  constructor(
    private readonly db: PrismaService,
    private readonly verifier: TokenVerifier,
    private readonly identities: AccountIdentityProvider,
  ) {}
  async identity(authorization?: string) {
    const token = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1];
    if (!token)
      throw new UnauthorizedException('A bearer access token is required.');
    const verified = await this.verifier.verify(token);
    const identity = await this.identities.verifiedAccount(token);
    if (verified.sub !== identity.id)
      throw new UnauthorizedException('Account verification failed.');
    return identity;
  }
  async status(identity: VerifiedAccount): Promise<AccountStatus> {
    const member = await this.db.user.findUnique({
      where: { authUserId: identity.id },
    });
    return member
      ? {
          linked: true,
          active: member.active,
          role: member.role,
          organizationId: member.organizationId,
        }
      : { linked: false, email: identity.email };
  }
  private async audit(
    tx: Tx,
    organizationId: string,
    actorId: string,
    action: string,
    target: string,
    before: unknown,
    after: unknown,
    key: string,
    response: unknown,
    requestHash: string,
  ) {
    await tx.financialAuditEvent.create({
      data: {
        organizationId,
        actorId,
        action,
        recordId: target,
        recordType: 'ACCESS_ADMIN',
        summary: 'Organization access change recorded',
        details: json({
          version: 1,
          requestKey: key,
          requestHash,
          before,
          after,
          response,
        }),
      },
    });
  }
  private async identityLock(tx: Tx, sub: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'access:' + sub},0))`;
  }
  async provision(
    identity: VerifiedAccount,
    dto: ProvisionAccountDto,
  ): Promise<AccountStatus> {
    const person = names(dto.firstName, dto.lastName);
    if (!dto.companyName.trim())
      throw new BadRequestException('Legal company name is required.');
    return this.db.$transaction(async (tx) => {
      await this.identityLock(tx, identity.id);
      const prior = await tx.user.findUnique({
        where: { authUserId: identity.id },
      });
      if (prior) {
        if (!prior.active)
          throw new ForbiddenException(
            'Your membership is inactive. Contact the organization Owner.',
          );
        return {
          linked: true as const,
          active: true,
          role: prior.role,
          organizationId: prior.organizationId,
        };
      }
      const organization = await tx.organization.create({
        data: { name: dto.companyName.trim(), email: identity.email },
      });
      const owner = await tx.user.create({
        data: {
          ...person,
          authUserId: identity.id,
          organizationId: organization.id,
          email: identity.email,
          role: 'OWNER',
        },
      });
      const response = {
        linked: true as const,
        active: true,
        role: 'OWNER',
        organizationId: organization.id,
      };
      await this.audit(
        tx,
        organization.id,
        owner.id,
        'ORGANIZATION_PROVISIONED',
        organization.id,
        null,
        { ownerId: owner.id },
        randomUUID(),
        response,
        digest({ identity: identity.id, dto }),
      );
      return response;
    });
  }
  private async owner(tx: Tx, user: AuthenticatedUser) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id=${user.organizationId}::uuid FOR UPDATE`;
    const current = await tx.user.findFirst({
      where: {
        id: user.id,
        organizationId: user.organizationId,
        authUserId: user.authUserId,
        active: true,
        role: 'OWNER',
      },
    });
    if (!current)
      throw new ForbiddenException(
        'Only a current active Owner can administer access.',
      );
  }
  private view(invite: StaffInvitation): StaffInvite {
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role as StaffInvite['role'],
      status: invitationState(invite),
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
      revokedAt: invite.revokedAt?.toISOString() ?? null,
    };
  }
  async team(user: AuthenticatedUser) {
    return this.db.$transaction(async (tx) => {
      await this.owner(tx, user);
      const members = await tx.user.findMany({
        where: { organizationId: user.organizationId, role: { not: 'DRIVER' } },
        orderBy: [{ active: 'desc' }, { lastName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          active: true,
        },
      });
      const invitations = await tx.staffInvitation.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return { members, invitations: invitations.map((i) => this.view(i)) };
    });
  }
  private async command<T>(
    user: AuthenticatedUser,
    key: string,
    action: string,
    input: unknown,
    run: (tx: Tx) => Promise<{
      id: string;
      before: unknown;
      after: unknown;
      response: T;
      privateResponse?: T;
    }>,
  ): Promise<T> {
    const requestHash = digest({ actor: user.id, action, input });
    try {
      return await this.db.$transaction(async (tx) => {
        await this.owner(tx, user);
        const prior = await tx.financialAuditEvent.findFirst({
          where: {
            organizationId: user.organizationId,
            recordType: 'ACCESS_ADMIN',
            details: { path: ['requestKey'], equals: key },
          },
        });
        if (prior) {
          const d = prior.details as { requestHash: string; response: T };
          if (d.requestHash !== requestHash)
            throw new ConflictException(
              'This request key already belongs to another access change.',
            );
          return d.response;
        }
        const result = await run(tx);
        await this.audit(
          tx,
          user.organizationId,
          user.id,
          action,
          result.id,
          result.before,
          result.after,
          key,
          result.response,
          requestHash,
        );
        return result.privateResponse ?? result.response;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2003', 'P2004', 'P2010', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'Access changed or conflicts with an existing invitation or membership. Refresh and retry safely.',
        );
      throw error;
    }
  }
  private async newInvite(
    tx: Tx,
    user: AuthenticatedUser,
    email: string,
    role: 'BACK_OFFICE' | 'DISPATCHER',
  ) {
    const members = await tx.user.findMany({
      where: {
        organizationId: user.organizationId,
        email: { equals: email, mode: 'insensitive' },
      },
    });
    if (members.some((m) => m.active || m.role === 'DRIVER'))
      throw new ConflictException(
        'This email already belongs to a member. Manage that membership instead.',
      );
    await tx.staffInvitation.updateMany({
      where: {
        organizationId: user.organizationId,
        email,
        status: 'PENDING',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    if (
      await tx.staffInvitation.findFirst({
        where: {
          organizationId: user.organizationId,
          email,
          status: 'PENDING',
        },
      })
    )
      throw new ConflictException(
        'An active invitation already exists for this email. Reissue or revoke it.',
      );
    const token = randomBytes(32).toString('hex');
    const invite = await tx.staffInvitation.create({
      data: {
        organizationId: user.organizationId,
        email,
        role,
        tokenHash: invitationHash(token),
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    const response: StaffInviteResult = {
      invitation: this.view(invite),
      invitePath: null,
    };
    return {
      id: invite.id,
      before: null,
      after: response.invitation,
      response,
      privateResponse: {
        ...response,
        invitePath: `/auth/staff#token=${token}`,
      },
    };
  }
  invite(user: AuthenticatedUser, dto: InviteStaffDto) {
    if (!['BACK_OFFICE', 'DISPATCHER'].includes(dto.role))
      throw new BadRequestException('Only office staff roles may be invited.');
    return this.command(user, dto.idempotencyKey, 'STAFF_INVITED', dto, (tx) =>
      this.newInvite(tx, user, dto.email.trim().toLowerCase(), dto.role),
    );
  }
  revoke(user: AuthenticatedUser, id: string, key: string) {
    return this.command(
      user,
      key,
      'STAFF_INVITATION_REVOKED',
      { id },
      async (tx) => {
        const invite = await tx.staffInvitation.findFirst({
          where: { id, organizationId: user.organizationId },
        });
        if (!invite) throw new NotFoundException('Invitation not found.');
        if (invite.status !== 'PENDING')
          throw new ConflictException(
            'Only pending invitations can be revoked.',
          );
        const updated = await tx.staffInvitation.update({
          where: { id },
          data: {
            status: 'REVOKED',
            revokedAt: new Date(),
            revokedById: user.id,
          },
        });
        return {
          id,
          before: this.view(invite),
          after: this.view(updated),
          response: this.view(updated),
        };
      },
    );
  }
  reissue(user: AuthenticatedUser, id: string, key: string) {
    return this.command(
      user,
      key,
      'STAFF_INVITATION_REISSUED',
      { id },
      async (tx) => {
        const invite = await tx.staffInvitation.findFirst({
          where: { id, organizationId: user.organizationId },
        });
        if (!invite) throw new NotFoundException('Invitation not found.');
        if (invite.status === 'ACCEPTED')
          throw new ConflictException(
            'This invitation was accepted. Manage the member instead.',
          );
        if (invite.status === 'PENDING')
          await tx.staffInvitation.update({
            where: { id },
            data: {
              status: 'REVOKED',
              revokedAt: new Date(),
              revokedById: user.id,
            },
          });
        const result = await this.newInvite(
          tx,
          user,
          invite.email,
          invite.role as 'BACK_OFFICE' | 'DISPATCHER',
        );
        return {
          ...result,
          before: { reissuedInvitationId: id, status: invite.status },
        };
      },
    );
  }
  private async invitation(tx: Tx, identity: VerifiedAccount, token: string) {
    if (!/^[0-9a-f]{64}$/.test(token))
      throw new BadRequestException('Invitation link is malformed.');
    const invite = await tx.staffInvitation.findUnique({
      where: { tokenHash: invitationHash(token) },
    });
    if (!invite || invite.email !== identity.email)
      throw new NotFoundException(
        'Invitation does not match this verified account. Sign in with the invited email.',
      );
    const membership = await tx.user.findUnique({
      where: { authUserId: identity.id },
    });
    if (membership && membership.organizationId !== invite.organizationId)
      throw new ForbiddenException(
        'This account already belongs to a different organization.',
      );
    return { invite, membership };
  }
  async preview(identity: VerifiedAccount, token: string) {
    const { invite } = await this.invitation(this.db, identity, token);
    const organization = await this.db.organization.findUniqueOrThrow({
      where: { id: invite.organizationId },
      select: { name: true },
    });
    return {
      companyName: organization.name,
      email: invite.email,
      role: invite.role,
      status: invitationState(invite),
    };
  }
  async accept(
    identity: VerifiedAccount,
    dto: AcceptStaffDto,
  ): Promise<AccountStatus> {
    const person = names(dto.firstName, dto.lastName);
    return this.db.$transaction(async (tx) => {
      await this.identityLock(tx, identity.id);
      const initial = await this.invitation(tx, identity, dto.token);
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${initial.invite.organizationId}::uuid FOR UPDATE`;
      const { invite, membership } = await this.invitation(
        tx,
        identity,
        dto.token,
      );
      if (invite.status === 'ACCEPTED') {
        if (
          !membership ||
          membership.id !== invite.acceptedById ||
          !membership.active
        )
          throw new ForbiddenException(
            'This invitation was already used and cannot restore revoked access.',
          );
        return {
          linked: true,
          active: true,
          role: membership.role,
          organizationId: membership.organizationId,
        };
      }
      const state = invitationState(invite);
      if (state !== 'PENDING')
        throw new ConflictException(
          `This invitation is ${state.toLowerCase()}. Ask the Owner for a new invitation.`,
        );
      if (
        membership &&
        (membership.active ||
          membership.role === 'DRIVER' ||
          membership.email.toLowerCase() !== identity.email)
      )
        throw new ConflictException(
          'This account already has a membership. Ask the Owner to manage its access.',
        );
      const data = {
        ...person,
        email: identity.email,
        role: invite.role,
        active: true,
      };
      const member = membership
        ? await tx.user.update({ where: { id: membership.id }, data })
        : await tx.user.create({
            data: {
              ...data,
              organizationId: invite.organizationId,
              authUserId: identity.id,
            },
          });
      await tx.staffInvitation.update({
        where: { id: invite.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedById: member.id,
        },
      });
      const response = {
        linked: true as const,
        active: true,
        role: member.role,
        organizationId: member.organizationId,
      };
      await this.audit(
        tx,
        member.organizationId,
        member.id,
        'STAFF_INVITATION_ACCEPTED',
        invite.id,
        { status: 'PENDING' },
        { status: 'ACCEPTED', memberId: member.id, role: member.role },
        randomUUID(),
        response,
        digest({ identity: identity.id, tokenHash: invite.tokenHash }),
      );
      return response;
    });
  }
  change(user: AuthenticatedUser, id: string, dto: ChangeStaffRoleDto) {
    return this.mutateMember(user, id, dto.idempotencyKey, dto.role);
  }
  remove(user: AuthenticatedUser, id: string, key: string) {
    return this.mutateMember(user, id, key, null);
  }
  private mutateMember(
    user: AuthenticatedUser,
    id: string,
    key: string,
    role: 'OWNER' | 'BACK_OFFICE' | 'DISPATCHER' | null,
  ) {
    return this.command(
      user,
      key,
      role ? 'STAFF_ROLE_CHANGED' : 'STAFF_ACCESS_REVOKED',
      { id, role },
      async (tx) => {
        const member = await tx.user.findFirst({
          where: { id, organizationId: user.organizationId },
        });
        if (!member || member.role === 'DRIVER')
          throw new NotFoundException('Office member not found.');
        if (!member.active)
          throw new ConflictException(
            'This member is inactive. Invite them again to restore access.',
          );
        if (
          member.role === 'OWNER' &&
          role !== 'OWNER' &&
          (await tx.user.count({
            where: {
              organizationId: user.organizationId,
              role: 'OWNER',
              active: true,
              id: { not: id },
            },
          })) === 0
        )
          throw new ConflictException(
            'Keep at least one active Owner. The final Owner cannot be removed or downgraded.',
          );
        const updated = await tx.user.update({
          where: { id },
          data: role ? { role } : { active: false },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            active: true,
          },
        });
        return {
          id,
          before: { role: member.role, active: member.active },
          after: { role: updated.role, active: updated.active },
          response: updated,
        };
      },
    );
  }
}

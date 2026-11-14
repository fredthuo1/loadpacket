import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.types';
const ALLOW_PENDING = 'allowPendingInvitation';
export const AllowPendingInvitation = () => SetMetadata(ALLOW_PENDING, true);
@Injectable()
export class InvitationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (
      user?.onboardingRequired &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      throw new ForbiddenException(
        'Complete your driver invitation before accessing LoadPacket.',
      );
    return true;
  }
}

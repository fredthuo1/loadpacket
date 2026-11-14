import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../generated/prisma/enums';
import { ALLOWED_ROLES } from './roles.decorator';
import { PUBLIC_ROUTE } from './public.decorator';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets))
      return true;
    const roles = this.reflector.getAllAndOverride<UserRole[]>(
      ALLOWED_ROLES,
      targets,
    );
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !roles?.includes(user.role))
      throw new ForbiddenException('Your role cannot access this operation.');
    return true;
  }
}

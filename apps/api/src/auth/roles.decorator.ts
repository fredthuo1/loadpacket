import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/enums';
export const ALLOWED_ROLES = 'loadpacket:roles';
export const Roles = (...roles: UserRole[]) =>
  SetMetadata(ALLOWED_ROLES, roles);

import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/enums';

export type AuthenticatedUser = Readonly<{
  id: string;
  authUserId: string;
  organizationId: string;
  role: UserRole;
  email: string;
  firstName: string;
  lastName: string;
  driverId: string | null;
  driverName: string | null;
  onboardingRequired?: boolean;
  passwordAuthenticatedAt?: number;
}>;

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

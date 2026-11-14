import type { UserRole } from '@lms/shared';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  email?: string;
  tenantId: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

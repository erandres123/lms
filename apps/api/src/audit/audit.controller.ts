import type { AuditQuery } from '@lms/shared';
import { auditQuerySchema } from '@lms/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('school_admin')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery,
  ) {
    return this.audit.list(user, query);
  }
}

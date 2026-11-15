import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrivacyService } from './privacy.service';

const idPipe = new ZodValidationPipe(z.uuid());

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('students/:studentId/export')
  @Roles('school_admin')
  exportStudent(
    @CurrentUser() user: AuthUser,
    @Param('studentId', idPipe) studentId: string,
  ) {
    return this.privacy.dsarExport(user, studentId);
  }

  @Get('students/:studentId/erasure-dry-run')
  @Roles('school_admin')
  erasureDryRun(
    @CurrentUser() user: AuthUser,
    @Param('studentId', idPipe) studentId: string,
  ) {
    return this.privacy.erasureDryRun(user, studentId);
  }
}

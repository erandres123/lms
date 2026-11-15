import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  consentCaptureSchema,
  guardianAccessUpdateSchema,
  guardianCreateSchema,
  privacyNoticeUpdateSchema,
  type ConsentCaptureInput,
  type GuardianAccessUpdateInput,
  type GuardianCreateInput,
  type PrivacyNoticeUpdateInput,
} from '@lms/shared';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrivacyService } from './privacy.service';

const idPipe = new ZodValidationPipe(z.uuid());

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('notice')
  notice(@CurrentUser() user: AuthUser) {
    return this.privacy.notice(user);
  }

  @Put('notice')
  @Roles('school_admin')
  updateNotice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(privacyNoticeUpdateSchema)) input: PrivacyNoticeUpdateInput,
  ) {
    return this.privacy.updateNotice(user, input);
  }

  @Get('consents')
  @Roles('school_admin')
  consents(@CurrentUser() user: AuthUser) {
    return this.privacy.consents(user);
  }

  @Post('students/:studentId/consents')
  @Roles('school_admin')
  captureConsent(
    @CurrentUser() user: AuthUser,
    @Param('studentId', idPipe) studentId: string,
    @Body(new ZodValidationPipe(consentCaptureSchema)) input: ConsentCaptureInput,
  ) {
    return this.privacy.captureConsent(user, studentId, input);
  }

  @Get('students/:studentId/export')
  @Roles('school_admin')
  exportStudent(@CurrentUser() user: AuthUser, @Param('studentId', idPipe) studentId: string) {
    return this.privacy.dsarExport(user, studentId);
  }

  @Get('students/:studentId/erasure-dry-run')
  @Roles('school_admin')
  erasureDryRun(@CurrentUser() user: AuthUser, @Param('studentId', idPipe) studentId: string) {
    return this.privacy.erasureDryRun(user, studentId);
  }

  @Get('guardian-access')
  @Roles('school_admin')
  guardianAccess(@CurrentUser() user: AuthUser) {
    return this.privacy.guardianAccess(user);
  }

  @Put('guardian-access')
  @Roles('school_admin')
  updateGuardianAccess(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(guardianAccessUpdateSchema)) input: GuardianAccessUpdateInput,
  ) {
    return this.privacy.updateGuardianAccess(user, input);
  }

  @Get('guardians')
  @Roles('school_admin')
  guardians(@CurrentUser() user: AuthUser) {
    return this.privacy.guardians(user);
  }

  @Post('guardians')
  @Roles('school_admin')
  createGuardian(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(guardianCreateSchema)) input: GuardianCreateInput,
  ) {
    return this.privacy.createGuardian(user, input);
  }
}

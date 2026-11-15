import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import {
  guardianConsentCaptureSchema,
  type GuardianConsentCaptureInput,
} from '@lms/shared';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrivacyService } from './privacy.service';

const idPipe = new ZodValidationPipe(z.uuid());

@Controller('guardian')
@Roles('parent')
export class GuardianController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.privacy.guardianOverview(user);
  }

  @Post('students/:studentId/consents')
  consent(
    @CurrentUser() user: AuthUser,
    @Param('studentId', idPipe) studentId: string,
    @Body(new ZodValidationPipe(guardianConsentCaptureSchema)) input: GuardianConsentCaptureInput,
  ) {
    return this.privacy.captureGuardianConsent(user, studentId, input);
  }
}

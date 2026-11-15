import type {
  RetentionOverview,
  RetentionRun,
  RetentionSettings,
  RetentionUpdateInput,
} from '@lms/shared';
import { retentionUpdateSchema } from '@lms/shared';
import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RetentionService } from './retention.service';

@Controller('retention')
@Roles('school_admin')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<RetentionOverview> {
    return this.retention.overview(user);
  }

  @Put()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(retentionUpdateSchema)) body: RetentionUpdateInput,
  ): Promise<RetentionSettings> {
    return this.retention.updatePolicy(user, body);
  }

  @Post('dry-run')
  dryRun(@CurrentUser() user: AuthUser): Promise<RetentionRun> {
    return this.retention.dryRun(user);
  }
}

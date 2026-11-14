import type { SyncPushInput, SyncPullQuery } from '@lms/shared';
import { syncPushSchema, syncPullQuerySchema } from '@lms/shared';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('pull')
  @Roles('school_admin', 'teacher', 'student')
  pull(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(syncPullQuerySchema)) query: SyncPullQuery,
  ) {
    return this.sync.pull(user, query);
  }

  @Post('push')
  @Roles('school_admin', 'teacher')
  push(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(syncPushSchema)) body: SyncPushInput,
  ) {
    return this.sync.push(user, body);
  }

  @Get('stats')
  @Roles('school_admin')
  stats(@CurrentUser() user: AuthUser) {
    return this.sync.stats(user);
  }
}

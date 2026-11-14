import type { NotificationQuery, RegisterPushDeviceInput } from '@lms/shared';
import {
  notificationQuerySchema,
  registerPushDeviceSchema,
} from '@lms/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

const idPipe = new ZodValidationPipe(z.uuid());

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Roles('school_admin', 'teacher', 'student')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(notificationQuerySchema)) query: NotificationQuery,
  ) {
    return this.notifications.list(user, query);
  }

  @Post(':notificationId/read')
  @Roles('school_admin', 'teacher', 'student')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('notificationId', idPipe) notificationId: string,
  ) {
    return this.notifications.markRead(user, notificationId);
  }

  @Post('devices')
  @Roles('school_admin', 'teacher', 'student')
  registerDevice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(registerPushDeviceSchema)) body: RegisterPushDeviceInput,
  ) {
    return this.notifications.registerDevice(user, body);
  }

  @Delete('devices/:deviceId')
  @Roles('school_admin', 'teacher', 'student')
  @HttpCode(200)
  removeDevice(@CurrentUser() user: AuthUser, @Param('deviceId', idPipe) deviceId: string) {
    return this.notifications.removeDevice(user, deviceId);
  }
}

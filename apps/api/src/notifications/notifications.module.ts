import { Module } from '@nestjs/common';
import { ClassStartScheduler } from './class-start.scheduler';
import { FcmPushSender } from './fcm-push-sender';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PUSH_SENDER } from './push-sender';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ClassStartScheduler,
    { provide: PUSH_SENDER, useClass: FcmPushSender },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}

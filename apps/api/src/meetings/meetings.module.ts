import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module';
import { LiveKitWebhookController } from './livekit-webhook.controller';
import { LiveKitProvider } from './livekit.provider';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [AcademicModule],
  controllers: [MeetingsController, LiveKitWebhookController],
  providers: [MeetingsService, LiveKitProvider],
})
export class MeetingsModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcademicModule } from './academic/academic.module';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { GradebookModule } from './gradebook/gradebook.module';
import { HealthModule } from './health/health.module';
import { MeetingsModule } from './meetings/meetings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    AcademicModule,
    GradebookModule,
    MeetingsModule,
    NotificationsModule,
    SyncModule,
    HealthModule,
  ],
})
export class AppModule {}

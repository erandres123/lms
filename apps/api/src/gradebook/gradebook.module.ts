import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GradebookController } from './gradebook.controller';
import { GradebookService } from './gradebook.service';

@Module({
  imports: [AcademicModule, NotificationsModule],
  controllers: [GradebookController],
  providers: [GradebookService],
})
export class GradebookModule {}

import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AcademicService } from './academic.service';
import { AttendanceController } from './attendance.controller';
import { SectionAccessService } from './section-access.service';
import { SectionsController } from './sections.controller';
import { StudentsController } from './students.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [SectionsController, StudentsController, AttendanceController],
  providers: [AcademicService, SectionAccessService],
  exports: [AcademicService, SectionAccessService],
})
export class AcademicModule {}

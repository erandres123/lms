import type { SaveAttendanceInput } from '@lms/shared';
import { isoDateSchema, saveAttendanceSchema } from '@lms/shared';
import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AcademicService } from './academic.service';

const sectionIdPipe = new ZodValidationPipe(z.uuid());
const datePipe = new ZodValidationPipe(isoDateSchema);

@Controller('sections/:sectionId/attendance')
export class AttendanceController {
  constructor(private readonly academic: AcademicService) {}

  @Get()
  @Roles('school_admin', 'teacher', 'student')
  get(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Query('date', datePipe) date: string,
  ) {
    return this.academic.getAttendance(user, sectionId, date);
  }

  @Put()
  @Roles('school_admin', 'teacher')
  save(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Body(new ZodValidationPipe(saveAttendanceSchema)) body: SaveAttendanceInput,
  ) {
    return this.academic.saveAttendance(user, sectionId, body);
  }
}

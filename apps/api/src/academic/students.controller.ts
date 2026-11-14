import type { CreateStudentInput } from '@lms/shared';
import { createStudentSchema } from '@lms/shared';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AcademicService } from './academic.service';

@Controller('students')
export class StudentsController {
  constructor(private readonly academic: AcademicService) {}

  @Get()
  @Roles('school_admin', 'teacher')
  list(@CurrentUser() user: AuthUser) {
    return this.academic.listStudents(user);
  }

  @Post()
  @Roles('school_admin')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createStudentSchema)) body: CreateStudentInput,
  ) {
    return this.academic.createStudent(user, body);
  }
}

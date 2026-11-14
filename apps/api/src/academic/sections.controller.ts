import type { CreateSectionInput, EnrollStudentsInput } from '@lms/shared';
import { enrollStudentsSchema, createSectionSchema } from '@lms/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AcademicService } from './academic.service';

const sectionIdPipe = new ZodValidationPipe(z.uuid());

interface UploadedRosterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('sections')
export class SectionsController {
  constructor(private readonly academic: AcademicService) {}

  @Get()
  @Roles('school_admin', 'teacher', 'student')
  list(@CurrentUser() user: AuthUser) {
    return this.academic.listSections(user);
  }

  @Post()
  @Roles('school_admin')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSectionSchema)) body: CreateSectionInput,
  ) {
    return this.academic.createSection(user, body);
  }

  @Get(':sectionId/roster')
  @Roles('school_admin', 'teacher', 'student')
  roster(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
  ) {
    return this.academic.getRoster(user, sectionId);
  }

  @Post(':sectionId/enrollments')
  @Roles('school_admin')
  enroll(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Body(new ZodValidationPipe(enrollStudentsSchema)) body: EnrollStudentsInput,
  ) {
    return this.academic.enrollStudents(user, sectionId, body.studentIds);
  }

  @Post(':sectionId/roster/import')
  @Roles('school_admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  importRoster(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @UploadedFile() file: UploadedRosterFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('a .csv or .xlsx file is required in the "file" field');
    }
    return this.academic.importRoster(user, sectionId, file);
  }
}

import type {
  CreateGradeCategoryInput,
  CreateGradeItemInput,
  CreateGradingPeriodInput,
  GradebookQuery,
  GradeOverrideInput,
  SaveGradesInput,
} from '@lms/shared';
import {
  createGradeCategorySchema,
  createGradeItemSchema,
  createGradingPeriodSchema,
  gradebookQuerySchema,
  gradeOverrideSchema,
  saveGradesSchema,
} from '@lms/shared';
import { Body, Controller, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GradebookService } from './gradebook.service';

const sectionIdPipe = new ZodValidationPipe(z.uuid());

@Controller()
export class GradebookController {
  constructor(private readonly gradebook: GradebookService) {}

  @Get('grading-periods')
  @Roles('school_admin', 'teacher', 'student')
  listPeriods(@CurrentUser() user: AuthUser) {
    return this.gradebook.listPeriods(user);
  }

  @Post('grading-periods')
  @Roles('school_admin')
  createPeriod(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createGradingPeriodSchema)) body: CreateGradingPeriodInput,
  ) {
    return this.gradebook.createPeriod(user, body);
  }

  @Post('sections/:sectionId/grade-categories')
  @Roles('school_admin', 'teacher')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Body(new ZodValidationPipe(createGradeCategorySchema)) body: CreateGradeCategoryInput,
  ) {
    return this.gradebook.createCategory(user, sectionId, body);
  }

  @Post('sections/:sectionId/grade-items')
  @Roles('school_admin', 'teacher')
  createItem(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Body(new ZodValidationPipe(createGradeItemSchema)) body: CreateGradeItemInput,
  ) {
    return this.gradebook.createItem(user, sectionId, body);
  }

  @Put('sections/:sectionId/grades')
  @Roles('school_admin', 'teacher')
  saveGrades(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Body(new ZodValidationPipe(saveGradesSchema)) body: SaveGradesInput,
  ) {
    return this.gradebook.saveGrades(user, sectionId, body);
  }

  @Put('sections/:sectionId/grade-overrides')
  @Roles('school_admin')
  setOverride(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Body(new ZodValidationPipe(gradeOverrideSchema)) body: GradeOverrideInput,
  ) {
    return this.gradebook.setOverride(user, sectionId, body);
  }

  @Get('sections/:sectionId/gradebook')
  @Roles('school_admin', 'teacher', 'student')
  getGradebook(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Query(new ZodValidationPipe(gradebookQuerySchema)) query: GradebookQuery,
  ) {
    return this.gradebook.getGradebook(user, sectionId, query.periodId);
  }

  @Get('sections/:sectionId/competencies')
  @Roles('school_admin', 'teacher')
  getCompetencies(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Query(new ZodValidationPipe(gradebookQuerySchema)) query: GradebookQuery,
  ) {
    return this.gradebook.getCompetencies(user, sectionId, query.periodId);
  }

  @Get('sections/:sectionId/reports/sf9-draft')
  @Roles('school_admin', 'teacher')
  async downloadSf9Draft(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Query(new ZodValidationPipe(gradebookQuerySchema)) query: GradebookQuery,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.gradebook.sf9Draft(
      user,
      sectionId,
      query.periodId,
    );

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(buffer);
  }
}

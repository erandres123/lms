import type { CreateMeetingInput, MeetingQuery } from '@lms/shared';
import { createMeetingSchema, meetingQuerySchema } from '@lms/shared';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MeetingsService } from './meetings.service';

const sectionIdPipe = new ZodValidationPipe(z.uuid());
const meetingIdPipe = new ZodValidationPipe(z.uuid());

@Controller()
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get('sections/:sectionId/meetings')
  @Roles('school_admin', 'teacher', 'student')
  list(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Query(new ZodValidationPipe(meetingQuerySchema)) query: MeetingQuery,
  ) {
    return this.meetings.list(user, sectionId, query);
  }

  @Post('sections/:sectionId/meetings')
  @Roles('school_admin', 'teacher')
  create(
    @CurrentUser() user: AuthUser,
    @Param('sectionId', sectionIdPipe) sectionId: string,
    @Body(new ZodValidationPipe(createMeetingSchema)) body: CreateMeetingInput,
  ) {
    return this.meetings.create(user, sectionId, body);
  }

  @Post('meetings/:meetingId/start')
  @Roles('school_admin', 'teacher')
  start(
    @CurrentUser() user: AuthUser,
    @Param('meetingId', meetingIdPipe) meetingId: string,
  ) {
    return this.meetings.start(user, meetingId);
  }

  @Post('meetings/:meetingId/end')
  @Roles('school_admin', 'teacher')
  end(@CurrentUser() user: AuthUser, @Param('meetingId', meetingIdPipe) meetingId: string) {
    return this.meetings.end(user, meetingId);
  }

  @Post('meetings/:meetingId/join')
  @Roles('school_admin', 'teacher', 'student')
  join(@CurrentUser() user: AuthUser, @Param('meetingId', meetingIdPipe) meetingId: string) {
    return this.meetings.join(user, meetingId);
  }

  @Get('meetings/:meetingId/participants')
  @Roles('school_admin', 'teacher')
  participants(
    @CurrentUser() user: AuthUser,
    @Param('meetingId', meetingIdPipe) meetingId: string,
  ) {
    return this.meetings.participants(user, meetingId);
  }
}

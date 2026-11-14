import type { Meeting, MeetingParticipant } from '@lms/shared';
import type * as schema from '../database/schema';

export function toMeeting(
  row: typeof schema.meetings.$inferSelect,
  providerConfigured: boolean,
): Meeting {
  return {
    id: row.id,
    sectionId: row.sectionId,
    title: row.title,
    provider: row.provider,
    status: row.status,
    scheduledFor: row.scheduledFor.toISOString(),
    durationMinutes: row.durationMinutes,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    joinable: row.status === 'live' && providerConfigured,
    providerConfigured,
  };
}

export function toParticipant(
  row: typeof schema.meetingParticipants.$inferSelect,
  studentName: string | null,
): MeetingParticipant {
  return {
    id: row.id,
    identity: row.identity,
    userId: row.userId,
    studentId: row.studentId,
    displayName: row.displayName,
    studentName,
    role: row.role,
    firstJoinedAt: row.firstJoinedAt.toISOString(),
    lastLeftAt: row.lastLeftAt?.toISOString() ?? null,
    totalSeconds: row.totalSeconds,
  };
}

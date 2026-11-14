import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types';

export type MeetingRole = 'moderator' | 'viewer';

export function meetingRoleFor(role: AuthUser['role']): MeetingRole {
  return role === 'school_admin' || role === 'teacher' ? 'moderator' : 'viewer';
}

export function buildRoomName(tenantId: string): string {
  return `lms.${tenantId.replace(/-/g, '')}.${randomUUID().replace(/-/g, '')}`;
}

export function joinTtlSeconds(
  now: Date,
  meeting: { scheduledFor: Date; durationMinutes: number },
): number {
  const nominalEnd = meeting.scheduledFor.getTime() + meeting.durationMinutes * 60_000;
  const remaining = Math.ceil((nominalEnd - now.getTime()) / 1000) + 15 * 60;
  return Math.min(4 * 60 * 60, Math.max(30 * 60, remaining));
}

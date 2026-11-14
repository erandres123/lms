import { describe, expect, it } from 'vitest';
import { buildRoomName, joinTtlSeconds, meetingRoleFor } from './meeting-policy';

describe('meeting policy', () => {
  it('gives teachers and admins moderator control', () => {
    expect(meetingRoleFor('teacher')).toBe('moderator');
    expect(meetingRoleFor('school_admin')).toBe('moderator');
  });

  it('treats students and parents as viewers', () => {
    expect(meetingRoleFor('student')).toBe('viewer');
    expect(meetingRoleFor('parent')).toBe('viewer');
  });

  it('builds tenant-prefixed, unguessable room names', () => {
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const first = buildRoomName(tenantId);
    const second = buildRoomName(tenantId);

    expect(first.startsWith('lms.00000000000040008')).toBe(true);
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThan(256);
  });

  it('keeps a token valid for at least 30 minutes', () => {
    const now = new Date('2026-11-14T01:00:00Z');
    const ttl = joinTtlSeconds(now, {
      scheduledFor: new Date('2026-11-14T00:00:00Z'),
      durationMinutes: 60,
    });
    expect(ttl).toBe(30 * 60);
  });

  it('caps tokens at four hours for future classes', () => {
    const now = new Date('2026-11-14T01:00:00Z');
    const ttl = joinTtlSeconds(now, {
      scheduledFor: new Date('2026-11-20T01:00:00Z'),
      durationMinutes: 60,
    });
    expect(ttl).toBe(4 * 60 * 60);
  });

  it('covers the class end plus a 15 minute grace period', () => {
    const now = new Date('2026-11-14T01:00:00Z');
    const ttl = joinTtlSeconds(now, {
      scheduledFor: new Date('2026-11-14T00:30:00Z'),
      durationMinutes: 60,
    });
    expect(ttl).toBe(30 * 60 + 15 * 60);
  });
});

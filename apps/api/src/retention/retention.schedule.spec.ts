import { describe, expect, it } from 'vitest';
import { isRetentionDue, localDayAndHour } from './retention.schedule';

describe('retention schedule', () => {
  it('reads the local day and hour in the tenant timezone', () => {
    const instant = new Date('2026-01-15T19:30:00Z');

    expect(localDayAndHour(instant, 'Asia/Manila')).toEqual({ day: '2026-01-16', hour: 3 });
    expect(localDayAndHour(instant, 'UTC')).toEqual({ day: '2026-01-15', hour: 19 });
  });

  it('waits for the configured run hour', () => {
    const now = new Date('2026-01-15T17:30:00Z'); // 01:30 in Manila

    expect(isRetentionDue(now, 'Asia/Manila', 2, null)).toBe(false);
  });

  it('runs once per local day after the run hour', () => {
    const now = new Date('2026-01-15T19:30:00Z'); // 03:30 on 2026-01-16 in Manila
    const sameDay = new Date('2026-01-15T20:00:00Z');
    const previousDay = new Date('2026-01-14T20:00:00Z');

    expect(isRetentionDue(now, 'Asia/Manila', 2, null)).toBe(true);
    expect(isRetentionDue(now, 'Asia/Manila', 2, sameDay)).toBe(false);
    expect(isRetentionDue(now, 'Asia/Manila', 2, previousDay)).toBe(true);
  });

  it('compares days in the tenant timezone, not UTC', () => {
    // 2026-01-15T15:30Z is 23:30 on the 15th in Manila and 16:30 on the 15th in UTC.
    const lastRun = new Date('2026-01-15T15:30:00Z');
    const now = new Date('2026-01-15T19:30:00Z'); // 03:30 on the 16th in Manila

    expect(isRetentionDue(now, 'Asia/Manila', 2, lastRun)).toBe(true);
    expect(isRetentionDue(new Date('2026-01-15T19:59:00Z'), 'UTC', 2, lastRun)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  absenceMarkedNotification,
  classStartingNotification,
  dedupeKeys,
  gradePostedNotification,
} from './notification-copy';

describe('notification copy', () => {
  it('describes a posted grade with the item and section', () => {
    const copy = gradePostedNotification({
      sectionName: 'Grade 7 - Rizal',
      itemTitle: 'Quiz 1',
      score: 18,
      maxScore: 20,
    });

    expect(copy.title).toBe('New grade posted');
    expect(copy.body).toBe('Quiz 1: 18/20 in Grade 7 - Rizal');
  });

  it('describes an absence with the date', () => {
    const copy = absenceMarkedNotification({
      sectionName: 'Grade 7 - Rizal',
      date: '2026-11-14',
    });

    expect(copy.body).toContain('Grade 7 - Rizal');
    expect(copy.body).toContain('2026-11-14');
  });

  it('rounds the class reminder to whole minutes', () => {
    const copy = classStartingNotification({
      sectionName: 'Grade 7 - Rizal',
      meetingTitle: 'Angles check-in',
      startsAt: '9:00 AM',
      minutesUntilStart: 14.6,
    });

    expect(copy.body).toBe(
      'Angles check-in (Grade 7 - Rizal) starts at 9:00 AM, in 15 minutes.',
    );
  });

  it('uses singular minute wording and never says zero minutes', () => {
    const copy = classStartingNotification({
      sectionName: 'Grade 7 - Rizal',
      meetingTitle: 'Angles check-in',
      startsAt: '9:00 AM',
      minutesUntilStart: 0.2,
    });

    expect(copy.body).toContain('in 1 minute.');
  });

  it('builds stable dedupe keys per item, date, and meeting', () => {
    expect(dedupeKeys.gradePosted('item-1')).toBe('grade-posted:item-1');
    expect(dedupeKeys.absenceMarked('2026-11-14', 'student-1')).toBe(
      'absence-marked:2026-11-14:student-1',
    );
    expect(dedupeKeys.classStarting('meeting-1')).toBe('class-starting:meeting-1');
  });
});

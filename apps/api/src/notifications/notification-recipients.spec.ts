import { describe, expect, it } from 'vitest';
import { classStartingRecipients } from './notification-recipients';

describe('classStartingRecipients', () => {
  it('includes the section teacher and enrolled students', () => {
    expect(
      classStartingRecipients({
        teacherId: 'teacher-1',
        studentUserIds: ['student-1', 'student-2'],
      }),
    ).toEqual(['teacher-1', 'student-1', 'student-2']);
  });

  it('skips missing accounts and removes duplicates', () => {
    expect(
      classStartingRecipients({
        teacherId: null,
        studentUserIds: ['student-1', null, 'student-1'],
      }),
    ).toEqual(['student-1']);
  });

  it('collapses a teacher who is also linked to a student record', () => {
    expect(
      classStartingRecipients({
        teacherId: 'user-1',
        studentUserIds: ['user-1'],
      }),
    ).toEqual(['user-1']);
  });
});

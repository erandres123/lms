export interface NotificationCopy {
  title: string;
  body: string;
}

export function gradePostedNotification(input: {
  sectionName: string;
  itemTitle: string;
  score: number;
  maxScore: number;
}): NotificationCopy {
  return {
    title: 'New grade posted',
    body: `${input.itemTitle}: ${input.score}/${input.maxScore} in ${input.sectionName}`,
  };
}

export function absenceMarkedNotification(input: {
  sectionName: string;
  date: string;
}): NotificationCopy {
  return {
    title: 'Marked absent',
    body: `You were marked absent in ${input.sectionName} on ${input.date}`,
  };
}

export function classStartingNotification(input: {
  sectionName: string;
  meetingTitle: string;
  startsAt: string;
  minutesUntilStart: number;
}): NotificationCopy {
  const minutes = Math.max(1, Math.round(input.minutesUntilStart));
  return {
    title: 'Class starting soon',
    body: `${input.meetingTitle} (${input.sectionName}) starts at ${input.startsAt}, in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
  };
}

export const dedupeKeys = {
  gradePosted: (itemId: string) => `grade-posted:${itemId}`,
  absenceMarked: (date: string, studentId: string) => `absence-marked:${date}:${studentId}`,
  classStarting: (meetingId: string) => `class-starting:${meetingId}`,
};

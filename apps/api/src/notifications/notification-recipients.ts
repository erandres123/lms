export function classStartingRecipients(input: {
  teacherId: string | null;
  studentUserIds: Array<string | null>;
}): string[] {
  const ids = new Set<string>();
  if (input.teacherId) ids.add(input.teacherId);
  for (const userId of input.studentUserIds) {
    if (userId) ids.add(userId);
  }
  return [...ids];
}

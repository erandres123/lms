export function localDayAndHour(instant: Date, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    day: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
  };
}

export function isRetentionDue(
  now: Date,
  timeZone: string,
  runHour: number,
  lastScheduledRun: Date | null,
): boolean {
  const current = localDayAndHour(now, timeZone);
  if (current.hour < runHour) return false;
  if (!lastScheduledRun) return true;
  return localDayAndHour(lastScheduledRun, timeZone).day !== current.day;
}

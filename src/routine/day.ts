const pad = (n: number): string => String(n).padStart(2, "0");

/** Local calendar date of `date` as `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day before `day` (`YYYY-MM-DD`). UTC arithmetic keeps DST changes out of it. */
export function previousDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date - 1))
    .toISOString()
    .slice(0, 10);
}

/** Real milliseconds from `now` to the next local midnight. Hours can be 23 or 25 on DST days. */
export function msUntilNextMidnight(now: Date): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return nextMidnight.getTime() - now.getTime();
}

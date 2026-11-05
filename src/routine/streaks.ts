import { previousDay } from "./day";
import type { DayRow, DayStatus, GameLifetime } from "./types";

/** Whether `game` belongs to the routine of `day`. Day keys compare lexically. */
export function inRoutine(game: GameLifetime, day: string): boolean {
  return (
    (game.addedDay === null || game.addedDay <= day) &&
    (game.removedDay === null || game.removedDay > day)
  );
}

/** Status of each game that has a row on `day`. */
export function statusesOn(
  rows: DayRow[],
  day: string,
): Map<number, DayStatus> {
  const statuses = new Map<number, DayStatus>();
  for (const row of rows) {
    if (row.day === day) statuses.set(row.gameId, row.status);
  }
  return statuses;
}

/** Consecutive finished days of one game. Today is skipped while still to do. */
export function gameStreak(
  gameId: number,
  rows: DayRow[],
  today: string,
): number {
  const statusByDay = new Map<string, DayStatus>();
  for (const row of rows) {
    if (row.gameId === gameId) statusByDay.set(row.day, row.status);
  }
  const todayStatus = statusByDay.get(today);
  if (todayStatus === "ignored") return 0;
  let day = todayStatus === "finished" ? today : previousDay(today);
  let streak = 0;
  while (statusByDay.get(day) === "finished") {
    streak += 1;
    day = previousDay(day);
  }
  return streak;
}

function indexByDay(rows: DayRow[]): Map<string, Map<number, DayStatus>> {
  const byDay = new Map<string, Map<number, DayStatus>>();
  for (const row of rows) {
    let statuses = byDay.get(row.day);
    if (!statuses) {
      statuses = new Map();
      byDay.set(row.day, statuses);
    }
    statuses.set(row.gameId, row.status);
  }
  return byDay;
}

function countsWith(
  day: string,
  games: GameLifetime[],
  statuses: Map<number, DayStatus> | undefined,
): boolean {
  if (!statuses) return false;
  const routine = games.filter((game) => inRoutine(game, day));
  if (routine.length === 0) return false;
  let finished = false;
  for (const game of routine) {
    const status = statuses.get(game.id);
    if (status === undefined) return false;
    if (status === "finished") finished = true;
  }
  return finished;
}

/** A day counts when every game of its routine has a row and one is finished. */
export function dayCounts(
  day: string,
  games: GameLifetime[],
  rows: DayRow[],
): boolean {
  return countsWith(day, games, statusesOn(rows, day));
}

/** Consecutive counting days. Today is skipped while the day is still in progress. */
export function dayStreak(
  games: GameLifetime[],
  rows: DayRow[],
  today: string,
): number {
  const byDay = indexByDay(rows);
  const counts = (day: string) => countsWith(day, games, byDay.get(day));
  let day = counts(today) ? today : previousDay(today);
  let streak = 0;
  // Ends at the first day without a qualifying row, so it terminates on any input.
  while (counts(day)) {
    streak += 1;
    day = previousDay(day);
  }
  return streak;
}

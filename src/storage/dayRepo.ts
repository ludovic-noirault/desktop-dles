import type { DayRow, DayStatus, GameLifetime } from "../routine/types";
import type { Db } from "./db";

export async function setDayStatus(
  db: Db,
  gameId: number,
  day: string,
  status: DayStatus,
): Promise<void> {
  await db.execute(
    "INSERT INTO day_status (game_id, day, status) VALUES (?, ?, ?) ON CONFLICT (game_id, day) DO UPDATE SET status = excluded.status",
    [gameId, day, status],
  );
}

export async function clearDayStatus(
  db: Db,
  gameId: number,
  day: string,
): Promise<void> {
  await db.execute("DELETE FROM day_status WHERE game_id = ? AND day = ?", [
    gameId,
    day,
  ]);
}

export function listDayRows(db: Db): Promise<DayRow[]> {
  return db.select<DayRow>(
    "SELECT game_id AS gameId, day, status FROM day_status ORDER BY day, game_id",
  );
}

export function listLifetimes(db: Db): Promise<GameLifetime[]> {
  return db.select<GameLifetime>(
    "SELECT id, added_day AS addedDay, removed_day AS removedDay FROM games ORDER BY id",
  );
}

import type { Game } from "../routine/types";
import type { Db } from "./db";

export function listGames(db: Db): Promise<Game[]> {
  return db.select<Game>(
    "SELECT id, name, url, position FROM games WHERE removed_day IS NULL ORDER BY position",
  );
}

export async function addGame(
  db: Db,
  name: string,
  url: string,
  today: string,
): Promise<Game> {
  const [{ next }] = await db.select<{ next: number }>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM games WHERE removed_day IS NULL",
  );
  const game = { name: name.trim(), url: url.trim(), position: next };
  const { lastInsertId } = await db.execute(
    "INSERT INTO games (name, url, position, added_day) VALUES (?, ?, ?, ?)",
    [game.name, game.url, game.position, today],
  );
  return { id: lastInsertId as number, ...game };
}

export async function updateGame(
  db: Db,
  id: number,
  name: string,
  url: string,
): Promise<void> {
  await db.execute("UPDATE games SET name = ?, url = ? WHERE id = ?", [
    name.trim(),
    url.trim(),
    id,
  ]);
}

// Soft removal: the row stays so past days keep their history and streaks.
export async function removeGame(
  db: Db,
  id: number,
  today: string,
): Promise<void> {
  await db.execute("UPDATE games SET removed_day = ? WHERE id = ?", [
    today,
    id,
  ]);
  await saveOrder(db, await listGames(db));
}

// One UPDATE per row: the plugin exposes no transaction across calls.
export async function saveOrder(db: Db, games: Game[]): Promise<void> {
  for (const [position, game] of games.entries()) {
    await db.execute("UPDATE games SET position = ? WHERE id = ?", [
      position,
      game.id,
    ]);
  }
}

export async function getShuffle(db: Db): Promise<boolean> {
  const rows = await db.select<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'shuffle'",
  );
  return rows[0]?.value === "1";
}

export async function setShuffle(db: Db, value: boolean): Promise<void> {
  await db.execute("UPDATE settings SET value = ? WHERE key = 'shuffle'", [
    value ? "1" : "0",
  ]);
}

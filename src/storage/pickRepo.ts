import type { CatalogGame, GameInfo } from "../dles/catalog";
import type { Db } from "./db";

export type PickStatus = "shown" | "added";
export type StoredPick = CatalogGame &
  GameInfo & { day: string; status: PickStatus };

export async function getPick(db: Db, day: string): Promise<StoredPick | null> {
  const rows = await db.select<StoredPick>(
    "SELECT day, slug, name, url, category, synopsis, status FROM daily_pick WHERE day = ?",
    [day],
  );
  return rows[0] ?? null;
}

export async function savePick(db: Db, pick: StoredPick): Promise<void> {
  await db.execute(
    "INSERT OR REPLACE INTO daily_pick (day, slug, name, url, category, synopsis, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      pick.day,
      pick.slug,
      pick.name,
      pick.url,
      pick.category,
      pick.synopsis,
      pick.status,
    ],
  );
}

export async function markPickAdded(db: Db, day: string): Promise<void> {
  await db.execute("UPDATE daily_pick SET status = 'added' WHERE day = ?", [
    day,
  ]);
}

export async function clearPick(db: Db, day: string): Promise<void> {
  await db.execute("DELETE FROM daily_pick WHERE day = ?", [day]);
}

export async function addSkip(
  db: Db,
  day: string,
  slug: string,
): Promise<void> {
  await db.execute(
    "INSERT OR IGNORE INTO daily_pick_skip (day, slug) VALUES (?, ?)",
    [day, slug],
  );
}

export async function listSkips(db: Db, day: string): Promise<Set<string>> {
  const rows = await db.select<{ slug: string }>(
    "SELECT slug FROM daily_pick_skip WHERE day = ?",
    [day],
  );
  return new Set(rows.map((row) => row.slug));
}

export async function listInfo(db: Db): Promise<Map<string, GameInfo>> {
  const rows = await db.select<GameInfo & { urlKey: string }>(
    "SELECT url_key AS urlKey, synopsis, category FROM dles_info",
  );
  return new Map(
    rows.map(({ urlKey, synopsis, category }) => [
      urlKey,
      { synopsis, category },
    ]),
  );
}

export async function saveInfo(
  db: Db,
  urlKey: string,
  slug: string,
  info: GameInfo,
  day: string,
): Promise<void> {
  await db.execute(
    "INSERT OR REPLACE INTO dles_info (url_key, slug, synopsis, category, fetched_day) VALUES (?, ?, ?, ?, ?)",
    [urlKey, slug, info.synopsis, info.category, day],
  );
}

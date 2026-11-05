import { beforeEach, expect, test } from "vitest";
import {
  clearDayStatus,
  listDayRows,
  listLifetimes,
  setDayStatus,
} from "./dayRepo";
import type { Db } from "./db";
import { listGames } from "./gamesRepo";
import { createTestDb } from "./testDb";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

test("setDayStatus upserts one row per game and day", async () => {
  const [game] = await listGames(db);
  await setDayStatus(db, game.id, "2026-11-05", "finished");
  await setDayStatus(db, game.id, "2026-11-05", "ignored");
  expect(await listDayRows(db)).toEqual([
    { gameId: game.id, day: "2026-11-05", status: "ignored" },
  ]);
});

test("clearDayStatus deletes only that day", async () => {
  const [game] = await listGames(db);
  await setDayStatus(db, game.id, "2026-11-04", "finished");
  await setDayStatus(db, game.id, "2026-11-05", "finished");
  await clearDayStatus(db, game.id, "2026-11-05");
  expect(await listDayRows(db)).toEqual([
    { gameId: game.id, day: "2026-11-04", status: "finished" },
  ]);
});

test("seeded games have a null lifetime", async () => {
  const lifetimes = await listLifetimes(db);
  expect(lifetimes).toHaveLength(4);
  for (const l of lifetimes) {
    expect(l).toMatchObject({ addedDay: null, removedDay: null });
  }
});

import { beforeEach, expect, test } from "vitest";
import { moveGameTo } from "../routine/routine";
import { listDayRows, listLifetimes, setDayStatus } from "./dayRepo";
import type { Db } from "./db";
import {
  addGame,
  addGames,
  getShuffle,
  getSidebarWidth,
  listGames,
  removeGame,
  saveOrder,
  setShuffle,
  setSidebarWidth,
  updateGame,
} from "./gamesRepo";
import { createTestDb } from "./testDb";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

test("fresh database lists the four seeded games in order", async () => {
  expect((await listGames(db)).map((x) => x.name)).toEqual([
    "Wordle",
    "Scrandle",
    "Videogamedle",
    "Farflung",
  ]);
});

test("addGame appends at the end with trimmed values", async () => {
  const added = await addGame(
    db,
    "  Globle ",
    " https://globle-game.com ",
    "2026-11-05",
  );
  expect(added).toMatchObject({
    name: "Globle",
    url: "https://globle-game.com",
    position: 4,
  });
  const lifetime = (await listLifetimes(db)).find((l) => l.id === added.id);
  expect(lifetime?.addedDay).toBe("2026-11-05");
});

test("removeGame hides the game, renumbers, and keeps its history", async () => {
  const [first] = await listGames(db);
  await setDayStatus(db, first.id, "2026-11-04", "finished");
  await removeGame(db, first.id, "2026-11-05");
  const games = await listGames(db);
  expect(games.map((x) => x.id)).not.toContain(first.id);
  expect(games.map((x) => x.position)).toEqual([0, 1, 2]);
  expect(await listDayRows(db)).toEqual([
    { gameId: first.id, day: "2026-11-04", status: "finished" },
  ]);
  const lifetime = (await listLifetimes(db)).find((l) => l.id === first.id);
  expect(lifetime?.removedDay).toBe("2026-11-05");
});

test("addGame after a removal takes the next free position", async () => {
  const [first] = await listGames(db);
  await removeGame(db, first.id, "2026-11-05");
  const added = await addGame(
    db,
    "Globle",
    "https://globle-game.com",
    "2026-11-05",
  );
  expect(added.position).toBe(3);
});

test("saveOrder persists a new order", async () => {
  const games = await listGames(db);
  await saveOrder(db, moveGameTo(games, 1, 0));
  expect((await listGames(db))[0].name).toBe("Scrandle");
});

test("updateGame changes name and url, trimmed, and keeps the position", async () => {
  const [, second] = await listGames(db);
  await updateGame(
    db,
    second.id,
    "  Scrandle 2 ",
    " https://scrandle.example ",
  );
  const after = (await listGames(db))[1];
  expect(after).toMatchObject({
    id: second.id,
    name: "Scrandle 2",
    url: "https://scrandle.example",
    position: 1,
  });
});

test("shuffle defaults to false and persists", async () => {
  expect(await getShuffle(db)).toBe(false);
  await setShuffle(db, true);
  expect(await getShuffle(db)).toBe(true);
});

test("addGames appends in the given order with today as added day", async () => {
  await addGames(
    db,
    [
      { name: "Framed", url: "https://framed.wtf" },
      { name: "Connections", url: "https://www.nytimes.com/games/connections" },
    ],
    "2026-11-06",
  );
  const games = await listGames(db);
  expect(games.slice(-2).map((g) => [g.name, g.position])).toEqual([
    ["Framed", 4],
    ["Connections", 5],
  ]);
  const lifetimes = await listLifetimes(db);
  expect(lifetimes.filter((l) => l.addedDay === "2026-11-06")).toHaveLength(2);
});

test("sidebar width is null on a fresh database, then saved and updated", async () => {
  expect(await getSidebarWidth(db)).toBeNull();
  await setSidebarWidth(db, 300);
  expect(await getSidebarWidth(db)).toBe(300);
  await setSidebarWidth(db, 260);
  expect(await getSidebarWidth(db)).toBe(260);
});

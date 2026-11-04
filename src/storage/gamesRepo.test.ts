import { beforeEach, expect, test } from "vitest";
import { moveGame } from "../routine/routine";
import type { Db } from "./db";
import {
  addGame,
  deleteGame,
  getShuffle,
  listGames,
  saveOrder,
  setShuffle,
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
  const added = await addGame(db, "  Globle ", " https://globle-game.com ");
  expect(added).toMatchObject({
    name: "Globle",
    url: "https://globle-game.com",
    position: 4,
  });
});

test("deleteGame renumbers positions", async () => {
  const [first] = await listGames(db);
  await deleteGame(db, first.id);
  expect((await listGames(db)).map((x) => x.position)).toEqual([0, 1, 2]);
});

test("saveOrder persists a new order", async () => {
  const games = await listGames(db);
  await saveOrder(db, moveGame(games, games[1].id, "up"));
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

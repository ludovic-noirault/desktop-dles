import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Game } from "../routine/types";
import type { Db } from "../storage/db";
import { listGames } from "../storage/gamesRepo";
import { addSkip, getPick, listInfo, listSkips } from "../storage/pickRepo";
import { createTestDb } from "../storage/testDb";
import { createDailyPick, type DlesDeps } from "./dailyPick";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const home = fixture("home.html");
const wordlePage = fixture("game-wordle.html");
const day = "2026-11-06";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

function setup(overrides: Partial<DlesDeps> = {}) {
  const fetchCatalog = vi.fn(async () => home);
  const fetchGamePage = vi.fn(async (_slug: string) => wordlePage);
  const dles = createDailyPick({
    db,
    fetchCatalog,
    fetchGamePage,
    rng: () => 0,
    ...overrides,
  });
  return { dles, fetchCatalog, fetchGamePage };
}

const boom = () => Promise.reject(new Error("offline"));

test("load draws, fetches the page and stores the pick", async () => {
  const { dles, fetchGamePage } = setup();
  const pick = await dles.load(day, []);
  expect(pick).toMatchObject({
    slug: "wordle",
    category: "Words",
    status: "shown",
  });
  expect(pick?.synopsis).toBeTruthy();
  expect(fetchGamePage).toHaveBeenCalledWith("wordle");
  expect(await getPick(db, day)).toEqual(pick);
  expect([...(await listInfo(db)).keys()]).toEqual([
    "nytimes.com/games/wordle",
  ]);
});

test("load reuses the stored pick without network", async () => {
  const first = await setup().dles.load(day, []);
  const { dles } = setup({ fetchCatalog: boom, fetchGamePage: boom });
  expect(await dles.load(day, [])).toEqual(first);
});

test("load returns null when the catalog fails", async () => {
  const { dles } = setup({ fetchCatalog: boom });
  expect(await dles.load(day, [])).toBeNull();
  expect(await getPick(db, day)).toBeNull();
});

test("a failed game page keeps the pick with name only and stores no info", async () => {
  const { dles } = setup({ fetchGamePage: boom });
  const pick = await dles.load(day, []);
  expect(pick).toMatchObject({
    slug: "wordle",
    synopsis: null,
    category: null,
  });
  expect(await getPick(db, day)).toEqual(pick);
  expect((await listInfo(db)).size).toBe(0);
});

test("concurrent loads of one day draw once and fetch the catalog once", async () => {
  const { dles, fetchCatalog } = setup({ rng: Math.random });
  const [a, b] = await Promise.all([dles.load(day, []), dles.load(day, [])]);
  expect(a?.slug).toBe(b?.slug);
  expect(fetchCatalog).toHaveBeenCalledTimes(1);
});

describe("another", () => {
  test("skips the current pick and draws a new one", async () => {
    const { dles } = setup();
    const first = await dles.load(day, []);
    const next = await dles.another(day, []);
    expect(next?.slug).toBe("globle");
    expect(next?.slug).not.toBe(first?.slug);
    expect(await listSkips(db, day)).toEqual(new Set(["wordle"]));
    expect(await getPick(db, day)).toEqual(next);
  });

  test("keeps the pick when the catalog cannot be loaded", async () => {
    const first = await setup().dles.load(day, []);
    const { dles } = setup({ fetchCatalog: boom });
    expect(await dles.another(day, [])).toEqual(first);
    expect((await listSkips(db, day)).size).toBe(0);
  });

  test("clears the day when nothing is left", async () => {
    const { dles } = setup();
    const routine: Game[] = [
      {
        id: 1,
        name: "Globle",
        url: "https://globle-game.com/game",
        position: 0,
      },
    ];
    expect((await dles.load(day, routine))?.slug).toBe("wordle");
    expect(await dles.another(day, routine)).toBeNull();
    expect(await getPick(db, day)).toBeNull();
  });

  test("draws without a skip when the day has no pick", async () => {
    const { dles } = setup();
    expect((await dles.another(day, []))?.slug).toBe("wordle");
    expect((await listSkips(db, day)).size).toBe(0);
  });
});

test("add adds the game and marks the pick", async () => {
  const { dles } = setup();
  const pick = await dles.load(day, []);
  await dles.add(day);
  const games = await listGames(db);
  expect(games.at(-1)).toMatchObject({ name: pick?.name, url: pick?.url });
  expect((await getPick(db, day))?.status).toBe("added");
});

test("a new day draws again and ignores yesterday's skips", async () => {
  await addSkip(db, "2026-11-05", "globle");
  const { dles } = setup({ rng: () => 0.999 });
  expect((await dles.load("2026-11-06", []))?.slug).toBe("globle");
});

test("a new day refetches the catalog", async () => {
  const { dles, fetchCatalog } = setup();
  await dles.load("2026-11-06", []);
  await dles.load("2026-11-07", []);
  expect(fetchCatalog).toHaveBeenCalledTimes(2);
});

describe("fillSynopses", () => {
  const routine: Game[] = [
    {
      id: 1,
      name: "Wordle",
      url: "https://www.nytimes.com/games/wordle",
      position: 0,
    },
    { id: 2, name: "Other", url: "https://other.example/x", position: 1 },
  ];

  test("fetches missing routine games one at a time and stores results", async () => {
    const { dles, fetchGamePage } = setup();
    const info = await dles.fillSynopses(routine, day);
    expect(fetchGamePage).toHaveBeenCalledTimes(1);
    expect(fetchGamePage).toHaveBeenCalledWith("wordle");
    expect(info.get("nytimes.com/games/wordle")?.category).toBe("Words");
    await dles.fillSynopses(routine, day);
    expect(fetchGamePage).toHaveBeenCalledTimes(1);
  });

  test("a page that rejects stores nothing", async () => {
    const { dles } = setup({ fetchGamePage: boom });
    expect((await dles.fillSynopses(routine, day)).size).toBe(0);
    expect((await listInfo(db)).size).toBe(0);
  });

  test("returns the known info when the catalog cannot be loaded", async () => {
    await setup().dles.fillSynopses(routine, day);
    const { dles } = setup({ fetchCatalog: boom });
    expect((await dles.fillSynopses(routine, day)).size).toBe(1);
  });
});

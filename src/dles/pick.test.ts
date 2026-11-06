import { describe, expect, test } from "vitest";
import type { Game } from "../routine/types";
import type { StoredPick } from "../storage/pickRepo";
import type { CatalogGame } from "./catalog";
import { drawPick, synopsisTargets, visiblePick } from "./pick";

const wordle: CatalogGame = {
  slug: "wordle",
  name: "Wordle",
  url: "https://www.nytimes.com/games/wordle/index.html",
};
const globle: CatalogGame = {
  slug: "globle",
  name: "Globle",
  url: "https://globle-game.com/game",
};
const third: CatalogGame = {
  slug: "third",
  name: "Third",
  url: "https://third.example/play",
};
const routineWordle: Game = {
  id: 1,
  name: "Wordle",
  url: "https://www.nytimes.com/games/wordle",
  position: 0,
};

describe("drawPick", () => {
  test("never returns a game already in the routine", () => {
    for (const roll of [0, 0.999]) {
      expect(
        drawPick([wordle, globle], [routineWordle], new Set(), () => roll),
      ).toEqual(globle);
    }
  });

  test("never returns a skipped slug", () => {
    expect(
      drawPick([wordle, globle], [], new Set(["wordle"]), () => 0),
    ).toEqual(globle);
  });

  test("returns null when nothing is eligible", () => {
    expect(drawPick([wordle], [routineWordle], new Set())).toBeNull();
    expect(drawPick([globle], [], new Set(["globle"]))).toBeNull();
  });

  test("is uniform over the eligible entries", () => {
    expect(drawPick([wordle, globle, third], [], new Set(), () => 0.5)).toEqual(
      globle,
    );
  });
});

const stored: StoredPick = {
  ...globle,
  day: "2026-11-06",
  status: "shown",
  synopsis: null,
  category: null,
};

describe("visiblePick", () => {
  test("a pick already in the routine is not visible", () => {
    const inRoutine: Game = {
      id: 2,
      name: "G",
      url: "https://globle-game.com/game/",
      position: 1,
    };
    expect(visiblePick(stored, [inRoutine])).toBeNull();
  });

  test("an added pick is not visible", () => {
    expect(visiblePick({ ...stored, status: "added" }, [])).toBeNull();
  });

  test("absent, or otherwise returned as is", () => {
    expect(visiblePick(null, [])).toBeNull();
    expect(visiblePick(stored, [routineWordle])).toBe(stored);
  });
});

describe("synopsisTargets", () => {
  test("keeps routine order and drops known keys", () => {
    const second: Game = { ...routineWordle, id: 2, url: globle.url };
    const catalog = [wordle, globle, third];
    expect(
      synopsisTargets([second, routineWordle], catalog, new Map()),
    ).toEqual([globle, wordle]);
    const known = new Map([
      ["globle-game.com/game", { synopsis: null, category: null }],
    ]);
    expect(synopsisTargets([second, routineWordle], catalog, known)).toEqual([
      wordle,
    ]);
  });
});

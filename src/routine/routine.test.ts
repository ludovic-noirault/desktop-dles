import { expect, test } from "vitest";
import {
  buildRoutine,
  initRoutine,
  isValidGameUrl,
  moveGame,
  routineReducer,
} from "./routine";
import type { Game } from "./types";

const g = (id: number, position: number): Game => ({
  id,
  name: `G${id}`,
  url: `https://g${id}.test`,
  position,
});

test("isValidGameUrl accepts trimmed https URLs only", () => {
  expect(isValidGameUrl("https://scrandle.net")).toBe(true);
  expect(isValidGameUrl("  https://farflung.game  ")).toBe(true);
  expect(isValidGameUrl("http://scrandle.net")).toBe(false);
  expect(isValidGameUrl("javascript:alert(1)")).toBe(false);
  expect(isValidGameUrl("https://")).toBe(false);
  expect(isValidGameUrl("")).toBe(false);
});

test("buildRoutine keeps position order without shuffle", () => {
  expect(buildRoutine([g(2, 1), g(1, 0)], false).map((x) => x.id)).toEqual([
    1, 2,
  ]);
});

test("buildRoutine shuffles with the given rng and keeps every game", () => {
  const out = buildRoutine([g(1, 0), g(2, 1), g(3, 2)], true, () => 0);
  expect(out.map((x) => x.id).sort()).toEqual([1, 2, 3]);
  expect(out.map((x) => x.id)).not.toEqual([1, 2, 3]);
});

test("moveGame swaps and renumbers, and is a no-op at the edges", () => {
  expect(
    moveGame([g(1, 0), g(2, 1)], 2, "up").map((x) => [x.id, x.position]),
  ).toEqual([
    [2, 0],
    [1, 1],
  ]);
  expect(moveGame([g(1, 0), g(2, 1)], 1, "up").map((x) => x.id)).toEqual([
    1, 2,
  ]);
});

test("initRoutine opens the first game", () => {
  const s = initRoutine([g(1, 0), g(2, 1)], false);
  expect(s.current).toBe(0);
  expect([...s.opened]).toEqual([1]);
});

test("next advances, marks opened, and stops at the last game", () => {
  let s = initRoutine([g(1, 0), g(2, 1)], false);
  s = routineReducer(s, { type: "next" });
  expect(s.current).toBe(1);
  expect([...s.opened].sort()).toEqual([1, 2]);
  expect(routineReducer(s, { type: "next" }).current).toBe(1);
});

test("sync after deleting the current game keeps the index in range", () => {
  let s = routineReducer(initRoutine([g(1, 0), g(2, 1)], false), {
    type: "next",
  });
  s = routineReducer(s, { type: "sync", games: [g(1, 0)], shuffle: false });
  expect(s.current).toBe(0);
  expect(s.order.map((x) => x.id)).toEqual([1]);
});

test("sync marks a new current game opened and forgets deleted ids", () => {
  let s = routineReducer(initRoutine([g(1, 0), g(2, 1), g(3, 2)], false), {
    type: "select",
    index: 1,
  });
  s = routineReducer(s, {
    type: "sync",
    games: [g(1, 0), g(3, 1)],
    shuffle: false,
  });
  expect(s.current).toBe(1);
  expect([...s.opened].sort()).toEqual([1, 3]);
});

test("sync to an empty list gives an empty routine", () => {
  const s = routineReducer(initRoutine([g(1, 0)], false), {
    type: "sync",
    games: [],
    shuffle: false,
  });
  expect(s.order).toEqual([]);
  expect(s.current).toBe(0);
});

test("sync with shuffle on keeps the shuffled order and appends new games", () => {
  const s0 = initRoutine([g(1, 0), g(2, 1), g(3, 2)], true, () => 0);
  const before = s0.order.map((x) => x.id);
  const s1 = routineReducer(s0, {
    type: "sync",
    games: [g(1, 0), g(2, 1), g(3, 2), g(4, 3)],
    shuffle: true,
  });
  expect(s1.order.map((x) => x.id)).toEqual([...before, 4]);
});

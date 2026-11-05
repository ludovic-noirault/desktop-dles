import { expect, test } from "vitest";
import {
  buildRoutine,
  initRoutine,
  isRoutineDone,
  isValidGameUrl,
  moveGame,
  nextToDo,
  routineReducer,
  toggleAnswer,
} from "./routine";
import type { DayStatus, Game } from "./types";

const DAY = "2026-11-05";
const st = (entries: [number, DayStatus][]) => new Map(entries);

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

test("initRoutine opens the first game still to do", () => {
  const games = [g(1, 0), g(2, 1), g(3, 2)];
  expect(initRoutine(games, false, DAY, st([[1, "finished"]])).current).toBe(1);
  expect(
    initRoutine(
      games,
      false,
      DAY,
      st([
        [1, "finished"],
        [2, "ignored"],
        [3, "finished"],
      ]),
    ).current,
  ).toBe(0);
});

test("answer records the status and opens the next game to do", () => {
  const s0 = initRoutine(
    [g(1, 0), g(2, 1), g(3, 2)],
    false,
    DAY,
    st([[2, "ignored"]]),
  );
  const s1 = routineReducer(s0, { type: "answer", status: "finished" });
  expect(s1.statuses.get(1)).toBe("finished");
  expect(s1.current).toBe(2);
});

test("answer on the last game to do stays put", () => {
  const s0 = initRoutine([g(1, 0), g(2, 1)], false, DAY, st([[2, "finished"]]));
  const s1 = routineReducer(s0, { type: "answer", status: "ignored" });
  expect(s1.current).toBe(0);
  expect(isRoutineDone(s1)).toBe(true);
});

test("answer null clears the status and stays", () => {
  const s0 = initRoutine([g(1, 0), g(2, 1)], false, DAY, st([[1, "finished"]]));
  const s1 = routineReducer(routineReducer(s0, { type: "select", index: 0 }), {
    type: "answer",
    status: null,
  });
  expect(s1.statuses.has(1)).toBe(false);
  expect(s1.current).toBe(0);
});

test("answer on an empty routine changes nothing", () => {
  const s0 = initRoutine([], false, DAY, st([]));
  expect(routineReducer(s0, { type: "answer", status: "finished" })).toBe(s0);
  expect(isRoutineDone(s0)).toBe(false);
});

test("nextToDo follows the given order and wraps", () => {
  const order = [g(3, 0), g(1, 1), g(2, 2)];
  expect(nextToDo(order, st([[3, "finished"]]), 0)).toBe(1);
  expect(nextToDo(order, st([[1, "finished"]]), 2)).toBe(0);
  expect(
    nextToDo(
      order,
      st([
        [1, "finished"],
        [2, "ignored"],
        [3, "finished"],
      ]),
      0,
    ),
  ).toBe(-1);
});

test("toggleAnswer switches, sets, or clears", () => {
  expect(toggleAnswer(undefined, "finished")).toBe("finished");
  expect(toggleAnswer("ignored", "finished")).toBe("finished");
  expect(toggleAnswer("finished", "finished")).toBeNull();
});

test("day replaces statuses and keeps the current game", () => {
  const s0 = routineReducer(
    initRoutine([g(1, 0), g(2, 1)], false, DAY, st([])),
    { type: "select", index: 1 },
  );
  const next = st([[1, "finished"]]);
  const s1 = routineReducer(s0, {
    type: "day",
    day: "2026-11-06",
    statuses: next,
  });
  expect(s1.day).toBe("2026-11-06");
  expect(s1.statuses).toBe(next);
  expect(s1.current).toBe(1);
  expect(s1.order).toBe(s0.order);
});

test("sync after deleting the current game keeps the index in range", () => {
  let s = routineReducer(
    initRoutine([g(1, 0), g(2, 1)], false, DAY, new Map()),
    { type: "select", index: 1 },
  );
  s = routineReducer(s, { type: "sync", games: [g(1, 0)], shuffle: false });
  expect(s.current).toBe(0);
  expect(s.order.map((x) => x.id)).toEqual([1]);
});

test("sync drops statuses of games that left the routine", () => {
  let s = routineReducer(
    initRoutine(
      [g(1, 0), g(2, 1), g(3, 2)],
      false,
      DAY,
      st([
        [1, "finished"],
        [2, "ignored"],
      ]),
    ),
    { type: "select", index: 1 },
  );
  s = routineReducer(s, {
    type: "sync",
    games: [g(1, 0), g(3, 1)],
    shuffle: false,
  });
  expect([...s.statuses.keys()]).toEqual([1]);
  expect(s.current).toBeLessThan(s.order.length);
});

test("sync to an empty list gives an empty routine", () => {
  const s = routineReducer(initRoutine([g(1, 0)], false, DAY, new Map()), {
    type: "sync",
    games: [],
    shuffle: false,
  });
  expect(s.order).toEqual([]);
  expect(s.current).toBe(0);
});

test("sync with shuffle on keeps the shuffled order and appends new games", () => {
  const s0 = initRoutine(
    [g(1, 0), g(2, 1), g(3, 2)],
    true,
    DAY,
    new Map(),
    () => 0,
  );
  const before = s0.order.map((x) => x.id);
  const s1 = routineReducer(s0, {
    type: "sync",
    games: [g(1, 0), g(2, 1), g(3, 2), g(4, 3)],
    shuffle: true,
  });
  expect(s1.order.map((x) => x.id)).toEqual([...before, 4]);
});

test("sync carries an edited name and url into order, shuffle on or off", () => {
  const edited = { ...g(2, 1), name: "Renamed", url: "https://new.test" };
  for (const shuffle of [false, true]) {
    const s0 = initRoutine(
      [g(1, 0), g(2, 1)],
      shuffle,
      DAY,
      new Map(),
      () => 0,
    );
    const s1 = routineReducer(s0, {
      type: "sync",
      games: [g(1, 0), edited],
      shuffle,
    });
    expect(s1.order.find((x) => x.id === 2)).toEqual(edited);
  }
});

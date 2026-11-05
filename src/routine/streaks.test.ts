import { expect, test } from "vitest";
import {
  dayCounts,
  dayStreak,
  gameStreak,
  inRoutine,
  statusesOn,
} from "./streaks";
import type { DayRow, DayStatus, GameLifetime } from "./types";

const TODAY = "2026-11-05";

const life = (
  id: number,
  addedDay: string | null = null,
  removedDay: string | null = null,
): GameLifetime => ({ id, addedDay, removedDay });

const row = (gameId: number, day: string, status: DayStatus): DayRow => ({
  gameId,
  day,
  status,
});

test("inRoutine respects added and removed days", () => {
  const added = life(1, "2026-11-05");
  expect(inRoutine(added, "2026-11-04")).toBe(false);
  expect(inRoutine(added, "2026-11-05")).toBe(true);
  const removed = life(1, null, "2026-11-05");
  expect(inRoutine(removed, "2026-11-04")).toBe(true);
  expect(inRoutine(removed, "2026-11-05")).toBe(false);
});

test("statusesOn maps game ids to the statuses of one day", () => {
  const rows = [
    row(1, "2026-11-04", "finished"),
    row(1, "2026-11-05", "ignored"),
    row(2, "2026-11-05", "finished"),
  ];
  expect(statusesOn(rows, "2026-11-05")).toEqual(
    new Map<number, DayStatus>([
      [1, "ignored"],
      [2, "finished"],
    ]),
  );
});

test("gameStreak counts a finished run up to today", () => {
  const rows = [
    row(1, "2026-11-03", "finished"),
    row(1, "2026-11-04", "finished"),
    row(1, "2026-11-05", "finished"),
  ];
  expect(gameStreak(1, rows, TODAY)).toBe(3);
});

test("gameStreak keeps yesterday's run while today is to do", () => {
  const rows = [
    row(1, "2026-11-03", "finished"),
    row(1, "2026-11-04", "finished"),
  ];
  expect(gameStreak(1, rows, TODAY)).toBe(2);
});

test("gameStreak is 0 when today is ignored", () => {
  const rows = [
    row(1, "2026-11-03", "finished"),
    row(1, "2026-11-04", "finished"),
    row(1, "2026-11-05", "ignored"),
  ];
  expect(gameStreak(1, rows, TODAY)).toBe(0);
});

test("gameStreak counts a game added recently", () => {
  const rows = [
    row(1, "2026-11-04", "finished"),
    row(1, "2026-11-05", "finished"),
  ];
  expect(gameStreak(1, rows, TODAY)).toBe(2);
});

test("gameStreak stops at a missed or ignored day", () => {
  expect(
    gameStreak(
      1,
      [
        row(1, "2026-11-01", "finished"),
        row(1, "2026-11-02", "ignored"),
        row(1, "2026-11-03", "finished"),
        row(1, "2026-11-04", "finished"),
      ],
      TODAY,
    ),
  ).toBe(2);
  expect(
    gameStreak(
      1,
      [
        row(1, "2026-11-01", "finished"),
        row(1, "2026-11-03", "finished"),
        row(1, "2026-11-04", "finished"),
        row(1, "2026-11-05", "finished"),
      ],
      TODAY,
    ),
  ).toBe(3);
});

test("dayCounts needs every game answered and one finished", () => {
  const games = [life(1), life(2)];
  const day = "2026-11-05";
  expect(
    dayCounts(day, games, [row(1, day, "finished"), row(2, day, "ignored")]),
  ).toBe(true);
  expect(dayCounts(day, games, [row(1, day, "finished")])).toBe(false);
  expect(
    dayCounts(day, games, [row(1, day, "ignored"), row(2, day, "ignored")]),
  ).toBe(false);
});

test("dayCounts ignores games outside that day's routine", () => {
  const day = "2026-11-04";
  const games = [life(1), life(2, "2026-11-05"), life(3, null, "2026-11-04")];
  expect(dayCounts(day, games, [row(1, day, "finished")])).toBe(true);
});

test("dayCounts drops a game finished then removed today", () => {
  const games = [life(1, null, TODAY), life(2)];
  const rows = [row(1, TODAY, "finished"), row(2, TODAY, "ignored")];
  expect(dayCounts(TODAY, games, rows)).toBe(false);
});

const bothAnswered = (day: string): DayRow[] => [
  row(1, day, "finished"),
  row(2, day, "ignored"),
];

test("dayStreak counts back from today when today counts", () => {
  const rows = ["2026-11-03", "2026-11-04", "2026-11-05"].flatMap(bothAnswered);
  expect(dayStreak([life(1), life(2)], rows, TODAY)).toBe(3);
});

test("dayStreak keeps yesterday's run while today is in progress", () => {
  const rows = [
    ...bothAnswered("2026-11-03"),
    ...bothAnswered("2026-11-04"),
    row(1, TODAY, "finished"),
  ];
  expect(dayStreak([life(1), life(2)], rows, TODAY)).toBe(2);
});

test("dayStreak is broken by an all-ignored day", () => {
  const rows = [
    ...bothAnswered("2026-11-03"),
    row(1, "2026-11-04", "ignored"),
    row(2, "2026-11-04", "ignored"),
    ...bothAnswered(TODAY),
  ];
  expect(dayStreak([life(1), life(2)], rows, TODAY)).toBe(1);
});

test("dayStreak is 0 with no history", () => {
  const games = [life(1), life(2)];
  expect(dayStreak(games, [], TODAY)).toBe(0);
  expect(dayStreak(games, bothAnswered("2026-01-01"), TODAY)).toBe(0);
});

# Today Loop and Streaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each game gets a persisted state for the day (to do, finished, ignored), "Next game" becomes "Ignore" and "Finished", and the aside shows a streak per game plus a day streak.

**Architecture:** A pure day-key module and a pure streaks module in `src/routine/`, fed by a new `day_status` table and two lifetime columns on `games` (migration 002). The routine reducer replaces the session `opened` set with today's statuses and picks the next game still to do. `RoutineProvider` writes answers to SQLite, reloads the history after each write, reloads the day at local midnight and on window focus, and exposes the streaks to `RoutinePage`.

**Tech Stack:** React 19, TypeScript, Vitest with `node:sqlite`, `tauri-plugin-sql` (SQLite), Biome.

**Spec:** `docs/superpowers/specs/2026-11-05-today-loop-streaks-design.md`

## Global Constraints

- A day is the local calendar date `YYYY-MM-DD`, computed in TypeScript. Never SQLite `date('now')` (UTC).
- Statuses stored: exactly `finished` or `ignored`. No row means "to do" today, "missed" on a past day.
- Day streak rule: a day counts when every game of that day's routine has a row and at least one row is `finished`.
- Game streak rule: consecutive finished days. Today counts when finished, is skipped when still to do, gives 0 when ignored.
- A game is in day D's routine when `added_day` is null or `<= D`, and `removed_day` is null or `> D`.
- Never edit `src-tauri/migrations/001_init.sql`. New migration file `002_day_status.sql`, registered as version 2 in `src-tauri/src/lib.rs`.
- SQL uses `?` placeholders only.
- UI copy in English, every string in `src/strings.ts`. Load the `design` skill before editing any `.tsx` or `.css`.
- Security invariants of `AGENTS.md` untouched: no capability change, nothing injected into a game webview.
- Pure logic test-first with Vitest. Conventional commits, no tool attribution. Add files by path, never `git add -A`.

## Review Focus

1. A double click on "Finished": the first click moves to the next game, the second would answer that game by accident. The header buttons are disabled while a write is pending. Checked by reading in Task 5 and Task 6.
2. A click after midnight before the day reload ran (machine asleep, focus event not yet fired): the answer is written under the new day and the day is reloaded instead of being applied to the stale day. Checked by reading in Task 5.
3. Removing the current game in Settings: its status leaves the reducer state and the current index stays in range. Pinned by `sync drops statuses of games that left the routine` in Task 4.
4. A history with no rows, or a long gap: both streaks are 0 and the day streak loop ends. Pinned by `dayStreak is 0 with no history` in Task 3.
5. Shuffle on: "next game to do" follows the shuffled order and wraps. Pinned by `nextToDo follows the given order and wraps` in Task 4.

---

### Task 1: Day keys and history types

**Files:**
- Create: `src/routine/day.ts`
- Test: `src/routine/day.test.ts`
- Modify: `src/routine/types.ts`

**Interfaces:**
- Produces, in `src/routine/types.ts`:
  - `type DayStatus = "finished" | "ignored"`
  - `type DayRow = { gameId: number; day: string; status: DayStatus }`
  - `type GameLifetime = { id: number; addedDay: string | null; removedDay: string | null }`
- Produces, in `src/routine/day.ts`:
  - `dayKey(date: Date): string` (local date, zero-padded)
  - `previousDay(day: string): string`
  - `msUntilNextMidnight(now: Date): number`

- [ ] **Step 1: Write the failing tests** in `src/routine/day.test.ts`. First line of the file, before any import: `process.env.TZ = "Europe/Paris";` (Node reads `TZ` at runtime).

```ts
test("dayKey uses the local date on both sides of midnight", () => {
  expect(dayKey(new Date(2026, 10, 5, 23, 59, 59))).toBe("2026-11-05");
  expect(dayKey(new Date(2026, 10, 6, 0, 0, 0))).toBe("2026-11-06");
  expect(dayKey(new Date(2026, 0, 3, 12))).toBe("2026-01-03");
});

test("previousDay crosses months, years and the spring DST change", () => {
  expect(previousDay("2026-03-01")).toBe("2026-02-28");
  expect(previousDay("2026-01-01")).toBe("2025-12-31");
  expect(previousDay("2026-03-30")).toBe("2026-03-29");
  expect(previousDay("2026-10-26")).toBe("2026-10-25");
});

test("msUntilNextMidnight counts real time on a DST day", () => {
  expect(msUntilNextMidnight(new Date(2026, 10, 5, 23, 0))).toBe(3_600_000);
  // 2026-03-29 has 23 hours in Paris.
  expect(msUntilNextMidnight(new Date(2026, 2, 29, 0, 30))).toBe(22.5 * 3_600_000);
});
```

- [ ] **Step 2: Run** `pnpm test src/routine/day.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three functions and add the three types. `previousDay` parses the string and uses `Date.UTC(y, m - 1, d - 1)` so DST never shifts it. `msUntilNextMidnight` is `new Date(y, m, d + 1).getTime() - now.getTime()` on local fields.
- [ ] **Step 4: Run** `pnpm test src/routine/day.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add local day keys and history types`.

### Task 2: Storage: migration, day history, game lifetime

**Files:**
- Create: `src-tauri/migrations/002_day_status.sql`, `src/storage/dayRepo.ts`, `src/storage/dayRepo.test.ts`
- Modify: `src-tauri/src/lib.rs` (migrations vec), `src/storage/testDb.ts`, `src/storage/gamesRepo.ts`, `src/storage/gamesRepo.test.ts`, `src/pages/SettingsPage.tsx` (call sites only), `src/strings.ts` (`settings.remove`)

**Interfaces:**
- Consumes: `DayStatus`, `DayRow`, `GameLifetime`, `dayKey` from Task 1.
- Produces, in `src/storage/dayRepo.ts`:
  - `setDayStatus(db: Db, gameId: number, day: string, status: DayStatus): Promise<void>` (upsert)
  - `clearDayStatus(db: Db, gameId: number, day: string): Promise<void>`
  - `listDayRows(db: Db): Promise<DayRow[]>` (every row, removed games included)
  - `listLifetimes(db: Db): Promise<GameLifetime[]>` (every game, removed included)
- Changes, in `src/storage/gamesRepo.ts`:
  - `listGames(db)` returns only games with `removed_day IS NULL`.
  - `addGame(db: Db, name: string, url: string, today: string): Promise<Game>` sets `added_day = today`; its next position is computed over games not removed.
  - `deleteGame` is renamed `removeGame(db: Db, id: number, today: string): Promise<void>`: sets `removed_day = today`, keeps the row and its history, then renumbers the remaining games with `saveOrder`.

Migration content:

```sql
CREATE TABLE day_status (
  game_id INTEGER NOT NULL REFERENCES games(id),
  day TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('finished', 'ignored')),
  PRIMARY KEY (game_id, day)
);

ALTER TABLE games ADD COLUMN added_day TEXT;
ALTER TABLE games ADD COLUMN removed_day TEXT;
```

- [ ] **Step 1: Make `createTestDb` run `001_init.sql` then `002_day_status.sql`**, in that order, and register `Migration { version: 2, description: "day_status", sql: include_str!("../migrations/002_day_status.sql"), kind: MigrationKind::Up }` in `lib.rs`. Create the migration file.
- [ ] **Step 2: Write the failing tests** in `src/storage/dayRepo.test.ts`:
  - `setDayStatus upserts one row per game and day`: set `finished` then `ignored` for the same game and day, `listDayRows` returns one row `{ gameId, day: "2026-11-05", status: "ignored" }`.
  - `clearDayStatus deletes only that day`: rows on `2026-11-04` and `2026-11-05`, clear `2026-11-05`, only `2026-11-04` remains.
  - `seeded games have a null lifetime`: `listLifetimes` returns four entries with `addedDay: null, removedDay: null`.

  And in `src/storage/gamesRepo.test.ts`:
  - rename `deleteGame renumbers positions` to `removeGame hides the game, renumbers, and keeps its history`: set a `finished` row for the first game, `removeGame(db, id, "2026-11-05")`, then `listGames` no longer has it and positions are `0..2`, `listDayRows` still has the row, `listLifetimes` shows `removedDay: "2026-11-05"`.
  - update `addGame appends at the end with trimmed values` to pass `"2026-11-05"` and assert `listLifetimes` gives the new game `addedDay: "2026-11-05"`.
  - `addGame after a removal takes the next free position`: remove one seeded game, add one, its position is `3`.
- [ ] **Step 3: Run** `pnpm test src/storage`. Expected: FAIL on the new and changed tests.
- [ ] **Step 4: Implement** `dayRepo.ts` and the `gamesRepo.ts` changes. Upsert: `INSERT INTO day_status (game_id, day, status) VALUES (?, ?, ?) ON CONFLICT (game_id, day) DO UPDATE SET status = excluded.status`. Alias columns to camelCase in the `SELECT`s.
- [ ] **Step 5: Update the Settings call sites** (load the `design` skill first, `.tsx` edit): `addGame(db, name, url, dayKey(new Date()))` and `removeGame(db, g.id, dayKey(new Date()))`. In `strings.ts`, `settings.remove` becomes `` (name: string) => `Remove ${name}` ``. Nothing else changes in the page.
- [ ] **Step 6: Run** `pnpm test`, `pnpm build`, `(cd src-tauri && cargo test && cargo clippy -- -D warnings)`. Expected: all pass.
- [ ] **Step 7: Commit** `feat: store day statuses and game lifetimes`.

### Task 3: Streaks

**Files:**
- Create: `src/routine/streaks.ts`, `src/routine/streaks.test.ts`

**Interfaces:**
- Consumes: `DayRow`, `GameLifetime`, `DayStatus`, `previousDay` from Task 1.
- Produces:
  - `inRoutine(game: GameLifetime, day: string): boolean`
  - `statusesOn(rows: DayRow[], day: string): Map<number, DayStatus>`
  - `gameStreak(gameId: number, rows: DayRow[], today: string): number`
  - `dayCounts(day: string, games: GameLifetime[], rows: DayRow[]): boolean`
  - `dayStreak(games: GameLifetime[], rows: DayRow[], today: string): number`

Rules, from the spec: see Global Constraints. `dayCounts` is false when the day's routine is empty. `dayStreak` starts from today when `dayCounts(today)`, otherwise from yesterday, and stops at the first day that does not count. Index rows by `day` once (a `Map`) so the loop stays linear.

- [ ] **Step 1: Write the failing tests.** Helpers: `life(id, addedDay = null, removedDay = null)` and `row(gameId, day, status)`. Today is `"2026-11-05"` in every test.
  - `inRoutine respects added and removed days`: added `2026-11-05` is out on `2026-11-04`, in on `2026-11-05`; removed `2026-11-05` is in on `2026-11-04`, out on `2026-11-05`.
  - `gameStreak counts a finished run up to today`: finished on 03, 04, 05 gives `3`.
  - `gameStreak keeps yesterday's run while today is to do`: finished on 03, 04 and nothing on 05 gives `2`.
  - `gameStreak is 0 when today is ignored`: finished 03, 04, ignored 05 gives `0`.
  - `gameStreak stops at a missed or ignored day`: finished 01, ignored 02, finished 03, 04 gives `2` (today to do); finished 01, nothing on 02, finished 03, 04, 05 gives `3`.
  - `dayCounts needs every game answered and one finished`: two games; finished + ignored counts; finished + nothing does not; ignored + ignored does not.
  - `dayCounts ignores games outside that day's routine`: game 2 added `2026-11-05`; on `2026-11-04` only game 1 finished counts; game 3 removed `2026-11-04` and never answered does not block `2026-11-04`.
  - `dayCounts drops a game finished then removed today`: game 1 finished today and removed today, game 2 ignored today: today does not count.
  - `dayStreak counts back from today when today counts`: both games answered with one finished on 03, 04, 05 gives `3`.
  - `dayStreak keeps yesterday's run while today is in progress`: same history on 03 and 04, today only one of two answered, gives `2`.
  - `dayStreak is broken by an all-ignored day`: 03 counts, 04 all ignored, 05 counts gives `1`.
  - `dayStreak is 0 with no history`: no rows gives `0`; rows only on `2026-01-01` give `0`.
- [ ] **Step 2: Run** `pnpm test src/routine/streaks.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the five functions.
- [ ] **Step 4: Run** `pnpm test src/routine/streaks.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: compute game and day streaks`.

### Task 4: Routine reducer with day statuses

**Files:**
- Modify: `src/routine/types.ts`, `src/routine/routine.ts`, `src/routine/routine.test.ts`

**Interfaces:**
- Consumes: `DayStatus` from Task 1.
- Produces:
  - `RoutineState = { order: Game[]; current: number; day: string; statuses: ReadonlyMap<number, DayStatus> }` (the `opened` field is removed)
  - `RoutineAction = { type: "select"; index: number } | { type: "answer"; status: DayStatus | null } | { type: "day"; day: string; statuses: ReadonlyMap<number, DayStatus> } | { type: "sync"; games: Game[]; shuffle: boolean }` (`next` is removed)
  - `initRoutine(games: Game[], shuffle: boolean, day: string, statuses: ReadonlyMap<number, DayStatus>, rng?: () => number): RoutineState`
  - `nextToDo(order: Game[], statuses: ReadonlyMap<number, DayStatus>, from: number): number` (index, or `-1` when none is left)
  - `toggleAnswer(previous: DayStatus | undefined, clicked: DayStatus): DayStatus | null` (`null` when `clicked === previous`)
  - `isRoutineDone(state: RoutineState): boolean` (non-empty order, every game has a status)

Behaviour:
- `initRoutine`: `current` is the first index with no status, or `0` when all are answered.
- `answer` applies to the current game. A status sets it, then `current` becomes `nextToDo(order, newStatuses, current)` when that is not `-1`, else stays. `null` deletes the status and stays.
- `day` replaces `day` and `statuses`; `order` and `current` are kept.
- `sync` keeps its existing order logic and also drops statuses of ids no longer in `order`.
- `nextToDo` scans `from + 1` to the end, then `0` to `from`, and returns the first index with no status.

- [ ] **Step 1: Rewrite the `opened` tests and add new ones** in `src/routine/routine.test.ts`. Helper `st(entries: [number, DayStatus][])` builds the map. Keep every other existing test, passing `"2026-11-05"` and `new Map()` to `initRoutine`.
  - replace `initRoutine opens the first game` with `initRoutine opens the first game still to do`: games 1, 2, 3 with `st([[1, "finished"]])` gives `current` `1`; all three answered gives `0`.
  - replace `next advances, marks opened, and stops at the last game` with `answer records the status and opens the next game to do`: games 1, 2, 3, game 2 already `ignored`; `answer finished` on game 1 sets status 1 and opens index `2`.
  - `answer on the last game to do stays put`: games 1, 2, game 2 `finished`, current 0, `answer ignored` gives current `0` and `isRoutineDone` true.
  - `answer null clears the status and stays`: current game `finished`, `answer null` removes it, current unchanged.
  - `nextToDo follows the given order and wraps`: order `[3, 1, 2]` (shuffled). With `{3: finished}`, from `0` gives `1` (game 1). With `{1: finished}`, from `2` gives `0` (game 3, after wrapping). With all three answered, gives `-1`.
  - `toggleAnswer switches, sets, or clears`: `(undefined, "finished")` gives `"finished"`, `("ignored", "finished")` gives `"finished"`, `("finished", "finished")` gives `null`.
  - `day replaces statuses and keeps the current game`.
  - replace `sync marks a new current game opened and forgets deleted ids` with `sync drops statuses of games that left the routine`: statuses for 1 and 2, sync without game 2, statuses only has 1, current in range.
- [ ] **Step 2: Run** `pnpm test src/routine/routine.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes in `types.ts` and `routine.ts`. Remove `open()`'s `opened` handling.
- [ ] **Step 4: Run** `pnpm test src/routine`. Expected: PASS. `pnpm build` fails in `RoutinePage.tsx` and `RoutineProvider.tsx` until Task 5 and Task 6; that is expected at this commit.
- [ ] **Step 5: Commit** `feat: drive the routine from day statuses`.

### Task 5: RoutineProvider: persistence, streaks, midnight

**Files:**
- Modify: `src/app/RoutineProvider.tsx`

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces, on `useRoutine()`:
  - `state: RoutineState`, `games: Game[]`, `shuffle: boolean`, `dispatch`, `refresh(): Promise<void>` (as today)
  - `answer(clicked: DayStatus): Promise<void>`
  - `busy: boolean` (true while an answer is being written)
  - `gameStreaks: ReadonlyMap<number, number>` (game id to streak, for games in `state.order`)
  - `dayStreak: number`

Behaviour:
- Load: `listGames`, `getShuffle`, `listDayRows`, `listLifetimes`. `today = dayKey(new Date())`. `initRoutine(games, shuffle, today, statusesOn(rows, today))`. Keep the StrictMode `cancelled` guard.
- `rows` and `lifetimes` live in provider state; `gameStreaks` and `dayStreak` are `useMemo` over them and `state.day`.
- `answer(clicked)`: return at once when `busy`. Set `busy`. `next = toggleAnswer(state.statuses.get(currentId), clicked)`. `today = dayKey(new Date())`. Write `setDayStatus` or `clearDayStatus` under `today`. Reload `rows`. If `today !== state.day`, dispatch `{ type: "day", day: today, statuses: statusesOn(rows, today) }` and do not dispatch `answer`; otherwise dispatch `{ type: "answer", status: next }`. On error, `console.error` and dispatch nothing. Clear `busy` in `finally`.
- `reloadDay()`: when `dayKey(new Date()) !== state.day`, reload `rows`, then dispatch `day`. Run it from a `setTimeout(msUntilNextMidnight(new Date()) + 1000)` re-armed after each day change, and from a `focus` listener on `window`. Clean both up on unmount. Read `state.day` through a ref so the listeners never see a stale day.
- `refresh()` (called by Settings) also reloads `rows` and `lifetimes`.

- [ ] **Step 1: Implement** the provider changes (no `design` skill needed if no markup or class changes; load it if any JSX changes).
- [ ] **Step 2: Run** `pnpm lint` and `pnpm test`. Expected: PASS. `pnpm build` still fails in `RoutinePage.tsx` only.
- [ ] **Step 3: Commit** `feat: persist answers and reload the day at midnight`.

### Task 6: Routine page, strings, styles, README

**Files:**
- Modify: `src/pages/RoutinePage.tsx`, `src/strings.ts`, `src/styles.css`, `README.md`

**Interfaces:**
- Consumes: `useRoutine()` from Task 5, `isRoutineDone` from Task 4.

Strings (replace `aside.counter`, `routine.next`, `routine.done`):

```ts
aside: {
  title: "Today",
  counter: (finished: number, total: number) => `${finished}/${total} finished today`,
  done: "Routine done",
  dayStreak: (n: number) => `Routine streak ${n} ${n === 1 ? "day" : "days"}`,
  gameStreak: (n: number) => `${n}-day streak`,
  status: { todo: "To do", finished: "Finished", ignored: "Ignored" },
},
routine: {
  finished: "Finished",
  ignore: "Ignore",
  // reload, position, empty, emptyLink unchanged
},
```

Layout (option A of the brainstorming mockups):
- Each aside row: a state icon (to do, finished, ignored; the current game keeps `aria-current`), the name, and the game streak right-aligned. The icon carries the status text for screen readers (`aria-label` or visually hidden text from `aside.status`); the streak number carries `aside.gameStreak(n)` as its label. A streak of 0 must stay readable, not vanish.
- Finished and ignored rows are dimmed; ignored rows are visually distinct from finished ones (not by colour alone).
- Aside footer: `aside.counter(finished, total)`, or `aside.done` when `isRoutineDone(state)`, then `aside.dayStreak(dayStreak)`. `total` is `state.order.length`; `finished` counts `finished` statuses.
- Panel header: `Reload`, then `Ignore` (secondary), then `Finished` (primary), in place of "Next game". Each has `aria-pressed` set when it matches the current game's status, is disabled while `busy`, and calls `answer("ignored")` or `answer("finished")`.
- Empty routine keeps the existing empty state.
- README: the intro's sentence about the "Next game" button becomes one about "Finished" and "Ignore", and one sentence says the app keeps a streak per game and a routine streak, stored on the machine.

- [ ] **Step 1: Load the `design` skill**, then implement the page, strings and styles. No element may overlap the `.panel` div (native webview drawn above it).
- [ ] **Step 2: Run** `pnpm test`, `pnpm lint`, `pnpm build`, `(cd src-tauri && cargo test && cargo clippy -- -D warnings)`. Expected: all pass.
- [ ] **Step 3: Commit** `feat: show day states and streaks in the routine`.

### Task 7: Manual check on macOS (Ludo, with the agent)

Run `pnpm tauri dev`. Each step is observed, not assumed.

- [ ] **Step 1:** Finish two games and ignore one. Quit and relaunch: states and count are kept, the routine opens on the first game still to do.
- [ ] **Step 2:** Click the ignored game in the aside, click "Finished": the state changes, the count goes up. Click the pressed "Finished": the game is back to "to do" and stays open.
- [ ] **Step 3:** Answer every game: the footer reads "Routine done", and the routine streak counts today.
- [ ] **Step 4:** Remove a game in Settings: it leaves the routine, the count drops by one.
- [ ] **Step 5:** Leave the app open across midnight, or move the system clock past midnight and focus the window: every game is back to "to do", the streaks show the previous day's run.
- [ ] **Step 6:** Double-click "Finished" fast: only the current game is answered.

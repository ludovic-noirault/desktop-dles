# Today loop and streaks design

Date: 2026-11-05. Status: draft, waiting for Ludo's review.

## Intent

The routine forgets everything when the app closes. The aside counts games "opened" in memory, and a
restart sets it back to zero. Nothing records which games Ludo actually played, which ones he skipped,
or how long he has kept going.

This work makes the day persistent. Each game gets a state for the day: finished, ignored, or still to
do. The app then derives two streaks from that history. The streaks are an engagement measure: they tell
Ludo whether he keeps up with each game and with the routine as a whole.

It is the first part of backlog item 2 of `2026-11-03-mvp-design.md` (stats and streaks). That spec is
updated to point here. It replaces the MVP call that "opened" is tracked for the session only.

## Decided by Ludo

- "Next game" is replaced by two actions: "Ignore" and "Finished". Both record the game's state for the
  day, then move to the next game.
- A game's state for the day is one of: to do, finished, ignored. It is saved, so a restart keeps it.
- The next game is the next one still to do. Finished and ignored games are skipped. At launch, the app
  opens the first game still to do.
- A game that gets no answer during a day stays "to do". Once the day is over it counts as missed, which
  is not the same as ignored: Ludo did not choose it.
- A "dropped" game is either a game ignored that day, or a game removed from the routine for good.
  Removing a game keeps its history.
- A wrong answer for today, such as an "Ignore" clicked too fast, can be corrected from the game list.
- Game streak: the number of consecutive days on which Ludo finished that game. An ignored or missed day
  resets it.
- Day streak: the number of consecutive days on which Ludo did his routine. A day counts when no game of
  that day's routine is left to do (each one is finished or ignored) and at least one game is finished.
  A day with only ignored games breaks it. Ignoring a game does not, by itself, break the day streak.
- The day starts at local midnight, in the machine's time zone. No reset time per game. Ludo often plays
  around 23:00 or midnight and accepts the consequence below (see "Accepted consequences").
- Data stays on the machine. No sharing between machines.
- Layout: option A of the brainstorming mockups, the "enriched list". Each row of the aside shows a state
  icon and the game's streak. The bottom of the aside shows "N/M finished today" and the day streak. The
  panel header shows "Ignore" and "Finished" where "Next game" was.
- No journal of app opens and no adoption metric for now, because the core of the app is still moving.

## Goals

1. A migration adds the day history and the game lifetime needed by the streaks (see "Builder's calls").
2. "Finished" and "Ignore" in the panel header record today's state for the current game and open the
   next game still to do, in routine order.
3. At launch, after the splash, the routine opens on the first game still to do today. If none is left,
   it opens on the first game of the routine.
4. Each aside row shows the game's state for today (to do, finished, ignored, current) and its game
   streak.
5. The aside footer shows "N/M finished today", where M is the number of games in today's routine and N
   the number finished, and the day streak.
6. Clicking a finished or ignored game in the aside opens it, and its state for today can be changed or
   cleared back to "to do".
7. Removing a game in Settings hides it from the routine and keeps its history.
8. A session left open across midnight starts the new day: every game is back to "to do" and the streaks
   are recomputed.

## Non-goals

- A history or stats page, charts, per-game history.
- Editing a past day. Only today's states can be changed.
- A reset time per game, or a day boundary other than local midnight.
- Sync, export or import of the history (backlog items 4 and 8).
- Reading the share text from the clipboard, or any score (backlog item 3).
- A streak freeze, a grace day, or reminders.
- A journal of app opens, or any adoption metric.
- Restoring a removed game with its history.

## Anti-goals

- A streak lost through something Ludo did not do: an app restart, a game added during the day breaking
  an earlier day, a removed game breaking later days, a midnight timer that fires twice or not at all.
- A streak that counts a day on which Ludo did not finish anything.
- Detecting a finished game by reading or scripting the game page. The security invariants of
  `AGENTS.md` hold: no script injected into a game, the capability still targets `"webviews": ["ui"]`
  only.
- Removing a game wiping its history.

## Accepted consequences

- A game started at 23:55 and finished at 00:05 is recorded on the new day. The previous day has no
  answer for it, so it counts as missed there.
- Streaks start from zero on the release that ships this work, since no history exists before it.
- A game removed and added again is a new game with a fresh streak.

## Constraints

- Pure logic is written test-first (Vitest), as `src/routine/` and `src/storage/` are: the day key, the
  streak computation, the "next game to do" choice, and the day history repository.
- SQL uses `?` placeholders, so the same queries run under sqlx and under `node:sqlite` in tests.
  `src/storage/testDb.ts` loads the migration files: it must load the new one too.
- Migrations are registered in `src-tauri/src/lib.rs`. A new migration is a new file and a new entry,
  never an edit of `001_init.sql`, which installed apps have already run.
- UI copy in English, in `src/strings.ts`. `.tsx` and `.css` edits load the `design` skill first.
- Game webviews are native views drawn over the panel, so nothing new may overlap the panel. The new
  controls live in the aside and in the panel header.

## Builder's calls (Claude's, not Ludo's)

- **Day key.** A day is the local calendar date as `YYYY-MM-DD`, computed in TypeScript from an injected
  clock. Never SQLite's `date('now')`, which is UTC.
- **History table.** `day_status(game_id, day, status)` with `status` in `finished` or `ignored`, primary
  key `(game_id, day)`. No row means "to do" for today and "missed" for a past day. Setting a state is an
  upsert; clearing it deletes the row. No raw share text or score column yet: backlog item 3 adds one by
  migration when it comes.
- **Game lifetime.** `games` gains `added_day` and `removed_day`, both nullable `YYYY-MM-DD`. Games that
  exist when the migration runs keep `added_day` null, read as "always there". A new game gets today as
  `added_day`. Removing a game sets `removed_day` to today instead of deleting the row. Settings and the
  routine list only games with no `removed_day`.
- **Day routine.** The games in the routine on day D are those with `added_day` null or not after D, and
  `removed_day` null or after D. A game removed today is out of today's routine, even when it already has
  a state for today: its row stays in the history but no longer counts in N, M or today's day streak. A
  game added today is in it and must be answered for today to count.
- **Empty routine.** When today's routine has no game, the routine page keeps its existing empty state
  (the link to Settings). No count, no day streak.
- **Streaks in progress.** Today never breaks a streak before midnight. A game streak counts back from
  today when today is finished, from yesterday when today is still to do, and is 0 when today is ignored.
  The day streak counts back from today when today already counts, otherwise from yesterday.
- **Day streak counting.** For each day going back, the day counts when every game of that day's routine
  has a row and at least one row is `finished`. A day whose routine is empty (before any game existed)
  ends the count.
- **Next game.** "Finished" and "Ignore" open the next game still to do after the current one in routine
  order, wrapping to the start. When none is left, the current game stays open and the aside footer reads
  "Routine done" in place of the count line.
- **Correcting a state.** On a game that already has a state for today, both buttons stay; the active one
  shows as pressed (`aria-pressed`). Clicking the other one switches the state and moves on like a first
  answer. Clicking the pressed one clears the state back to "to do" and stays on the game.
- **Midnight.** The routine schedules a timer for the next local midnight and reloads the day when it
  fires, and also checks the day key when the window regains focus, in case the machine slept through
  midnight. Reloading the day keeps the current game and the launch order.
- **Order.** Shuffle still happens once per launch. A reload at midnight does not reshuffle.
- **Session "opened" state.** The in-memory `opened` set and the "N/M opened" counter go away, replaced
  by the day states.
- **Settings.** The delete button keeps its place and becomes a removal that keeps history. Its label
  changes to "Remove".
- **Repository.** A new `src/storage/dayRepo.ts` next to `gamesRepo.ts`, with the same `Db` interface.
  Streaks are computed in a pure module under `src/routine/` from the rows and the game lifetimes, not in
  SQL, since the data stays small (a few games times a few hundred days).

## Left to the builder

- Icons, colours and wording of the states and streaks, within the `design` skill's rules. A streak of 0
  must still read clearly.
- File and module names beyond the ones named above.
- Whether to show "day" or "days" through a plural helper in `strings.ts`.

## Check

- `pnpm test`, `pnpm lint`, `pnpm build`, `cargo test`, `cargo clippy -- -D warnings` pass.
- Unit tests cover, with an injected clock:
  - the day key around midnight and on a daylight saving change;
  - game streak: finished run, ignored today, missed yesterday, still to do today, game added recently;
  - day streak: all finished, finished plus ignored, all ignored, one game left to do, a day before a
    game was added, a day after a game was removed, a game finished then removed today, today still in
    progress;
  - next game: skipping finished and ignored games, wrapping, none left;
  - the repository: upsert, clear, removal keeping rows, and listing only games still in the routine.
- Manual, on macOS, on a dev build:
  1. Finish two games and ignore one. Quit and relaunch: the states and the count are kept, and the
     routine opens on the first game still to do.
  2. Click an ignored game in the aside, click "Finished": its state changes and the count goes up. Click
     the pressed "Finished": it goes back to "to do".
  3. Answer every game: the footer reads "Routine done".
  4. Remove a game in Settings: it leaves the routine, the count drops by one.
  5. Leave the app open across midnight (or change the system clock): every game is back to "to do" and
     the streaks reflect the previous day.

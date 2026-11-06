# Desktop Dles MVP design

Date: 2026-11-03. Status: approved.

## Intent

Desktop Dles is a personal desktop app for a daily routine of "dles": daily web games such as Wordle,
Scrandle, Videogamedle or Farflung. Today the routine means opening several browser tabs and remembering
which games are done. The app puts the routine in one window: the list of games on the left, the current
game on the right, and a button to move to the next one.

The MVP proves one thing: that real game sites can be played inside the app, side by side with the list,
on macOS. Stats and streaks, the long-term value of the app, come later (see Backlog).

Mockup: https://claude.ai/artifact/7K2AruHunYxD191i4otGyi

## Goals

**Settings page**

- Add a game with a name and an `https://` URL.
- Edit a game's name and URL, with the same validation as adding.
- Delete a game.
- Reorder games with up and down buttons. This order is the routine order.
- A "Shuffle order on launch" toggle.
- Everything persists across app restarts.

**Routine page** (the page shown at launch)

- Left aside: the games, numbered, in routine order. With shuffle on, the order is shuffled once at app
  launch and stays fixed until the next launch.
- Right panel: the current game's real web page. The first game of the routine loads at launch.
- Clicking a game in the aside loads it in the panel.
- A "Next game" button above the panel loads the following game. On the last game it reads "Routine done"
  and is disabled.
- A game opened during this session is shown dimmed in the aside. A counter shows "N/M opened".
  Replaced on 2026-11-05 by per-day states and streaks, see `2026-11-05-today-loop-streaks-design.md`.
- With no games configured, the panel shows an empty state pointing to Settings.

**Language**: the UI is in English. Every user-facing string lives in one module, so translation can be
added later without touching components.

## Non-goals

Stats, streaks, result capture from the clipboard, JSON export, daily recommendation, translations,
notifications, sync between machines, mobile, signing and distribution. Linux and Windows are not tested
in the MVP (see Constraints).

## Anti-goals

The MVP fails, even if it works, if any of these happen:

- The app runs its own code in a game page: no initialization script, no `eval`, no script injection API,
  no browser extension. Stopping a game page from loading a resource, and on macOS hiding elements through
  WebKit's declarative content rules, is allowed (see `2026-11-06-content-blocking-design.md`); neither
  gives the page any channel to the app. The bridge that Tauri itself adds to every webview is accepted,
  as long as the next point holds.
- A game page can call the app's IPC. Game webviews match no capability, so every IPC call from them is
  refused.
- One game that refuses to load, or loads slowly, blocks the routine. The user must still be able to move
  to the next game.

## Constraints

- **Tauri v2 with the `unstable` Cargo feature**, accepted by Ludo. The list and the game share one
  window, which needs a child webview (`Window::add_child`). Known consequence: a child webview is a
  native view drawn over the app's DOM, so no app UI may overlap the game panel. Settings is a separate
  page, and the game webview is hidden while Settings is shown.
- The child webview's bounds must follow the panel: window resize and aside width.
- A game webview has its own cookie and storage, separate from Ludo's browser. Ludo has to sign in again
  inside the app where a game needs an account, and Google sign-in does not work in a webview. Accepted.
- Game sessions (cookies, local storage) must persist across app restarts, so a game remembers its own
  progress and streak.
- Platform: macOS first. Windows is the next target. Linux is a bonus.
- Repository: `~/perso/dev/desktop-dles`, to be published on Ludo's personal GitHub.

## Decided

- Frontend: Vite + React + TypeScript + TanStack Router in SPA mode. Not TanStack Start, because Tauri
  does not support server rendering.
- Storage: SQLite through the official Tauri SQL plugin.
- Data: a game is a name, a URL and a position. The shuffle toggle is a single setting.

## My calls (Ludo can override)

- **One child webview per game**, created when the game is first opened and kept alive (hidden) while
  another game is shown. Switching back is instant and keeps an unfinished game as it was. The cost is
  memory, acceptable for about 15 games.
- **One shared, persistent session store for all games** (the Tauri default), separate from Ludo's
  browser. No per-game isolation, so no macOS 14 minimum. Deleting a game in Settings does not clear any
  cookie or storage.
- **Navigation inside a game stays free** (sign-in flows need it). Links that open a new window
  (`target="_blank"`, `window.open`) open in the system browser.
- **A "Reload" button** next to "Next game" loads the game's configured URL again. It is the way back
  when a game navigated away, froze, or loads slowly.
- "Opened" is tracked for the current app session only, in memory. It resets on restart. A per-day,
  persisted "done" state belongs to stats. Brought in scope on 2026-11-05 by
  `2026-11-05-today-loop-streaks-design.md`.
- Shuffle happens at each app launch, not once per day.
- Editing a game's URL closes its webview if one is open, so the game reopens on the new URL. Editing
  only the name keeps the webview and its state.
- URL validation stays minimal: it must start with `https://`. No duplicate check.
- Specs and docs are written in English, since the repo will be public.

## Left to the builder

- How the frontend tells Rust where the game panel is (bounds on resize, show and hide).
- The SQLite schema and migrations.
- How a page that fails to load is shown in the panel: the panel shows WebKit's default for a failed load,
  usually blank, and Reload and Next game stay usable.
- Folder layout, linting and formatting.
- Tests: unit tests for ordering and shuffle and for the storage layer; a manual check on macOS that the
  four sample games load in the panel (Wordle, Scrandle, Videogamedle, Farflung).

## Success

Ludo opens the app in the morning, sees his routine, plays the first game in the panel, and reaches the
last one with "Next game", without opening his browser.

## Backlog after the MVP

In the order they would come:

1. Import the games list from a JSON or CSV file (name and URL, same validation as adding).
   Specified, with export, in `2026-11-06-share-lists-design.md` (JSON only).
2. Stats and streaks: one event per game per logical day, raw share text kept, editable history.
   The per-day states and the two streaks are specified in `2026-11-05-today-loop-streaks-design.md`;
   the share text, a history view and editing past days remain here.
3. Result capture: read the clipboard after the game's "share" button.
4. JSON export and import of the history.
5. Daily recommendation: one random game picked from https://dles.gg/ (no known API, check its terms).
   Specified, with hover synopses and a resizable sidebar, in `2026-11-06-daily-pick-design.md`.
6. Translations, building on the strings module.
7. Notification at each game's reset time.
8. Sync between machines.

Context and earlier decisions: council report https://claude.ai/artifact/1a9Df6QZy9o4jWyMfaYv2D, stack
comparison https://claude.ai/artifact/1bpYujfUj7VcBEr7L6MKNj.

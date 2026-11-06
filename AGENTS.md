# Desktop Dles

A personal desktop app for a daily routine of "dles", daily web games such as Wordle, Scrandle,
Videogamedle or Farflung. One window: the list of games on the left, the live game page on the right,
a "Next game" button between them. Built with Tauri 2.

## Read first

1. Spec: `docs/superpowers/specs/2026-11-03-mvp-design.md` (what the MVP does and does not do)
2. Decision record: `docs/adr/0001-tauri-multiwebview.md` (why Tauri `unstable` and not a PWA)
3. Plan: the latest file in `docs/superpowers/plans/`. Its checkboxes are the progress ledger.

## Decisions to follow, not re-derive

- Tauri 2 with the `unstable` Cargo feature: games are child webviews of the main window
  (`Window::add_child`). The window is built in Rust (`tauri.conf.json` has `app.windows: []`).
- Webview labels: `ui` for the React app, `game-<id>` for each game.
- One webview per game, created on first open, hidden (not closed) when another game is shown.
- One shared, persistent session store for all games (Tauri default). No `data_directory`.
- Frontend: Vite, React, TypeScript, TanStack Router in SPA mode with hash history. Not TanStack Start:
  Tauri does not support server rendering.
- The `ui` webview has Tauri's native drag-and-drop handler disabled (HTML5 file drops for import). The
  window-level guard in `src/main.tsx` that stops file drops from navigating it must stay.
- Storage: SQLite through `tauri-plugin-sql`. Migrations live in `src-tauri/migrations/`. SQL uses `?`
  placeholders so the same queries run under sqlx and under Node's `node:sqlite` in tests.
- UI copy is English, and every user-facing string lives in `src/strings.ts`.
- Package manager: pnpm. Lint and format: Biome.
- dles.gg is read only through the `dles_catalog` and `dles_game_page` Rust commands, which build the
  URLs themselves. The UI never sends a URL to fetch.

## Security invariants

Stop and ask before any change that touches one of these.

- The only capability file targets `"webviews": ["ui"]`. Never `windows`, never `remote`. A `windows`
  entry would also link every game webview of that window to the IPC.
- The app never runs its own code in a game page: no initialization script, no `eval`, no script injection
  API, no browser extension. It may stop a game page from loading a resource, and on macOS hide elements
  through WebKit's declarative content rules. Neither gives the page any channel to the app.
- Requests to open a new window from a game go to the system browser (`on_new_window` returns `Deny`).
- A game URL must start with `https://`.

## Commands

```bash
pnpm install
pnpm tauri dev                                    # run the app
pnpm test                                         # Vitest
pnpm lint                                         # Biome
pnpm build                                        # type-check and bundle the frontend
(cd src-tauri && cargo test && cargo clippy -- -D warnings)
```

`docs/agents/verify.md` lists the commands a pre-push hook runs. Keep it in sync with this section.

## Workflow

Spec, then plan, then code. A change of scope updates the spec under `docs/superpowers/specs/` before
any code. Items in the spec's backlog (games import, stats, streaks, clipboard capture, recommendation,
translations, notifications, sync) are not built unless asked.

Pure logic (`src/routine/`, `src/storage/`) is written test-first. Webview behaviour cannot be unit
tested: the manual checklist in the plan's last task is the check, on macOS.

## Looking things up

Tauri 2 moves fast and some APIs sit behind `unstable`. Check exact Rust signatures on docs.rs for the
installed version (2.12 at the time of the spec) or through Context7, never from memory.

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`). No co-author or tool
  attribution.
- Code, comments and docs in English. Comments explain why, not what.
- The repo is public: no secrets, no personal data in fixtures.
- Branches are named `<type>/<name>` (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`). Nothing lands
  on `main` without a pull request. Merging a `feat/*` pull request releases a minor version, a `fix/*` one a
  patch version (rules in `scripts/release.ts`).

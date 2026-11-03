# Desktop Dles

A personal macOS app for a daily routine of web games, the "dles" such as Wordle, Scrandle,
Videogamedle or Farflung. The game list is on the left, the current game is played on the right in
the same window, and a "Next game" button moves through the routine. Built with Tauri 2, React and
SQLite.

Scope and non-goals are in the [MVP spec](docs/superpowers/specs/2026-11-03-mvp-design.md).

## Prerequisites

- macOS with the Xcode Command Line Tools
- Rust stable, installed with rustup. Homebrew's `rustup` formula is keg-only, so add
  `/opt/homebrew/opt/rustup/bin` to your PATH.
- Node 24
- pnpm

## Run

```bash
pnpm install
pnpm tauri dev
```

## Checks

```bash
pnpm test                                   # unit tests (Vitest)
pnpm lint                                   # Biome
pnpm build                                  # type-check and bundle the frontend
(cd src-tauri && cargo test)
(cd src-tauri && cargo clippy -- -D warnings)
```

`docs/agents/verify.md` lists the same commands for the pre-push hook.

## The `unstable` Tauri feature

Each game is a child webview added to the main window, which puts the list and the game side by side
in one window. Tauri only offers this API behind the `unstable` Cargo feature, and it may change
between Tauri releases, so read the Tauri changelog before upgrading. The reasoning is in
[ADR 0001](docs/adr/0001-tauri-multiwebview.md).

Games use their own session store, separate from your browser, so you sign in again inside the app.

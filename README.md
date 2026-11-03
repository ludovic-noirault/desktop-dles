# Desktop Dles

A personal macOS and Windows app for a daily routine of web games, the "dles" such as Wordle,
Scrandle, Videogamedle or Farflung. The game list is on the left, the current game is played on the
right in the same window, and a "Next game" button moves through the routine. Built with Tauri 2,
React and SQLite.

Scope and non-goals are in the [MVP spec](docs/superpowers/specs/2026-11-03-mvp-design.md).

## Install

Download the `.dmg` (macOS, Apple Silicon) or the `.exe` (Windows) from the
[latest release](https://github.com/ludovic-noirault/desktop-dles/releases).

The app is not signed with a paid certificate, so both systems warn on first launch.

- macOS: the app is ad-hoc signed and not notarized. Open it once, then go to System Settings >
  Privacy & Security and click Open Anyway.
- Windows: the installer is unsigned. SmartScreen shows "Windows protected your PC": click
  "More info", then "Run anyway".

## Develop

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

## Releases

Merging a `feat/*` pull request into `main` releases a minor version, a `fix/*` one a patch version.
Other branch types release nothing. The rules are in `scripts/release.ts`, the pipeline in
`.github/workflows/release.yml`.

If a build fails, the release stays a draft. Use "Re-run failed jobs" in the Actions tab, never
"Re-run all jobs": that would recompute the version and push a second tag.

## The `unstable` Tauri feature

Each game is a child webview added to the main window, which puts the list and the game side by side
in one window. Tauri only offers this API behind the `unstable` Cargo feature, and it may change
between Tauri releases, so read the Tauri changelog before upgrading. The reasoning is in
[ADR 0001](docs/adr/0001-tauri-multiwebview.md).

Games use their own session store, separate from your browser, so you sign in again inside the app.

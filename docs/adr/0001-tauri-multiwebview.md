# ADR 0001: Tauri 2 with the unstable multi-webview, games inside the app

Status: accepted, 2026-11-03.

## Context

The app shows a list of daily web games and the current game side by side, in one window. The game is
the real third-party site, not a copy. Targets: macOS and Windows first, Linux as a bonus, tablets only
if cheap.

Two LLM council sessions reviewed the options (report: https://claude.ai/artifact/1a9Df6QZy9o4jWyMfaYv2D).
The second one recommended a PWA, four advisors out of five.

## Options considered

| Option | Why it was not chosen |
|---|---|
| PWA, games in browser tabs | Gives up the original idea: playing the whole routine inside the app. A PWA can show a third-party site only in an iframe, which many sites refuse |
| Tauri 2, stable, one window per game | Stable, but the list and the game are not side by side |
| Electron | Stable side by side, but ~100 MB and more for a personal tool |
| React Native (Windows, macOS, mobile) | No official Linux, two native desktop projects to maintain, desktop ecosystem thin |
| Wails 3 | Its 3.0.0 release exposes the JS bridge to every frame and advises against untrusted content |

## Decision

Tauri 2 with the `unstable` Cargo feature. Each game is a child webview added to the main window with
`Window::add_child`, positioned over the panel area.

## Consequences

- The multi-webview API may change between Tauri releases, and it has open bugs. Pin the Tauri version
  and read the changelog before upgrading.
- A child webview is a native view drawn over the app's DOM. No app UI may overlap the game panel, and
  game webviews are hidden on any page that needs that space.
- Game webviews have their own session store, separate from the user's browser. Logins and the games'
  own streaks kept in site storage start from zero in the app, and going back to the browser later does
  not bring them back. Google sign-in does not work in a webview.
- Moving to a PWA later stays possible: the UI, the routine logic and the storage layer are plain web
  code. Only the game panel and the SQLite access would change.

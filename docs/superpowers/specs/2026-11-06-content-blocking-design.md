# Content blocking design

Date: 2026-11-06. Status: draft, waiting for Ludo's review.

## Intent

Ludo used v0.4.0 for a full routine and the app worked, but the game pages did not feel like the routine he
wants. He had to close popups before playing, and on some sites he scrolled past large ad slots before
reaching the game. In his own browser, uBlock Origin and I-don't-care-about-cookies remove that noise. Game
webviews have neither.

The app should give each game page that same cleanup on its own: no cookie banner, no ad popups, no empty ad
slots pushing the game down. Krillion (`https://krillion.io/`) is the reference case.

What a recon of Krillion showed on 2026-11-06 (clean Playwright profile, nothing clicked):

- On load, one modal: a consentmanager.net banner ("Paramètres" or "Tout accepter", no "refuse all"). It
  lives in a shadow root under `div#cmpwrapper` and locks the page with `body { overflow: hidden }`.
- Ad stacks loaded but not yet shown, waiting for consent: Mediavine (`scripts.mediavine.com`,
  `exchange.mediavine.com`, `keywords.mediavine.com`), Google ad tags (`securepubads.g.doubleclick.net`),
  Grow.me (`scripts.grow.me`, `api.grow.me`), plus `scripts.scriptwrapper.com`, `metrics.rapidedge.io`,
  Google Tag Manager and Google Analytics. The popups Ludo saw most likely come after "Tout accepter". This is
  a guess: the recon did not consent.
- An empty `div.kr-ad-layout` sits in the page, ready for ad slots.

Every one of these hosts is a well-known entry in public filter lists, so Krillion needs no custom rule.

## Decided by Ludo

- Content blocking covers both ads and cookie banners, on macOS and Windows, in the same piece of work
  (2026-11-06).
- When blocking breaks a game, a button reloads the current game without blocking.
- That bypass is not remembered. A game that only works with its ads is a product that does not match Ludo's
  values; he removes it from the routine himself rather than keep an exception.
- Windows code is checked before merge by a new CI workflow on pull requests, running on `windows-latest`
  (2026-11-06). No branch installer: a Windows build that compiles but blocks too much is found after the
  release, as with the updater.
- Agreed after it was proposed: Brave's `adblock` crate as the single filter engine, filter lists bundled in
  the app rather than downloaded at runtime, the `ui` webview left unfiltered, and the security invariant
  reworded as below.

## Goals

1. Every game webview is filtered from its first request: requests to ad, tracking and consent-management
   hosts listed in the bundled filter lists do not load.
2. On macOS, cosmetic rules from the same lists also hide matching elements (ad slots, cookie banners and
   their overlays, page scroll locks where a list rule covers them), so the game moves up to where the ads
   were.
3. On Windows, network blocking only. A cookie banner disappears when its script is blocked, as on Krillion.
   A banner served from the game's own host stays visible.
4. The routine page has a "Reload without blocking" button next to the existing "Reload" button. It reloads
   the current game with no filtering of any kind, for that game only, until the app quits. Other games stay
   filtered. The next launch filters that game again.
5. Pressing the plain "Reload" on a game in bypass keeps the bypass (it is still the same app run).
6. Krillion, on both platforms: no consent banner, no ad, the page scrolls, and the game is playable.
7. A new workflow, `.github/workflows/windows-check.yml`, runs on every pull request into `main` and fails it
   when `cargo check`, `cargo clippy -- -D warnings` or `cargo test` fails in `src-tauri` on
   `windows-latest`. It needs the frontend built first only if `tauri::generate_context!` requires
   `frontendDist` at compile time; check that. No secret, `contents: read` only.

## Non-goals

- A setting to turn blocking off globally, or per game. The only escape is the bypass button.
- Remembering a bypass, or an allowlist of any kind.
- Downloading or updating filter lists at runtime.
- User-editable lists, custom rules in the UI, an element picker.
- Counting or showing what was blocked.
- Cosmetic filtering on Windows. It needs a script in the page; see Anti-goals.
- Clicking "refuse" in consent dialogs (what I-don't-care-about-cookies does with scripts). Hiding the banner
  and blocking its script is enough. Not consenting is what Ludo wants anyway.
- Linux and Intel macOS, as in the release pipeline spec.
- Filtering new-window requests. `on_new_window` keeps sending every http(s) new-window request to the
  system browser, where Ludo's own uBlock Origin filters it. Content rules and the WebView2 request handler
  only see requests loaded inside the webview. (Claude's call, raised by the builder check.)

## Anti-goals

- Any script of the app running in a game page, on any platform. No `initialization_script`, no `eval`, no
  `AddScriptToExecuteOnDocumentCreated`, no WebView2 browser extension (`browser_extensions_enabled` would
  also enable extensions for the whole WebView2 environment, `ui` included).
- A game page gaining any channel to the app. The capability file still targets `"webviews": ["ui"]` only.
- A broken game with no way out. The bypass button always works, even if the filter engine failed to load.
- The `ui` webview being filtered.
- A noticeable slowdown when switching games. Rule compilation must not happen on every game open.
- A filter failure keeping a game from opening. If the lists cannot be loaded or compiled, games open
  unfiltered and the error is logged. Blocking is a comfort, not a gate.

## Security invariant, reworded

`AGENTS.md` ("Security invariants") and the anti-goal of `docs/superpowers/specs/2026-11-03-mvp-design.md`
currently say "No script is injected into a game site". This work keeps that and makes the new allowance
explicit. Both places get the same meaning:

> The app never runs its own code in a game page: no initialization script, no `eval`, no script injection
> API, no browser extension. It may stop a game page from loading a resource, and on macOS hide elements
> through WebKit's declarative content rules. Neither gives the page any channel to the app.

The other invariants (capability target, `on_new_window` returning `Deny`, `https://` game URLs) are
unchanged.

## Constraints

- Tauri 2.12 (`tauri` 2.12.5, `wry` 0.57.1, `objc2-web-kit` 0.3.2, `webview2-com` 0.39.1 in `Cargo.lock`).
  Check every Rust signature on docs.rs or in `~/.cargo/registry` for these versions, never from memory.
- Filter engine: `adblock` (Brave's adblock-rust), 0.13.5 at the time of writing, MPL-2.0. docs.rs confirms a
  non-default `content-blocking` feature and "iOS content-blocking syntax conversion". The conversion API
  (type names, which filter kinds convert) was not verified: check it first, in the plan's first task.
- Game webviews are created in `src-tauri/src/games.rs` (`show_game`, through `Window::add_child`), reloaded by
  `reload_game` (which calls `navigate`) and closed by `close_game`. Filtering hooks in there.
- Platform access available in tauri 2.12.5:
  - macOS: `WebviewBuilder::with_webview_configuration(Retained<WKWebViewConfiguration>)`
    (`tauri/src/webview/mod.rs:1414`), and after creation `Webview::with_webview` giving
    `PlatformWebview::controller()`, the `WKUserContentController` (`mod.rs:213`). WebKit types come from
    `objc2-web-kit` (`WKContentRuleListStore`, `WKContentRuleList`, `WKUserContentController`).
  - Windows: `PlatformWebview::controller()` returns the `ICoreWebView2Controller` (`mod.rs:184`). Requests
    are intercepted with `AddWebResourceRequestedFilter` (or `...WithRequestSourceKinds`, which wry itself
    uses at `wry/src/webview2/mod.rs:1032`, so iframes and workers are covered) and `add_WebResourceRequested`,
    answering blocked requests with a response built by the environment (`CreateWebResourceResponse`).
- WKWebView cannot intercept `https` requests in code. On macOS, blocking only goes through
  `WKContentRuleList`. WebKit caps the number of rules per list; check the current cap and split lists if
  needed.
- Rules must be in place before the game's first request. On macOS, either give the webview a configuration
  that already carries the rule lists, or create it on `about:blank`, attach the lists, then navigate to the
  game URL. Check whether wry keeps or replaces the `userContentController` of a configuration passed through
  `with_webview_configuration`; that decides which of the two works.
- Compiled WebKit rule lists persist in `WKContentRuleListStore` under an identifier. Compile once per lists
  version, look up on later launches.
- IPC: no new capability entry and no change of target. The bypass reuses the existing `reload_game` command
  with a new argument, so `allow-reload-game` keeps covering it.
- Filter list licenses: EasyList and EasyPrivacy are dual GPLv3 / CC BY-SA 3.0. Use them under CC BY-SA with
  attribution in the README. Check the license of every bundled list before committing it.
- UI copy in English, in `src/strings.ts`. `.tsx` and `.css` edits load the `design` skill first.
- Rust logic that does not need a webview (engine construction, block decisions, rule conversion) is written
  test-first under `cargo test`. Webview behaviour is checked by hand on macOS and Windows.

## Builder's calls (Claude's, not Ludo's)

- Bundled lists: EasyList (ads), EasyPrivacy (trackers, as uBlock Origin enables it by default) and the
  EasyList Cookie List (consent banners). An annoyances list is left out until a real case asks for it.
- Lists are committed as text files under `src-tauri/filters/`, with a `scripts/update-filters.ts` that
  downloads the current versions and records their source URL and date. Ludo runs it before a release when
  he wants fresh lists. The release workflow does not fetch them, so a build is reproducible from the commit.
- One Rust module, `src-tauri/src/blocking.rs` (with `blocking/macos.rs` and `blocking/windows.rs` if it
  grows), owns the lists, the engine and the platform glue. `games.rs` only calls it when it creates or
  reloads a game webview.
- The set of game labels in bypass lives in Rust state (a `Mutex<HashSet<String>>` managed by the app), not in
  the UI, so the Windows request handler can read it and it dies with the process.
- `reload_game` gains `blocking: bool`. `false` adds the game's label to the bypass set, then on macOS removes
  all content rule lists from that webview's controller, then navigates. `true` reloads as today and keeps the
  current mode, so goal 5 holds. A bypassed webview closed by `close_game` (game deleted in Settings) drops
  its label from the set.
- macOS: convert the lists to WebKit JSON at build time (a `build.rs` step or a script whose output is
  committed, whichever the conversion API makes simpler), so the app ships ready JSON and only asks WebKit to
  compile it. The store identifier includes a hash of the JSON, so new lists recompile once.
- macOS compile timing: start compilation in Tauri's `setup`. A game opened before it finishes waits for it,
  with a timeout of 5 s, after which that game opens unfiltered and the error is logged.
- Windows: build the `adblock::Engine` once at startup from the bundled lists and share it with every game
  webview's handler. Blocked requests get an empty 403 response. Check whether the default `single-thread`
  feature makes the engine `!Send`/`!Sync`; WebView2 handlers run on the UI thread, so a main-thread-only
  engine may be fine.
- The bypass button label: "Reload without blocking". It sits next to "Reload" in the routine page and uses
  the same button style, secondary to "Next game".
- README: one paragraph on content blocking, the bypass button, and the list attributions.

## Left to the builder

- The exact `adblock` APIs and feature flags, after checking docs.rs.
- How the converted macOS rules are split if they exceed WebKit's cap.
- Logging format for filter errors.
- Rust tests: at least that the engine blocks `https://scripts.mediavine.com/` and
  `https://cdn.consentmanager.net/` requested from `https://krillion.io/`, allows `https://krillion.io/`
  itself, and that the converted macOS JSON parses and stays under the rule cap.

## Manual check (macOS, then Windows)

No website data is cleared for this check: game progress lives in the same shared store. Ludo may already
have consented on Krillion in v0.4.0, in which case the banner no longer shows with or without blocking and
the ads are the signal instead. (Claude's call, raised by the builder check.)

1. Fresh launch, open Krillion: no consent banner, no ad, the page scrolls, the game plays.
2. "Reload without blocking": the consent banner comes back, or ads appear if consent was already stored.
3. "Reload" on Krillion: still unfiltered. Open another game: filtered.
4. Quit and relaunch: Krillion is filtered again.
5. Run the rest of the routine: note any game that breaks or looks wrong, for a later rule fix or a removal
   from the routine.
6. macOS only: an ad slot that used to push a game down is gone, not just empty.

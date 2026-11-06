# Content Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter ads, trackers and cookie banners out of every game webview on macOS and Windows, with a per-game "Reload without blocking" escape.

**Architecture:** Three public filter lists are committed under `src-tauri/filters/` and embedded in the binary. Brave's `adblock` crate parses them: on Windows it answers every WebView2 `WebResourceRequested` event, on macOS it converts each list into a WebKit content rule list that WebKit compiles once and caches. A game webview is now created on `about:blank`, gets its filtering attached, then navigates to the game, so the first request is already filtered. A Rust-side bypass set holds the games reloaded without blocking until the app quits.

**Tech Stack:** Tauri 2.12.5 (`unstable`), wry 0.57.1, `adblock` 0.13.5, `objc2-web-kit` 0.3.2 (macOS), `webview2-com` 0.39 (Windows), React + TypeScript, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-06-content-blocking-design.md`

## Global Constraints

- No app code ever runs in a game page: no `initialization_script`, no `eval`, no `AddScriptToExecuteOnDocumentCreated`, no `browser_extensions_enabled`.
- The capability file keeps `"webviews": ["ui"]` and gains no permission. The bypass reuses `reload_game`, covered by `allow-reload-game`.
- The `ui` webview is never filtered.
- A filter failure never blocks a game: lists that fail to load or compile are skipped and logged with `eprintln!`, and the game opens unfiltered.
- Rules are attached before the game's first request. A game opened while rules are still compiling waits at most 5 s, then opens unfiltered.
- The bypass lasts until the app quits, for one game only, and survives a plain "Reload". Nothing is persisted.
- Lists: EasyList, EasyPrivacy, EasyList Cookie List. They are never downloaded at runtime or by the release workflow.
- Every Rust signature is checked against the locked versions (`~/.cargo/registry/src/index.crates.io-*/` or docs.rs). The API names in this plan were read from those sources on 2026-11-06.
- UI copy is English and lives in `src/strings.ts`. Load the `design` skill before editing `.tsx` or `.css`.
- Rust gates: `(cd src-tauri && cargo test && cargo clippy -- -D warnings)`. Frontend gates: `pnpm test && pnpm lint && pnpm build`.
- Conventional commits, no tool attribution. Branch: `feat/content-blocking` (already created, spec committed).

## Review Focus

1. **A game opened before macOS compilation finishes** (the first launch after a list update): it must open within about 5 s, unfiltered, without an error shown. Covered by the `Readiness` tests in Task 3.
2. **A game whose own URL matches a filter**: the top-level page must never be blocked, only its subresources. Covered by `top_level_document_is_never_blocked` in Task 2.
3. **The game's own first-party resources**: `https://krillion.io/` scripts must load. Covered by `first_party_resources_are_allowed` in Task 2.
4. **A list that converts to zero rules or fails to convert**: it is skipped instead of making WebKit reject the compile. Covered by `empty_list_yields_no_rules` in Task 2.
5. **A bypassed game deleted in Settings and a plain "Reload" after a bypass**: the first drops the bypass, the second keeps it. Covered by the `Bypass` tests in Task 3.

---

### Task 1: Filter lists and the update script

**Files:**
- Create: `scripts/update-filters.ts`
- Create: `src-tauri/filters/easylist.txt`, `src-tauri/filters/easyprivacy.txt`, `src-tauri/filters/easylist-cookie.txt`, `src-tauri/filters/version.txt` (written by the script)
- Modify: `biome.json` only if Biome tries to lint `src-tauri/filters/` (it should ignore `.txt`; check)

**Interfaces:**
- Produces: the four files above. `version.txt` holds one line, the UTC timestamp of the download in `YYYYMMDDTHHMMSSZ` form (no characters other than digits, `T` and `Z`, so it is safe in a WebKit identifier). Later tasks embed them with `include_str!`.

- [x] **Step 1: Write `scripts/update-filters.ts`**

Runs with `node scripts/update-filters.ts` (Node 24 strips types, as `scripts/release.ts` does). It downloads, in parallel:

| File | URL |
|---|---|
| `easylist.txt` | `https://easylist.to/easylist/easylist.txt` |
| `easyprivacy.txt` | `https://easylist.to/easylist/easyprivacy.txt` |
| `easylist-cookie.txt` | `https://secure.fanboy.co.nz/fanboy-cookiemonster.txt` |

It fails with a non-zero exit, writing nothing, if any response is not 200 or its body does not start with `[Adblock Plus`. Otherwise it writes the three files and `version.txt`. No unit test: the script is only I/O, and Step 2 is its check.

- [x] **Step 2: Run it**

Run: `node scripts/update-filters.ts && ls -la src-tauri/filters && cat src-tauri/filters/version.txt`
Expected: three files of roughly 0.9 to 2.1 MB and one timestamp line.

- [x] **Step 3: Check the coverage and the gates**

Run: `grep -c '||mediavine.com^\$third-party' src-tauri/filters/easylist.txt; grep -c '||consentmanager.net^\$third-party' src-tauri/filters/easylist-cookie.txt; pnpm lint`
Expected: `1`, `1`, lint clean.

- [x] **Step 4: Commit**

```bash
git add scripts/update-filters.ts src-tauri/filters
git commit -m "feat: bundle filter lists with an update script"
```

### Task 2: Filter engine and WebKit conversion (`blocking/filters.rs`)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/blocking/mod.rs` (only `pub mod filters;` in this task)
- Create: `src-tauri/src/blocking/filters.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod blocking;`)

**Interfaces:**
- Consumes: the files of Task 1.
- Produces:
  - `pub struct FilterList { pub name: &'static str, pub text: &'static str }`
  - `pub const LISTS: [FilterList; 3]` with names `"easylist"`, `"easyprivacy"`, `"easylist-cookie"`
  - `pub fn version() -> &'static str`: `version.txt` trimmed
  - `#[cfg(any(windows, test))] pub fn build_engine() -> adblock::Engine`
  - `#[cfg(any(windows, test))] pub fn should_block(engine: &adblock::Engine, url: &str, source_url: &str, request_type: &str) -> bool`
  - `#[cfg(any(target_os = "macos", test))] pub fn content_rules_json(text: &str) -> Option<(String, usize)>`: the WebKit JSON and its rule count, `None` when conversion fails or yields zero rules
  - `#[cfg(any(target_os = "macos", test))] pub fn rule_list_id(name: &str) -> String`: `format!("dles-{name}-{}", version())`
  - `pub const WEBKIT_MAX_RULES: usize = 150_000;`

- [x] **Step 1: Add the dependencies**

In `[dependencies]`: `adblock = { version = "0.13.5", default-features = false, features = ["embedded-domain-resolver", "full-regex-handling", "content-blocking"] }` and `serde_json = "1"`. Dropping the default `single-thread` feature makes `Engine` usable from a `static` (its regex manager becomes a `Mutex` instead of a `RefCell`, `blocker.rs:82-92`).

- [x] **Step 2: Write the failing tests in `filters.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn engine() -> adblock::Engine { build_engine() }

    #[test]
    fn engine_is_send_and_sync() {
        fn check<T: Send + Sync>() {}
        check::<adblock::Engine>();
    }

    #[test]
    fn krillion_ad_and_consent_scripts_are_blocked() {
        let e = engine();
        assert!(should_block(&e, "https://scripts.mediavine.com/tags/krillion.js", "https://krillion.io/", "script"));
        assert!(should_block(&e, "https://cdn.consentmanager.net/delivery/cmp.min.js", "https://krillion.io/", "script"));
    }

    #[test]
    fn first_party_resources_are_allowed() {
        let e = engine();
        assert!(!should_block(&e, "https://krillion.io/_next/static/chunks/main.js", "https://krillion.io/", "script"));
    }

    #[test]
    fn top_level_document_is_never_blocked() {
        let e = engine();
        assert!(!should_block(&e, "https://scripts.mediavine.com/", "https://scripts.mediavine.com/", "document"));
    }

    #[test]
    fn unparsable_url_is_allowed() {
        let e = engine();
        assert!(!should_block(&e, "not a url", "https://krillion.io/", "script"));
    }

    #[test]
    fn every_bundled_list_converts_under_the_webkit_cap() {
        for list in LISTS {
            let (json, count) = content_rules_json(list.text).expect(list.name);
            assert!(count > 0 && count < WEBKIT_MAX_RULES, "{}: {count} rules", list.name);
            let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed.as_array().unwrap().len(), count);
        }
    }

    #[test]
    fn empty_list_yields_no_rules() {
        assert!(content_rules_json("").is_none());
        assert!(content_rules_json("! only a comment\n").is_none());
    }

    #[test]
    fn rule_list_ids_carry_the_lists_version() {
        assert_eq!(rule_list_id("easylist"), format!("dles-easylist-{}", version()));
        assert!(version().chars().all(|c| c.is_ascii_digit() || c == 'T' || c == 'Z'));
    }
}
```

- [x] **Step 3: Run them to see them fail**

Run: `cd src-tauri && cargo test blocking::filters`
Expected: compile errors for the missing items.

- [x] **Step 4: Implement `filters.rs`**

- `build_engine`: one `adblock::lists::FilterSet::new(false)`, `add_filter_list(list.text.to_string(), ParseOptions::default())` for each list, then `adblock::Engine::new_with_filter_set(set)`.
- `should_block`: `false` when `request_type == "document"` or `adblock::request::Request::new(url, source_url, request_type, "GET")` errs; otherwise `engine.check_network_request(&request).should_block()`.
- `content_rules_json`: `FilterSet::new(true)` (debug is required, `into_content_blocking` returns `Err(())` otherwise), add the text, `into_content_blocking()`, keep the `Vec<CbRule>`, return `None` if empty or on error, else `serde_json::to_string` and the length. The conversion already orders `ignore-previous-rules` and appends the first-party document exception (`lists.rs` `into_content_blocking`).

If a list goes over `WEBKIT_MAX_RULES`, stop and report: splitting a list breaks its exceptions, since `ignore-previous-rules` only applies inside one WebKit list.

- [x] **Step 5: Run the tests and the lints**

Run: `cd src-tauri && cargo test blocking::filters && cargo clippy -- -D warnings`
Expected: 8 passed, no warnings. Note each list's rule count in the commit body.

- [x] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/blocking src-tauri/src/lib.rs
git commit -m "feat: add the filter engine and WebKit rule conversion"
```

### Task 3: Bypass, readiness, and the game webview lifecycle

**Files:**
- Modify: `src-tauri/src/blocking/mod.rs`
- Modify: `src-tauri/src/games.rs` (`show_game`, `reload_game`, `close_game`)
- Modify: `src-tauri/src/lib.rs` (manage `Bypass`, call `blocking::init` in `setup`)
- Modify: `src/games/gameViews.ts`, `src/pages/RoutinePage.tsx`, `src/strings.ts`

**Interfaces:**
- Consumes: nothing from Task 2 yet (platform glue comes in Tasks 4 and 5).
- Produces, in `blocking/mod.rs`:
  - `#[derive(Default)] pub struct Bypass(Mutex<HashSet<String>>)` with `pub fn insert(&self, label: &str)`, `pub fn remove(&self, label: &str)`, `pub fn contains(&self, label: &str) -> bool`
  - `pub struct Readiness` with `pub const fn new() -> Self`, `pub fn mark_ready(&self)`, `pub fn wait(&self, timeout: Duration) -> bool` (true once ready, false on timeout), and `pub static READY: Readiness = Readiness::new();`
  - `pub const ATTACH_TIMEOUT: Duration = Duration::from_secs(5);`
  - `pub fn init(app: &AppHandle)`: calls `macos::init` or `windows::init`, else `READY.mark_ready()`
  - `pub fn attach(webview: &Webview)`: `READY.wait(ATTACH_TIMEOUT)`; on timeout logs and returns; else calls the platform `attach`. Never returns an error: failures are logged.
  - `pub fn detach(webview: &Webview)`: platform `detach`, no-op where the platform has nothing to remove.
  - Until Tasks 4 and 5, the platform calls are no-ops and `init` marks ready.
- Produces, in `games.rs`: `reload_game(app: AppHandle, bypass: State<'_, Bypass>, id: i64, url: String, blocking: bool)`.
- Produces, in `gameViews.ts`: `reloadGame(id: number, url: string, blocking: boolean): Promise<void>`.

- [x] **Step 1: Write the failing tests in `blocking/mod.rs`**

```rust
#[test]
fn bypass_holds_until_removed() {
    let b = Bypass::default();
    assert!(!b.contains("game-1"));
    b.insert("game-1");
    assert!(b.contains("game-1") && !b.contains("game-2"));
    b.insert("game-1");
    assert!(b.contains("game-1"));
    b.remove("game-1");
    assert!(!b.contains("game-1"));
}

#[test]
fn readiness_times_out_then_releases_waiters() {
    let r = std::sync::Arc::new(Readiness::new());
    assert!(!r.wait(Duration::from_millis(20)));
    let r2 = r.clone();
    let waiter = std::thread::spawn(move || r2.wait(Duration::from_secs(5)));
    r.mark_ready();
    assert!(waiter.join().unwrap());
    assert!(r.wait(Duration::ZERO));
}
```

- [x] **Step 2: Run them to see them fail**

Run: `cd src-tauri && cargo test blocking::tests`
Expected: compile errors.

- [x] **Step 3: Implement `Bypass` and `Readiness`**

`Readiness` is a `Mutex<bool>` plus a `Condvar` (`wait_timeout_while`), both `const`-constructible.

- [x] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test blocking::tests`
Expected: 2 passed.

- [x] **Step 5: Wire the lifecycle in `games.rs` and `lib.rs`**

- `lib.rs`: `.manage(blocking::Bypass::default())` and `blocking::init(app.handle())` at the start of `setup`.
- `show_game`, creation path: build the `WebviewBuilder` with `WebviewUrl::External(Url::parse("about:blank").unwrap())` (keep `on_new_window` as is), keep the `Webview` that `add_child` returns, call `blocking::attach(&webview)`, then `webview.navigate(url)`. `parse_game_url` still validates the game URL before anything is created. Both `with_webview` (used by `attach`) and `navigate` go through the main thread's event queue in order, so the rules are in place before the game's first request. A comment states this ordering.
- `reload_game`: when `!blocking`, `bypass.insert(&label)` then `blocking::detach(&webview)`, then navigate as today. When `blocking`, navigate only: a bypassed game stays bypassed.
- `close_game`: `bypass.remove(&label)` in both match arms.

- [x] **Step 6: Add the button (load the `design` skill first)**

- `src/strings.ts`: `routine.reloadUnblocked: "Reload without blocking"`.
- `gameViews.ts`: `reloadGame(id, url, blocking)` passes `{ id, url, blocking }`.
- `RoutinePage.tsx`: the existing button calls `reloadGame(game.id, game.url, true)`; a second button right after it, same style (no `primary`), calls `reloadGame(game.id, game.url, false)` with the new string.

- [x] **Step 7: Run all gates**

Run: `pnpm test && pnpm lint && pnpm build && (cd src-tauri && cargo test && cargo clippy -- -D warnings)`
Expected: all green.

- [x] **Step 8: Smoke run**

Run: `pnpm tauri dev`, open two games, press both reload buttons on one.
Expected: every game still loads (now through `about:blank`), both buttons reload, nothing is filtered yet.

- [x] **Step 9: Commit**

```bash
git add src-tauri/src src/games/gameViews.ts src/pages/RoutinePage.tsx src/strings.ts
git commit -m "feat: add the reload without blocking button and bypass state"
```

### Task 4: macOS glue (`blocking/macos.rs`)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/blocking/macos.rs`
- Modify: `src-tauri/src/blocking/mod.rs` (`#[cfg(target_os = "macos")] mod macos;` and dispatch)

**Interfaces:**
- Consumes: `filters::{LISTS, content_rules_json, rule_list_id}`, `READY`.
- Produces: `pub fn init(app: &AppHandle)`, `pub fn attach(webview: &Webview)`, `pub fn detach(webview: &Webview)`.

- [x] **Step 1: Add the macOS dependencies**

```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
block2 = "0.6"
objc2-foundation = { version = "0.3", features = ["NSString", "NSError"] }
objc2-web-kit = { version = "0.3", features = ["WKContentRuleList", "WKContentRuleListStore", "WKUserContentController", "block2"] }
```

Keep the versions the lock already resolves (objc2 0.6.5, block2 0.6.2, objc2-foundation 0.3.2, objc2-web-kit 0.3.2). Add any feature the compiler asks for.

- [x] **Step 2: Implement `init`**

Compiled lists live only on the main thread: `thread_local! { static RULE_LISTS: RefCell<Vec<Retained<WKContentRuleList>>> }`.

1. `app.run_on_main_thread`: get `WKContentRuleListStore::defaultStore(mtm)`. For each list, `lookUpContentRuleListForIdentifier_completionHandler(rule_list_id(name))`.
2. A hit is pushed to `RULE_LISTS`. A miss is sent to a `std::thread` that runs `content_rules_json(list.text)`, then back through `run_on_main_thread` to `compileContentRuleListForIdentifier_encodedContentRuleList_completionHandler`. A compiled list is pushed. A `None` from the conversion or a compile error is logged and skipped.
3. A counter starting at `LISTS.len()` is decremented when each list ends (hit, compiled, or skipped). At zero, `READY.mark_ready()`.

Old identifiers from earlier list versions stay in the store. Accepted: a few MB on disk, cleaned up on reinstall.

- [x] **Step 3: Implement `attach` and `detach`**

`webview.with_webview(|pw| …)`: cast `pw.controller()` to `&WKUserContentController`, then `addContentRuleList` for each entry of `RULE_LISTS` (`attach`) or `removeAllContentRuleLists()` (`detach`). Log a `with_webview` error.

- [x] **Step 4: Gates**

Run: `(cd src-tauri && cargo test && cargo clippy -- -D warnings)`
Expected: green.

- [x] **Step 5: Check on the real app**

Run: `pnpm tauri dev`, open Krillion, then open Safari's Web Inspector on the game webview if enabled, or watch the page.
Expected: no consent banner and no Mediavine request. Second launch: filtering in place right away (the lookup hits). "Reload without blocking": the banner returns, or ads appear if consent was stored in v0.4.0. If WebKit rejects a list for its size, stop and report the error and the counts.

- [x] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/blocking
git commit -m "feat: apply WebKit content rule lists to game webviews"
```

### Task 5: Windows glue (`blocking/windows.rs`) and the Windows CI check

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/blocking/windows.rs`
- Modify: `src-tauri/src/blocking/mod.rs` (`#[cfg(windows)] mod windows;` and dispatch)
- Create: `.github/workflows/windows-check.yml`

**Interfaces:**
- Consumes: `filters::{build_engine, should_block}`, `Bypass`, `READY`.
- Produces: `pub fn init(app: &AppHandle)`, `pub fn attach(webview: &Webview)`, `pub fn detach(_: &Webview)` (no-op: the handler reads `Bypass`).

- [x] **Step 1: Add the Windows dependencies**

```toml
[target.'cfg(windows)'.dependencies]
webview2-com = "0.39"
windows = { version = "0.62", features = ["Win32_Foundation"] }
windows-core = "0.62"
```

Same majors as wry 0.57.1, so the COM types are the ones `PlatformWebview::controller()` returns.

- [x] **Step 2: Implement `init`**

`static ENGINE: OnceLock<adblock::Engine>`. `init` spawns a thread that builds the engine, sets it, then calls `READY.mark_ready()`. It keeps the `AppHandle` it needs for `attach` in a `OnceLock<AppHandle>`.

- [x] **Step 3: Implement `attach`**

In `webview.with_webview`: get `controller().CoreWebView2()`, cast it to `ICoreWebView2_22` and call `AddWebResourceRequestedFilterWithRequestSourceKinds("*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL, COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL)`, as wry does at `wry/src/webview2/mod.rs:1032`, so iframes and workers are covered. Then `add_WebResourceRequested` with a handler that:

1. returns at once if `Bypass` (from the stored `AppHandle`) contains the webview's label, or if `ENGINE` is not set;
2. reads the request URI, the resource context, and the page URL (`CoreWebView2::Source()`);
3. maps the context to adblock's type: `DOCUMENT` → `"document"`, `SCRIPT` → `"script"`, `IMAGE` → `"image"`, `STYLESHEET` → `"stylesheet"`, `FONT` → `"font"`, `MEDIA` → `"media"`, `XML_HTTP_REQUEST` → `"xmlhttprequest"`, `FETCH` → `"fetch"`, `WEBSOCKET` → `"websocket"`, anything else → `"other"`;
4. when `should_block` is true, sets `args.SetResponse(environment.CreateWebResourceResponse(None, 403, "Blocked", ""))`, with the environment from `PlatformWebview::environment()`.

The handler only reads, so no script ever reaches the page. Any COM error is logged and the request goes through.

- [x] **Step 4: Write `.github/workflows/windows-check.yml`**

On `pull_request` into `main`, `permissions: contents: read`, one job on `windows-latest`. It uses the same setup actions and versions as `release.yml`'s build job (checkout, pnpm 12, Node 24, Rust stable), then runs `pnpm install --frozen-lockfile` and `pnpm build` (`tauri::generate_context!` needs `frontendDist` `../dist` to exist), then, in `src-tauri`, `cargo check`, `cargo clippy -- -D warnings` and `cargo test`. No secret.

- [x] **Step 5: Local gates**

Run: `(cd src-tauri && cargo test && cargo clippy -- -D warnings)`
Expected: green on macOS. The Windows code compiles for the first time in CI on the pull request (Task 7). If `rustup target add x86_64-pc-windows-msvc` and `cargo check --target x86_64-pc-windows-msvc` work locally, run them too. They may fail on native dependencies; CI is the authority.

- [x] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/blocking .github/workflows/windows-check.yml
git commit -m "feat: block filtered requests in Windows game webviews"
```

### Task 6: Invariant wording and docs

**Files:**
- Modify: `AGENTS.md` ("Security invariants")
- Modify: `docs/superpowers/specs/2026-11-03-mvp-design.md` (first anti-goal)
- Modify: `README.md`

- [x] **Step 1: Reword the invariant**

In `AGENTS.md`, replace the bullet "No script is injected into a game site: no `initialization_script`, no `eval` on a `game-*` webview." with:

> The app never runs its own code in a game page: no initialization script, no `eval`, no script injection API, no browser extension. It may stop a game page from loading a resource, and on macOS hide elements through WebKit's declarative content rules. Neither gives the page any channel to the app.

In the MVP spec, the first anti-goal gets the same meaning and a pointer to `2026-11-06-content-blocking-design.md`. Add `docs/superpowers/specs/2026-11-06-content-blocking-design.md` nowhere else; `AGENTS.md` "Read first" stays as is.

- [x] **Step 2: README**

One paragraph: games are filtered with EasyList, EasyPrivacy and the EasyList Cookie List; "Reload without blocking" reloads one game unfiltered until the app quits; `node scripts/update-filters.ts` refreshes the lists. Attribution: EasyList and EasyPrivacy by The EasyList authors, used under CC BY-SA 3.0 (dual-licensed with GPLv3); EasyList Cookie List under CC BY 3.0 (its header). Re-check each license line against the downloaded headers.

- [x] **Step 3: Gates and commit**

Run: `pnpm lint`
Expected: clean.

```bash
git add AGENTS.md docs/superpowers/specs/2026-11-03-mvp-design.md README.md
git commit -m "docs: reword the game page invariant for content blocking"
```

### Task 7: Pull request and manual check

- [ ] **Step 1: Open the pull request** through the `open-pr` skill. Expected: `windows-check` is green. A red check is fixed on the branch before anything else.

- [ ] **Step 2: Manual check on macOS** with `pnpm tauri dev`, then on the released build after merge. No website data is cleared.

1. Fresh launch, open Krillion: no consent banner, no ad, the page scrolls, the game plays.
2. "Reload without blocking": the consent banner comes back, or ads appear if consent was already stored.
3. "Reload" on Krillion: still unfiltered. Open another game: filtered.
4. Quit and relaunch: Krillion is filtered again.
5. Run the rest of the routine: note any game that breaks or looks wrong.
6. An ad slot that used to push a game down is gone, not just empty.

- [ ] **Step 3: Manual check on Windows** on the released build, steps 1 to 5. Expected difference: a banner served from the game's own host may stay.

- [ ] **Step 4: Record the results** under this step: date, platform, games that broke.

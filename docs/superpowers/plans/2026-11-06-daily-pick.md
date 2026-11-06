# Daily Pick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show one dles.gg game a day in a "Pick of the day" card with hover synopses, make the sidebar resizable, reorder games in Settings with a drag handle, and turn the app's action buttons into icons.

**Architecture:** Two Rust commands fetch `https://dles.gg/` and `https://dles.gg/game/<slug>` and hand the raw HTML to the UI; they build the URLs themselves. Pure TypeScript parses the pages, draws the pick and decides what to fetch; an orchestration module with injected fetchers holds the day's flow and is tested against the `node:sqlite` test database. React components stay thin: a card and a bubble inside the sidebar, a resize handle, a reorder handle, an `IconButton`.

**Tech Stack:** Tauri 2.12.5, `reqwest` 0.13 (already in `Cargo.lock` through the updater), React 19 + TypeScript, `lucide-react`, Vitest with `node:sqlite`, Biome.

**Spec:** `docs/superpowers/specs/2026-11-06-daily-pick-design.md`

## Global Constraints

- The UI never sends a URL to Rust. The commands build `https://dles.gg/` and `https://dles.gg/game/<slug>` and reject a slug that does not match `^[a-z0-9-]+$`.
- Requests: User-Agent naming the app and `https://github.com/ludovic-noirault/desktop-dles`, 10 s timeout, 5 MB response cap. One catalog request at most per launch and per day; game pages one at a time.
- Capability target stays `"webviews": ["ui"]`. New permissions: `allow-dles-catalog` and `allow-dles-game-page` only. No HTTP plugin permission for JavaScript.
- Nothing from dles.gg in the repository beyond the trimmed test fixtures (three catalog entries, two game pages cut to the parsed tags).
- Every catalog URL goes through `isValidGameUrl` (`src/routine/routine.ts`) before it can be picked or added.
- Parsers fail closed: no pick, no synopsis, never wrong data.
- URL key: lower-case host without leading `www.`, path without trailing `/` and trailing `/index.html`, query and fragment ignored.
- Sidebar width: default 220 px, minimum 180 px, maximum half the window, saved in the `settings` table as `sidebar_width`.
- Icons from `lucide-react`, imported one by one, `aria-hidden`; the button carries `aria-label` and `title` from `src/strings.ts`.
- Buttons that keep their text: Save and Cancel when editing a game, the import and export popups, the startup screen, the update offer, Settings › Updates.
- No drag-and-drop library and no HTML5 drag and drop: pointer events with pointer capture.
- UI copy in English in `src/strings.ts`. Load the `design` skill before editing `.tsx` or `.css`.
- SQL uses `?` placeholders. New migration `003_daily_pick.sql`, registered in `src-tauri/src/lib.rs` and `src/storage/testDb.ts`.
- Check Rust signatures against the locked versions in `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/`. Read on 2026-11-06: `tauri-plugin-updater` 2.14.1 uses `reqwest` 0.13 with `default-features = false`; `reqwest` 0.13.5 has a `rustls` feature (its `default-tls`).
- Gates: `pnpm test && pnpm lint && pnpm build` and `(cd src-tauri && cargo test && cargo clippy -- -D warnings)`.
- Conventional commits, no tool attribution. Branch `feat/daily-pick` (spec already committed).

## Review Focus

1. **React StrictMode runs effects twice, and the window can regain focus mid-load**: two loads of the same day must not draw two picks or fetch the catalog twice. Test `concurrent loads of one day draw once and fetch the catalog once` in Task 4.
2. **Ludo adds the picked game by hand in Settings** while the card shows it: the card must hide, or "Add to routine" would create a duplicate. Test `a pick already in the routine is not visible` in Task 4.
3. **A synopsis with HTML entities** (`&#x27;`, `&amp;`) read from the `<meta>` fallback must show as plain characters. Test `decodes entities in the meta description` in Task 1.
4. **The app stays open past midnight** with a card showing: the next day draws a new pick, and today's skips do not carry over. Test `a new day draws again and ignores yesterday's skips` in Task 4.
5. **A picked game's page fails** (404 after it left dles.gg, timeout): the pick shows with its name only, nothing is stored in `dles_info`, and the next launch tries the page once more. Test `a failed game page keeps the pick with name only and stores no info` in Task 4.

---

### Task 1: URL key and dles.gg parsers

**Files:**
- Create: `src/dles/catalog.ts`, `src/dles/catalog.test.ts`
- Create: `src/dles/fixtures/home.html`, `src/dles/fixtures/game-wordle.html`, `src/dles/fixtures/game-meta-only.html`

**Interfaces:**
- Consumes: `isValidGameUrl` from `src/routine/routine.ts`.
- Produces (no Tauri import):
  - `export type CatalogGame = { slug: string; name: string; url: string };`
  - `export type GameInfo = { synopsis: string | null; category: string | null };`
  - `export function gameUrlKey(url: string): string | null`
  - `export function parseCatalog(html: string): CatalogGame[]`
  - `export function parseGamePage(html: string): GameInfo`

- [x] **Step 1: Write the fixtures.** They mimic the real markup observed on 2026-11-06, trimmed.
  - `home.html`: a few `<script>self.__next_f.push([1,"..."])</script>` tags whose string arguments, concatenated, contain `"allGames":[...]`. Put the array across two pushes, so the parser must join them first. Four entries: Wordle (`https://www.nytimes.com/games/wordle/index.html`, slug `wordle`), Globle (`https://globle-game.com/game`, slug `globle`), one with `http://` URL, one whose URL normalises to Globle's key (`https://www.globle-game.com/game/`, slug `globle-copy`). Every object also has an `id`.
  - `game-wordle.html`: a `<script type="application/ld+json">` with `{"@type":"SoftwareApplication","description":"Guess a 5-letter word in 6 tries. Each guess reveals which letters are correct, in the word but misplaced, or absent.","genre":"Words"}`, a `BreadcrumbList` JSON-LD before it, and a `<meta name="description">` with the same text.
  - `game-meta-only.html`: no JSON-LD, `<meta name="description" content="Pick the fan&#x27;s favourite &amp; win">`.

- [x] **Step 2: Write the failing tests** in `src/dles/catalog.test.ts`:
  - `gameUrlKey`: `gameUrlKey("https://www.nytimes.com/games/wordle")` and `gameUrlKey("https://www.nytimes.com/games/wordle/index.html?ref=dles.gg#x")` both equal `"nytimes.com/games/wordle"`; `gameUrlKey("https://Scrandle.net/")` equals `gameUrlKey("https://scrandle.net")` equals `"scrandle.net"`; `gameUrlKey("https://a.com/x")` differs from `gameUrlKey("https://a.com/y")`; `gameUrlKey("http://a.com")` and `gameUrlKey("not a url")` are `null`.
  - `parses the catalog across pushes`: `parseCatalog(home)` deep-equals `[{ slug: "wordle", name: "Wordle", url: "https://www.nytimes.com/games/wordle/index.html" }, { slug: "globle", name: "Globle", url: "https://globle-game.com/game" }]` (no `id`, the `http://` entry and the duplicate key dropped, first wins).
  - `returns an empty catalog when allGames is missing or broken`: `parseCatalog("<html></html>")` and `parseCatalog` of a push holding `"allGames":[{"name":` both return `[]`.
  - `skips entries with a bad slug or a missing field`: an entry with slug `"Bad Slug"` or without `name` is dropped, the others kept.
  - `reads synopsis and genre from JSON-LD`: `parseGamePage(wordle)` equals `{ synopsis: "Guess a 5-letter word in 6 tries. Each guess reveals which letters are correct, in the word but misplaced, or absent.", category: "Words" }`.
  - `decodes entities in the meta description`: `parseGamePage(metaOnly)` equals `{ synopsis: "Pick the fan's favourite & win", category: null }`.
  - `returns nulls for an unknown page`: `parseGamePage("<html></html>")` equals `{ synopsis: null, category: null }`.

- [x] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run src/dles/catalog.test.ts`
Expected: FAIL, module `./catalog` not found.

- [x] **Step 4: Implement `src/dles/catalog.ts`.**
  - `parseCatalog`: collect every `self.__next_f.push(` argument with a regex, `JSON.parse` each array, keep the string at index 1, join them. Find `"allGames":[`, then scan to the matching `]` counting brackets outside string literals (track `"` and backslash escapes), and `JSON.parse` that slice. Any exception returns `[]`. Keep entries whose `slug` matches `^[a-z0-9-]+$`, whose `name` is a non-empty string after `trim()`, and whose `url` passes `isValidGameUrl`; dedupe on `gameUrlKey(url)`, first wins.
  - `parseGamePage`: for each `application/ld+json` script, `JSON.parse` it (skip failures) and use the first object with `"@type": "SoftwareApplication"`: `description` and `genre`, trimmed, empty becomes `null`. Without one, fall back to `<meta name="description" content="...">` for the synopsis, decoding `&amp; &quot; &#39; &#x27; &lt; &gt;`.

- [x] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/dles/catalog.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/dles
git commit -m "feat: parse the dles.gg catalog and game pages"
```

### Task 2: Rust fetch commands

**Files:**
- Create: `src-tauri/src/dles.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/ui.json`
- Create: `src/dles/client.ts`

**Interfaces:**
- Produces (Rust): `#[tauri::command] pub async fn dles_catalog(client: tauri::State<'_, DlesClient>) -> Result<String, String>` and `#[tauri::command] pub async fn dles_game_page(client: tauri::State<'_, DlesClient>, slug: String) -> Result<String, String>`. A non-2xx status, a timeout, a body over the cap or an invalid slug are `Err`.
- Produces (TS, `src/dles/client.ts`): `export const fetchCatalogHtml = (): Promise<string>` (invokes `dles_catalog`) and `export const fetchGamePageHtml = (slug: string): Promise<string>` (invokes `dles_game_page` with `{ slug }`).

- [x] **Step 1: Add the dependency.** In `src-tauri/Cargo.toml`: `reqwest = { version = "0.13", default-features = false, features = ["rustls", "charset"] }`. Run `cargo tree -i reqwest` from `src-tauri` and check there is still a single `reqwest` 0.13 in the tree.

- [x] **Step 2: Write the failing Rust tests** in `src-tauri/src/dles.rs` (`#[cfg(test)] mod tests`):
  - `valid_slugs`: `is_valid_slug("wordle")`, `is_valid_slug("nyt-connections")`, `is_valid_slug("2048-daily")` are true; `""`, `"Wordle"`, `"../x"`, `"a/b"`, `"a b"`, `"a?b"` are false.
  - `game_page_url_builds_from_slug`: `game_page_url("wordle") == Some("https://dles.gg/game/wordle".to_string())`, `game_page_url("../x") == None`.
  - `push_capped_refuses_past_the_cap`: with `cap = 4`, pushing `b"abc"` then `b"d"` is `Ok`, pushing one more byte is `Err`.

- [x] **Step 3: Run them to verify they fail**

Run: `(cd src-tauri && cargo test dles)`
Expected: compile error, functions not defined.

- [x] **Step 4: Implement `src-tauri/src/dles.rs`.**
  - Constants: `CATALOG_URL = "https://dles.gg/"`, `MAX_BYTES = 5 * 1024 * 1024`, `TIMEOUT = Duration::from_secs(10)`, `USER_AGENT = concat!("DesktopDles/", env!("CARGO_PKG_VERSION"), " (+https://github.com/ludovic-noirault/desktop-dles)")`.
  - `pub fn is_valid_slug(slug: &str) -> bool`, `pub fn game_page_url(slug: &str) -> Option<String>`, `fn push_capped(buf: &mut Vec<u8>, chunk: &[u8], cap: usize) -> Result<(), String>`.
  - `pub struct DlesClient(reqwest::Client)` built once with the user agent and timeout, managed in `lib.rs`.
  - `async fn get_text(client: &reqwest::Client, url: &str) -> Result<String, String>`: `error_for_status`, read with `response.chunk().await` through `push_capped`, then `String::from_utf8_lossy`.
  - Register both commands in `generate_handler!`, add `"dles_catalog"` and `"dles_game_page"` to the app manifest list in `build.rs`, and `"allow-dles-catalog"`, `"allow-dles-game-page"` to `capabilities/ui.json`.

- [x] **Step 5: Write `src/dles/client.ts`** with the two `invoke` wrappers from Interfaces.

- [x] **Step 6: Run the gates**

Run: `(cd src-tauri && cargo test && cargo clippy -- -D warnings) && pnpm lint && pnpm build && ! grep -rqE '"(windows|remote)"' src-tauri/capabilities`
Expected: all pass.

- [x] **Step 7: Check against the live site once.** Run `pnpm tauri dev`, then in the `ui` webview devtools console: `await window.__TAURI_INTERNALS__.invoke("dles_catalog").then(h => h.length)` returns a number above 100000, and `invoke("dles_game_page", { slug: "wordle" })` returns HTML containing `SoftwareApplication`. `invoke("dles_game_page", { slug: "../x" })` rejects.

- [x] **Step 8: Commit**

```bash
git add src-tauri src/dles/client.ts
git commit -m "feat: fetch dles.gg pages from Rust"
```

### Task 3: Storage for the pick, synopses and sidebar width

**Files:**
- Create: `src-tauri/migrations/003_daily_pick.sql`, `src/storage/pickRepo.ts`, `src/storage/pickRepo.test.ts`
- Modify: `src-tauri/src/lib.rs` (migration 3), `src/storage/testDb.ts`, `src/storage/gamesRepo.ts`, `src/storage/gamesRepo.test.ts`

**Interfaces:**
- Consumes: `CatalogGame`, `GameInfo` from Task 1.
- Produces (`src/storage/pickRepo.ts`):
  - `export type PickStatus = "shown" | "added";`
  - `export type StoredPick = CatalogGame & GameInfo & { day: string; status: PickStatus };`
  - `getPick(db: Db, day: string): Promise<StoredPick | null>`
  - `savePick(db: Db, pick: StoredPick): Promise<void>` (replaces the day's row)
  - `markPickAdded(db: Db, day: string): Promise<void>`
  - `clearPick(db: Db, day: string): Promise<void>`
  - `addSkip(db: Db, day: string, slug: string): Promise<void>`, `listSkips(db: Db, day: string): Promise<Set<string>>`
  - `listInfo(db: Db): Promise<Map<string, GameInfo>>` keyed by URL key
  - `saveInfo(db: Db, urlKey: string, slug: string, info: GameInfo, day: string): Promise<void>` (replaces)
- Produces (`src/storage/gamesRepo.ts`): `getSidebarWidth(db: Db): Promise<number | null>`, `setSidebarWidth(db: Db, width: number): Promise<void>`.

- [x] **Step 1: Write the migration.**

```sql
CREATE TABLE daily_pick (
  day TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT,
  synopsis TEXT,
  status TEXT NOT NULL CHECK (status IN ('shown', 'added'))
);

CREATE TABLE daily_pick_skip (
  day TEXT NOT NULL,
  slug TEXT NOT NULL,
  PRIMARY KEY (day, slug)
);

CREATE TABLE dles_info (
  url_key TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  synopsis TEXT,
  category TEXT,
  fetched_day TEXT NOT NULL
);
```

Register it as version 3, `"daily_pick"`, in `lib.rs`, and add the file to the list in `testDb.ts`.

- [x] **Step 2: Write the failing tests.** In `pickRepo.test.ts`: `savePick` then `getPick` round-trips every field, `null` synopsis and category included; `getPick` of another day is `null`; a second `savePick` for the same day replaces the first; `markPickAdded` sets `status` to `"added"`; `clearPick` removes the row; `listSkips` returns only the given day's slugs and `addSkip` twice with the same slug does not throw; `saveInfo` then `listInfo` returns the info under its key, and a second `saveInfo` replaces it. In `gamesRepo.test.ts`: `getSidebarWidth` is `null` on a fresh database, `setSidebarWidth(db, 300)` then `getSidebarWidth` is `300`, and setting again to `260` gives `260`.

- [x] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run src/storage`
Expected: FAIL, `pickRepo` not found and `getSidebarWidth` not exported.

- [x] **Step 4: Implement** `pickRepo.ts` and the two settings functions. Use `INSERT OR REPLACE` for `savePick` and `saveInfo`, `INSERT OR IGNORE` for `addSkip`, and `INSERT INTO settings (key, value) VALUES ('sidebar_width', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value` for the width (it runs under both sqlx and `node:sqlite`).

- [x] **Step 5: Run the tests and the Rust build**

Run: `pnpm vitest run src/storage && (cd src-tauri && cargo test)`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src-tauri/migrations src-tauri/src/lib.rs src/storage
git commit -m "feat: store the daily pick, synopses and sidebar width"
```

### Task 4: Pick logic and the day's flow

**Files:**
- Create: `src/dles/pick.ts`, `src/dles/pick.test.ts`, `src/dles/dailyPick.ts`, `src/dles/dailyPick.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `gameUrlKey`, `parseCatalog`, `parseGamePage`; Task 3 repo; `addGame` from `src/storage/gamesRepo.ts`; `Game` from `src/routine/types.ts`.
- Produces (`src/dles/pick.ts`, pure):
  - `drawPick(catalog: CatalogGame[], routine: Game[], skipped: ReadonlySet<string>, rng: () => number = Math.random): CatalogGame | null`: uniform over entries whose URL key is not a routine game's key and whose slug is not skipped.
  - `visiblePick(pick: StoredPick | null, routine: Game[]): StoredPick | null`: `null` when absent, `status === "added"`, or its URL key matches a routine game.
  - `synopsisTargets(routine: Game[], catalog: CatalogGame[], known: ReadonlyMap<string, GameInfo>): CatalogGame[]`: catalog entries matching routine games, in routine order, whose key is not in `known`.
- Produces (`src/dles/dailyPick.ts`):
  - `export type DlesDeps = { db: Db; fetchCatalog(): Promise<string>; fetchGamePage(slug: string): Promise<string>; rng?: () => number };`
  - `export function createDailyPick(deps: DlesDeps): { load(day: string, routine: Game[]): Promise<StoredPick | null>; another(day: string, routine: Game[]): Promise<StoredPick | null>; add(day: string): Promise<void>; fillSynopses(routine: Game[], day: string): Promise<Map<string, GameInfo>> }`

- [x] **Step 1: Write the failing tests for `pick.ts`**: `drawPick` never returns a game whose key matches a routine game (routine holds `https://www.nytimes.com/games/wordle`, catalog holds Wordle's `/index.html` URL and Globle: always Globle, for `rng` returning 0 and 0.999); a skipped slug is never drawn; returns `null` when nothing is eligible; with `rng = () => 0.5` over three eligible entries it returns the second. `a pick already in the routine is not visible`: `visiblePick` is `null` when the routine holds a game with the pick's URL key, also `null` for `status: "added"`, and returns the pick otherwise. `synopsisTargets` returns routine-matched entries in routine order and drops keys present in `known`.

- [x] **Step 2: Write the failing tests for `dailyPick.ts`**, with `createTestDb()` and fake fetchers that count calls and return the Task 1 fixtures:
  - `load draws, fetches the page and stores the pick`: on an empty day, `load` returns a pick with `category: "Words"` and the synopsis (rng picking Wordle), `getPick` holds it with `status: "shown"`, `listInfo` holds its key.
  - `load reuses the stored pick without network`: second `createDailyPick` with fetchers that throw, same day: `load` returns the stored pick.
  - `load returns null when the catalog fails`: catalog fetcher rejects, nothing stored.
  - `a failed game page keeps the pick with name only and stores no info`: page fetcher rejects: the pick is returned and stored with `synopsis: null, category: null`, and `listInfo` has no entry for it.
  - `concurrent loads of one day draw once and fetch the catalog once`: `Promise.all([load(d, r), load(d, r)])` on one instance resolves twice to the same slug, catalog fetcher called once.
  - `another skips the current pick and draws a new one`: after `load`, `another` returns a different slug, `listSkips` holds the first.
  - `another keeps the pick when the catalog cannot be loaded`: fresh instance (catalog not in memory) whose catalog fetcher rejects: `another` returns the current pick, `listSkips` is empty.
  - `another clears the day when nothing is left`: catalog of one game: `another` returns `null` and `getPick` is `null`.
  - `add adds the game and marks the pick`: `add(day)` puts the pick at the end of `listGames` with today as added day and `getPick(day).status === "added"`.
  - `a new day draws again and ignores yesterday's skips`: skip Globle on day 1, then `load(day2)` can draw Globle (rng chosen so it does).
  - `fillSynopses fetches missing routine games one at a time and stores parsed results`: routine with Wordle and a game not on dles.gg: one page request (`wordle`), result stored; a second call makes no request; a page that rejects stores nothing.

- [x] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run src/dles`
Expected: FAIL, modules not found.

- [x] **Step 4: Implement `pick.ts`**, then `dailyPick.ts`. The instance keeps the parsed catalog in memory per day (a `{ day, promise }` cache, so concurrent callers share one request and a new day refetches) and one in-flight `load` promise per day. `another`: load the catalog first; on failure return the current pick unchanged; otherwise `addSkip`, draw, fetch the page (failure keeps `null` info), `savePick`, or `clearPick` and return `null` when nothing is eligible. Every completed page parse goes through `saveInfo`, with or without synopsis; a rejected fetch saves nothing.

- [x] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/dles`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/dles
git commit -m "feat: draw and keep the daily pick"
```

### Task 5: Icon buttons

**Files:**
- Create: `src/app/IconButton.tsx`
- Modify: `package.json`, `pnpm-lock.yaml`, `src/pages/RoutinePage.tsx`, `src/pages/SettingsPage.tsx`, `src/strings.ts`, `src/styles.css`

**Interfaces:**
- Produces: `export function IconButton(props: { label: string; icon: LucideIcon } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "title">): JSX.Element`, rendering `<button type="button" aria-label={label} title={label}>` with `<Icon aria-hidden size={16} />`. Forwards `ref`.

- [x] **Step 1: Load the `design` skill**, then `pnpm add lucide-react`.

- [x] **Step 2: Implement `IconButton`** and swap the buttons with the mapping of the spec: game panel Reload (`RotateCw`), Reload without blocking (`ShieldOff`), Ignore (`SkipForward`), Finished (`Check`, keeps `className="primary"` and `aria-pressed`); Settings Edit (`Pencil`, label `strings.settings.editGame(name)`), Remove (`Trash2`), Import (`LogIn`), Export (`LogOut`), Add (`Plus`, the submit button of the add form: `type="submit"` passes through). Sidebar state icons become `Circle`, `CircleCheck`, `CircleMinus` in place of `STATE_ICON`; the `sr-only` status text stays. Leave the up and down arrows: Task 6 removes them.

- [x] **Step 3: Check the hover label above the game page.** `pnpm tauri dev`, open a game, hover Reload in the panel header for two seconds. If the native tooltip shows over the game page, done. If it is hidden or clipped, add a `HeaderTooltip` drawn in HTML inside `.panel-header`, to the left of the hovered or focused button, and use it for the four panel buttons only. Record which case held in the commit message body.

- [x] **Step 4: Run the gates**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src
git commit -m "feat: replace button text with icons"
```

### Task 6: Drag to reorder in Settings

**Files:**
- Create: `src/app/dragOrder.ts`, `src/app/dragOrder.test.ts`
- Modify: `src/routine/routine.ts`, `src/routine/routine.test.ts`, `src/pages/SettingsPage.tsx`, `src/strings.ts`, `src/styles.css`

**Interfaces:**
- Produces: `moveGameTo(games: Game[], from: number, to: number): Game[]` in `src/routine/routine.ts` (sorted by position, positions renumbered from 0; out-of-range indexes return the list unchanged), replacing `moveGame` and its tests. `dropIndex(midpoints: number[], y: number): number` in `src/app/dragOrder.ts`: the index the dragged row lands on, given each row's vertical midpoint captured at drag start (rows other than the dragged one included as is).

- [x] **Step 1: Write the failing tests**: `moveGameTo` from 3 to 0 on four games gives the order `[d, a, b, c]` with positions `0..3`; from 0 to 3 gives `[b, c, d, a]`; `from === to` and `to` out of range return the same order. `dropIndex([10, 30, 50, 70], 5)` is 0, `(…, 35)` is 1, `(…, 69)` is 3, `(…, 200)` is 3.

- [x] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/routine src/app`
Expected: FAIL.

- [x] **Step 3: Implement both, remove `moveGame`.**

- [x] **Step 4: Build the handle in `SettingsPage.tsx`** (load the `design` skill first). A `GripVertical` button on the left of each row, `aria-label={strings.settings.reorder(name)}` (`"Move ${name}"`), no up and down arrows. `pointerdown`: `setPointerCapture`, record row midpoints; `pointermove`: compute `dropIndex`, show a drop marker; `pointerup`: if the index changed, `write((db) => saveOrder(db, moveGameTo(games, from, to)))`. `keydown` ArrowUp / ArrowDown: move by one with the same `write`, then focus the moved game's handle again (refs by game id, as `editButtons`). Disabled while `busy`.

- [x] **Step 5: Run the gates and try it.** `pnpm test && pnpm lint && pnpm build`, then `pnpm tauri dev`: drag the last game to the top; the routine sidebar shows the new order. Focus a handle, ArrowDown: the game moves one place and the handle keeps focus.

- [x] **Step 6: Commit**

```bash
git add src
git commit -m "feat: reorder games by dragging a handle"
```

### Task 7: Resizable sidebar

**Files:**
- Create: `src/app/sidebarWidth.ts`, `src/app/sidebarWidth.test.ts`, `src/app/SidebarResizer.tsx`
- Modify: `src/app/RoutineProvider.tsx`, `src/pages/RoutinePage.tsx`, `src/strings.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `getSidebarWidth`, `setSidebarWidth` from Task 3.
- Produces: `DEFAULT_SIDEBAR_WIDTH = 220`, `MIN_SIDEBAR_WIDTH = 180`, `clampSidebarWidth(width: number, windowWidth: number): number` (between 180 and `Math.max(180, Math.floor(windowWidth / 2))`). Routine context gains `sidebarWidth: number` (stored value or default, loaded in `loadAll`) and `saveSidebarWidth(width: number): Promise<void>`.

- [x] **Step 1: Write the failing tests**: `clampSidebarWidth(100, 1200)` is 180, `(400, 1200)` is 400, `(900, 1200)` is 600, `(300, 300)` is 180.

- [x] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/app/sidebarWidth.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement `sidebarWidth.ts`**, then the context fields.

- [x] **Step 4: Build `SidebarResizer`** (load the `design` skill first): a thin `role="separator"` `aria-orientation="vertical"` element on the aside's right edge, `aria-label={strings.aside.resize}`, with `aria-valuenow`. `pointerdown` + `setPointerCapture`; `pointermove` sets the aside width through `clampSidebarWidth(x, window.innerWidth)`; `pointerup` saves it; `dblclick` sets and saves 220. The aside renders its width clamped against the current `window.innerWidth`, so a narrower window never leaves a sidebar wider than half of it. The panel's existing `ResizeObserver` moves the game webview.

- [x] **Step 5: Check the drag over the game page.** `pnpm tauri dev`: drag the border fast to the right across the game page and back. If the drag stops when the pointer enters the game page, call `hideGames()` on `pointerdown` and `showGame` for the current game on `pointerup`. If the game page lags visibly behind the border, wrap the `setGameBounds` call of the `ResizeObserver` in `requestAnimationFrame` so it runs at most once per frame. Record what held in the commit message body.

- [x] **Step 6: Run the gates**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src
git commit -m "feat: resize the sidebar"
```

### Task 8: Pick card and synopsis bubble

**Files:**
- Create: `src/dles/useDailyPick.ts`, `src/dles/PickCard.tsx`, `src/dles/SynopsisBubble.tsx`
- Modify: `src/pages/RoutinePage.tsx`, `src/strings.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `createDailyPick`, `visiblePick` (Task 4), `fetchCatalogHtml`, `fetchGamePageHtml` (Task 2), `getDb`, `refresh` and `state.day` from `useRoutine()`, `IconButton` (Task 5), `gameUrlKey` (Task 1).
- Produces: `useDailyPick(): { pick: StoredPick | null; info: ReadonlyMap<string, GameInfo>; busy: boolean; add(): Promise<void>; another(): Promise<void> }`. Strings: `strings.pick = { title: "Pick of the day", add: "Add to routine", another: "Another one", source: "From dles.gg" }`.

- [x] **Step 1: Write `useDailyPick`** (load the `design` skill first). One `createDailyPick` instance per app session, created at module level with the real fetchers and `await getDb()`. On mount and whenever `state.day` changes: `load(day, games)`, then `fillSynopses(games, day)`, merging results into `info` as they arrive. Errors are logged and leave the card hidden. `add` calls `add(day)` then `refresh()`. `another` sets `busy` while it runs. The returned `pick` goes through `visiblePick(pick, games)`.

- [x] **Step 2: Build `PickCard`**: placed in the aside between the `<ol>` and the `<footer>`, pushed down with `margin-top: auto`. Label with a sparkle, name, category (omitted when `null`), `IconButton` `Plus` (primary) and `Shuffle`, both disabled while `busy`. Not clickable itself.

- [x] **Step 3: Build `SynopsisBubble`**: `role="tooltip"`, absolutely positioned inside the aside (the aside gets `position: relative`), spanning the aside's inner width; under the hovered row, or right above the card for the pick. Name, synopsis, `strings.pick.source`. Shown on `mouseenter` and `focus` of a routine row button (or of focus within the card), hidden on `mouseleave` and `blur`; the row button gets `aria-describedby` while it shows. No bubble when the synopsis is `null`. Routine rows look up `info.get(gameUrlKey(g.url))`.

- [x] **Step 4: Run the gates**

Run: `pnpm test && pnpm lint && pnpm build && (cd src-tauri && cargo clippy -- -D warnings)`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src
git commit -m "feat: show the pick of the day and hover synopses"
```

### Task 9: Manual check on macOS and docs

**Files:**
- Modify: `AGENTS.md` (one line under "Decisions to follow"), this plan (checkboxes)

- [x] **Step 1: Add to `AGENTS.md`**, under "Decisions to follow, not re-derive": `- dles.gg is read only through the `dles_catalog` and `dles_game_page` Rust commands, which build the URLs themselves. The UI never sends a URL to fetch.`

- [ ] **Step 2: Run the spec's manual check**, `docs/superpowers/specs/2026-11-06-daily-pick-design.md` § Manual check, items 1 to 12, on macOS with `pnpm tauri dev`. Write any failure down as a new task here before fixing it.

- [x] **Step 3: Run every gate of `docs/agents/verify.md`.**

- [x] **Step 4: Commit**

```bash
git add AGENTS.md docs/superpowers/plans/2026-11-06-daily-pick.md
git commit -m "docs: record daily pick progress"
```

### Task 10: Try the pick before adding it

Added after Ludo's first look at the build (spec § "Trying the pick", Goal 9, manual check 13).

**Files:**
- Modify: `src/games/gameViews.ts`, `src/dles/pick.ts`, `src/dles/pick.test.ts`, `src/dles/useDailyPick.ts`, `src/dles/PickCard.tsx`, `src/pages/RoutinePage.tsx`, `src/strings.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `showGame`, `closeGame`, `reloadGame`, `hideGames` (`src/games/gameViews.ts`); `useDailyPick()`; `gameUrlKey`; `useRoutine()` (`dispatch({ type: "select", index })`, `state.order`).
- Produces:
  - `export const PICK_VIEW_ID = 0;` in `src/games/gameViews.ts`, with a comment: SQLite `AUTOINCREMENT` ids start at 1, so `game-0` never collides with a routine game.
  - `indexOfGame(order: Game[], url: string): number` in `src/dles/pick.ts`: index of the first game whose URL key equals `gameUrlKey(url)`, `-1` when none or when the key is `null`.
  - `strings.pick.trying: "Pick of the day"` (header subtitle) and `strings.pick.tryLabel(name)`: `"Try ${name}"` (accessible name of the card's name button).

- [x] **Step 1: Write the failing tests** for `indexOfGame`: Wordle stored as `https://www.nytimes.com/games/wordle` is found for `https://www.nytimes.com/games/wordle/index.html?ref=dles.gg`; a URL not in the list gives `-1`; an `http://` URL gives `-1`; with two matches the first index wins.

- [x] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/dles/pick.test.ts`
Expected: FAIL, `indexOfGame` not exported.

- [x] **Step 3: Implement `indexOfGame` and `PICK_VIEW_ID`.**

- [x] **Step 4: Wire the trial** (load the `design` skill first).
  - `RoutinePage` holds `trying: boolean`. While `trying` and a visible pick exists, the panel effect shows `PICK_VIEW_ID` with the pick's URL instead of the current routine game; otherwise it shows the routine game as today.
  - The card's game name becomes a button (`aria-label={strings.pick.tryLabel(name)}`, `aria-pressed={trying}`) that sets `trying`. While trying, no routine row has `aria-current`, and the card has a selected style.
  - Header while trying: the pick's name with `strings.pick.trying` under it (no position counter), then Reload and Reload without blocking (`reloadGame(PICK_VIEW_ID, pick.url, …)`), Add to routine (`Plus`, primary) and Another one (`Shuffle`), sharing the card's `busy`.
  - Clicking a routine row sets `trying` to false and selects the row; `game-0` is hidden, not closed.
  - "Another one": `closeGame(PICK_VIEW_ID)` before the new pick is shown; `trying` stays true if a new pick exists, else becomes false.
  - "Add to routine": after the add and refresh, `closeGame(PICK_VIEW_ID)`, set `trying` false, and if the trial was open select `indexOfGame(state.order, pick.url)` so the added game becomes the current routine game.
  - Day change, or the pick becoming hidden for any reason: `closeGame(PICK_VIEW_ID)` and `trying` false.
  - Trying records nothing: no `answer`, no day status.

- [x] **Step 5: Run the gates**

Run: `pnpm test && pnpm lint && pnpm build && (cd src-tauri && cargo test && cargo clippy -- -D warnings)`
Expected: PASS, no new lint warning.

- [x] **Step 6: Commit**

```bash
git add src docs/superpowers/plans/2026-11-06-daily-pick.md
git commit -m "feat: try the pick of the day before adding it"
```

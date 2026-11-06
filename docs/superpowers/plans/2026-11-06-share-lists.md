# Share Game Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export some or all games to a JSON file and import a friend's file into the routine, from two popups in Settings › My games.

**Architecture:** A pure TypeScript module (`src/sharing/gamesFile.ts`) builds, reads and classifies the file; `gamesRepo` gains a bulk add. Import reads the dropped or picked `File` in JavaScript, which works once the `ui` webview's native drag-and-drop handler is disabled. Export goes through one Rust command that opens the native save dialog itself and writes the file, so the UI never sends a path.

**Tech Stack:** Tauri 2.12.5, `tauri-plugin-dialog` 2 (Rust API only), React + TypeScript, Vitest with `node:sqlite`, Biome.

**Spec:** `docs/superpowers/specs/2026-11-06-share-lists-design.md`

## Global Constraints

- Import only adds games. It never changes, removes or reorders an existing game.
- No game whose URL fails `isValidGameUrl` (`src/routine/routine.ts`) reaches the database through an import.
- Capability target stays `"webviews": ["ui"]`. The only new permission is `allow-export-games`. No dialog or fs plugin permission is granted to JavaScript.
- The UI never sends a file path to Rust.
- File format: `{"format": "desktop-dles/games", "version": 1, "games": [{"name", "url"}]}`, two-space indent, trailing newline. Default name `desktop-dles-games.json`. Files over 1 MB are refused.
- "Already in your list" means `new URL(url).href` equal to that of a game not removed from the routine.
- Both popups live in Settings and are modal `<dialog>` elements opened with `showModal()`. Escape and Cancel close them; focus goes back to the button that opened them.
- UI copy is English and lives in `src/strings.ts`. Load the `design` skill before editing `.tsx` or `.css`.
- Check every Rust signature against the locked versions (`~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/` or docs.rs). Read on 2026-11-06: `WebviewBuilder::disable_drag_drop_handler()` exists in tauri 2.12.5 and is documented as required for HTML5 drag and drop on Windows; `tauri_plugin_dialog` exposes `app.dialog().file().set_file_name(..).add_filter(..).blocking_save_file() -> Option<FilePath>` and `FilePath::into_path() -> Result<PathBuf>`.
- Gates: `pnpm test && pnpm lint && pnpm build` and `(cd src-tauri && cargo test && cargo clippy -- -D warnings)`.
- Conventional commits, no tool attribution. Branch `feat/share-lists` (spec already committed).

## Review Focus

1. **A file re-saved by a Windows editor** starts with a UTF-8 BOM, which `JSON.parse` rejects. It must import like the original. Test `parses a file that starts with a byte order mark` in Task 1.
2. **A round trip with awkward names** (quotes, accents, emoji): export then import must give back the same names and classify every entry as present. Test `round trip keeps names and marks every game present` in Task 1.
3. **A new user with an empty list** importing a friend's file: every valid entry is new. Test `every valid entry is new against an empty list` in Task 1.
4. **Hand-edited URLs** with spaces around them or a different host case: they are trimmed and still match the existing game. Test `trimmed URL with another host case is present` in Task 1.
5. **A file dropped outside the drop zone, or text dragged instead of a file**: the `ui` webview must not navigate away and the popup must not break. No unit test reaches the webview; manual check step 7 in Task 5.

---

### Task 1: File logic and bulk add

**Files:**
- Create: `src/sharing/gamesFile.ts`
- Create: `src/sharing/gamesFile.test.ts`
- Modify: `src/storage/gamesRepo.ts`
- Modify: `src/storage/gamesRepo.test.ts`

**Interfaces:**
- Consumes: `Game` from `src/routine/types.ts`, `isValidGameUrl` from `src/routine/routine.ts`, `addGame` from `src/storage/gamesRepo.ts`.
- Produces (in `src/sharing/gamesFile.ts`, no Tauri import):
  - `export const DEFAULT_FILE_NAME = "desktop-dles-games.json";`
  - `export const MAX_FILE_BYTES = 1_000_000;`
  - `export type SharedGame = { name: string; url: string };`
  - `export type ReadError = "notGamesFile" | "newerVersion" | "noGames";`
  - `export type ReadResult = { ok: true; entries: SharedGame[] } | { ok: false; error: ReadError };`
  - `export type EntryStatus = "new" | "present" | "invalid";`
  - `export type ClassifiedEntry = SharedGame & { status: EntryStatus };`
  - `export function buildGamesFile(games: SharedGame[]): string`
  - `export function parseGamesFile(text: string): ReadResult`
  - `export async function readGamesFile(file: Blob): Promise<ReadResult>`
  - `export function classifyEntries(entries: SharedGame[], current: SharedGame[]): ClassifiedEntry[]`
- Produces (in `src/storage/gamesRepo.ts`): `export async function addGames(db: Db, games: SharedGame[], today: string): Promise<void>`

- [x] **Step 1: Write the failing tests for `gamesFile.ts`**

```ts
const file = (games: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: "desktop-dles/games", version: 1, games, ...extra });

test("buildGamesFile writes the format, two-space indent and a trailing newline", () => {
  const text = buildGamesFile([{ name: "Wordle", url: "https://www.nytimes.com/games/wordle" }]);
  expect(text).toBe(
    '{\n  "format": "desktop-dles/games",\n  "version": 1,\n  "games": [\n    {\n      "name": "Wordle",\n      "url": "https://www.nytimes.com/games/wordle"\n    }\n  ]\n}\n',
  );
});

test("parseGamesFile keeps entries in file order and ignores unknown fields", () => {
  expect(parseGamesFile(file([
    { name: "B", url: "https://b.example", stars: 5 },
    { name: "A", url: "https://a.example" },
  ], { note: "hi" }))).toEqual({ ok: true, entries: [
    { name: "B", url: "https://b.example" },
    { name: "A", url: "https://a.example" },
  ] });
});

test("an entry with a missing or non-string field becomes empty strings, not a file error", () => {
  expect(parseGamesFile(file([{ url: "https://a.example" }, { name: "B", url: 3 }]))).toEqual({
    ok: true,
    entries: [{ name: "", url: "https://a.example" }, { name: "B", url: "" }],
  });
});

test.each([
  ["not JSON", "hello"],
  ["a JSON array", "[]"],
  ["no format", JSON.stringify({ version: 1, games: [] })],
  ["another format", file([], { format: "other" })],
  ["version as a string", file([], { version: "1" })],
  ["version zero", file([], { version: 0 })],
  ["games not an array", file({})],
])("parseGamesFile refuses %s as notGamesFile", (_, text) => {
  expect(parseGamesFile(text)).toEqual({ ok: false, error: "notGamesFile" });
});

test("a newer version is reported as such", () => {
  expect(parseGamesFile(file([], { version: 2 }))).toEqual({ ok: false, error: "newerVersion" });
});

test("a file with no games is noGames", () => {
  expect(parseGamesFile(file([]))).toEqual({ ok: false, error: "noGames" });
});

test("parses a file that starts with a byte order mark", () => {
  expect(parseGamesFile(`﻿${file([{ name: "A", url: "https://a.example" }])}`)).toMatchObject({ ok: true });
});

test("readGamesFile refuses a file over 1 MB before parsing", async () => {
  expect(await readGamesFile(new Blob(["x".repeat(1_000_001)]))).toEqual({ ok: false, error: "notGamesFile" });
});

test("readGamesFile reads a Blob", async () => {
  expect(await readGamesFile(new Blob([file([{ name: "A", url: "https://a.example" }])]))).toEqual({
    ok: true, entries: [{ name: "A", url: "https://a.example" }],
  });
});

test("classifyEntries marks new, present and invalid entries, trimmed", () => {
  const current = [{ name: "Scrandle", url: "https://scrandle.net" }];
  expect(classifyEntries([
    { name: " Framed ", url: " https://framed.wtf " },
    { name: "Other name", url: "https://scrandle.net/" },
    { name: "Old", url: "http://old.example" },
    { name: "  ", url: "https://noname.example" },
  ], current)).toEqual([
    { name: "Framed", url: "https://framed.wtf", status: "new" },
    { name: "Other name", url: "https://scrandle.net/", status: "present" },
    { name: "Old", url: "http://old.example", status: "invalid" },
    { name: "", url: "https://noname.example", status: "invalid" },
  ]);
});

test("trimmed URL with another host case is present", () => {
  expect(classifyEntries([{ name: "S", url: "  https://SCRANDLE.net  " }],
    [{ name: "Scrandle", url: "https://scrandle.net" }])[0].status).toBe("present");
});

test("a URL repeated in the same file is new once, then present", () => {
  expect(classifyEntries([
    { name: "A", url: "https://a.example" },
    { name: "A again", url: "https://a.example/" },
  ], []).map((e) => e.status)).toEqual(["new", "present"]);
});

test("every valid entry is new against an empty list", () => {
  expect(classifyEntries([
    { name: "A", url: "https://a.example" },
    { name: "B", url: "https://b.example" },
  ], []).map((e) => e.status)).toEqual(["new", "new"]);
});

test("round trip keeps names and marks every game present", () => {
  const games = [
    { name: 'Café "quiz" 🎯', url: "https://cafe.example/quiz?day=1" },
    { name: "Wordle", url: "https://www.nytimes.com/games/wordle" },
  ];
  const read = parseGamesFile(buildGamesFile(games));
  if (!read.ok) throw new Error("expected ok");
  expect(read.entries).toEqual(games);
  expect(classifyEntries(read.entries, games).map((e) => e.status)).toEqual(["present", "present"]);
});
```

- [x] **Step 2: Run them to see them fail**

Run: `pnpm test src/sharing`
Expected: FAIL, `gamesFile` cannot be resolved.

- [x] **Step 3: Implement `src/sharing/gamesFile.ts`**

`parseGamesFile` strips one leading `﻿`, catches `JSON.parse` errors as `notGamesFile`, and requires a plain object (not an array). It checks `format`, then `version` (`Number.isInteger`: `1` reads, `> 1` is `newerVersion`, anything else `notGamesFile`), then `games` as an array, then non-empty. Entries that are not objects, and fields that are not strings, become `""`. `classifyEntries` trims name and URL, marks `invalid` when the name is empty or `isValidGameUrl` fails, and compares `new URL(url).href` against a `Set` built from `current` that grows with each `new` entry. `buildGamesFile` writes only `name` and `url` per game.

- [x] **Step 4: Run them to see them pass**

Run: `pnpm test src/sharing`
Expected: PASS.

- [x] **Step 5: Write the failing test for `addGames` in `gamesRepo.test.ts`**

```ts
test("addGames appends in the given order with today as added day", async () => {
  await addGames(db, [
    { name: "Framed", url: "https://framed.wtf" },
    { name: "Connections", url: "https://www.nytimes.com/games/connections" },
  ], "2026-11-06");
  const games = await listGames(db);
  expect(games.slice(-2).map((g) => [g.name, g.position])).toEqual([["Framed", 4], ["Connections", 5]]);
  const lifetimes = await listLifetimes(db);
  expect(lifetimes.filter((l) => l.addedDay === "2026-11-06")).toHaveLength(2);
});
```

- [x] **Step 6: Run it, see it fail, implement `addGames`, run it again**

Run: `pnpm test src/storage`
Expected: FAIL, then PASS once `addGames` calls `addGame` once per game, in order, awaiting each (no transaction exists across calls, see `saveOrder`).

- [x] **Step 7: Gates and commit**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all green.

```bash
git add src/sharing src/storage/gamesRepo.ts src/storage/gamesRepo.test.ts
git commit -m "feat: read, write and classify shared game files"
```

### Task 2: Export command and HTML drag and drop in the `ui` webview

**Files:**
- Create: `src-tauri/src/sharing.rs`
- Create: `src/sharing/commands.ts`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/*.json` (the one file with `"identifier": "ui"`)
- Modify: `src/app/AppShell.tsx`

**Interfaces:**
- Consumes: `DEFAULT_FILE_NAME` (value only; Rust keeps its own constant with the same value).
- Produces:
  - Rust: `#[tauri::command] pub async fn export_games(app: tauri::AppHandle, contents: String) -> Result<bool, String>`. `Ok(true)` written, `Ok(false)` dialog cancelled, `Err(message)` on a write or path error.
  - TS (`src/sharing/commands.ts`): `export const exportGames = (contents: string): Promise<boolean> => invoke("export_games", { contents });`

- [x] **Step 1: Add the dialog plugin**

`tauri-plugin-dialog = "2"` under `[dependencies]` in `src-tauri/Cargo.toml`; `.plugin(tauri_plugin_dialog::init())` in `lib.rs` next to the other plugins. No JavaScript package, no capability entry for it.

- [x] **Step 2: Implement `export_games` in `src-tauri/src/sharing.rs`**

Async command, so it runs off the main thread and `blocking_save_file` is safe there. Dialog: `set_file_name("desktop-dles-games.json")`, `add_filter("JSON", &["json"])`. `None` returns `Ok(false)`. Otherwise `into_path()`, then `std::fs::write`; map both errors to `String` with `to_string()`. Register it in `generate_handler!`, add `"export_games"` to the app manifest in `build.rs`, and `"allow-export-games"` to the `ui` capability.

- [x] **Step 3: Disable the native drag-and-drop handler on `ui` only**

In `lib.rs`, chain `.disable_drag_drop_handler()` on the `WebviewBuilder::new("ui", …)`. Game webviews in `games.rs` are untouched. Comment why: HTML5 drop needs it on Windows, and the page then reads the `File` itself with no IPC.

- [x] **Step 4: Stop stray drops from navigating the `ui` webview**

In `AppShell.tsx`, one effect adds `dragover` and `drop` listeners on `window` that call `preventDefault()`, removed on unmount. A drop zone handles its own drop before the event reaches `window`.

- [x] **Step 5: Add `src/sharing/commands.ts`** with `exportGames` as in Interfaces.

- [x] **Step 6: Gates and commit**

Run: `(cd src-tauri && cargo test && cargo clippy -- -D warnings) && pnpm lint && pnpm build && ! grep -rqE '"(windows|remote)"' src-tauri/capabilities`
Expected: all green.

```bash
git add src-tauri src/sharing/commands.ts src/app/AppShell.tsx
git commit -m "feat: export command and HTML file drops in the ui webview"
```

### Task 3: Export popup

**Files:**
- Create: `src/sharing/ExportDialog.tsx`
- Modify: `src/pages/SettingsPage.tsx`, `src/strings.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `buildGamesFile` (Task 1), `exportGames` (Task 2), `useRoutine().games`.
- Produces: `export function ExportDialog(props: { games: Game[]; onClose: () => void }): JSX.Element`. The Settings page mounts it while open, passes its current `games`, and returns focus to its "Export…" button in `onClose`. Strings under `strings.share`, used by Task 4 too:

```ts
share: {
  import: "Import…",
  export: "Export…",
  exportTitle: "Export games",
  exportHint: "Pick the games to put in the file.",
  all: (n: number, total: number) => `All (${n} of ${total})`,
  saveFile: "Save file…",
  exportFailed: "Could not save the file.",
  cancel: "Cancel",
},
```

- [x] **Step 1: Load the `design` skill.**

- [x] **Step 2: Header buttons**

`SettingsPage` title row: `<h2>` then "Import…" and "Export…" buttons, as in mockup A (`.superpowers/brainstorm/22073-1793995248/content/export.html`, local only). "Export…" is disabled when the list is empty. "Import…" renders but does nothing until Task 4.

- [x] **Step 3: `ExportDialog`**

A `<dialog>` opened with `showModal()` on mount, `close` event calls `onClose`. State: a `Set<number>` of checked ids, every id at open. The "All" checkbox is checked when all are, `indeterminate` when some are, and toggles all. Rows in `games` order. "Save file…" is disabled at zero checked or while saving; it calls `exportGames(buildGamesFile(checked games in list order))`: `true` closes, `false` keeps the dialog as it is, a rejection shows `exportFailed` with `role="alert"` and keeps it open.

- [x] **Step 4: Gates and commit**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all green. Then `pnpm tauri dev`: Settings › Export… opens, unchecking updates "All (n of N)", Save writes a file.

```bash
git add src/sharing/ExportDialog.tsx src/pages/SettingsPage.tsx src/strings.ts src/styles.css
git commit -m "feat: export selected games to a file"
```

### Task 4: Import popup

**Files:**
- Create: `src/sharing/ImportDialog.tsx`
- Modify: `src/pages/SettingsPage.tsx`, `src/strings.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `readGamesFile`, `classifyEntries`, `ClassifiedEntry`, `ReadError` (Task 1); `addGames` (Task 1); `getDb`, `useRoutine().games`, `useRoutine().refresh`; `dayKey` from `src/routine/day.ts`.
- Produces: `export function ImportDialog(props: { games: Game[]; onClose: () => void }): JSX.Element`, mounted like `ExportDialog`, focus back to "Import…". Strings added under `strings.share`:

```ts
importTitle: "Import games",
importHint: "Drop a file a friend shared with you.",
dropHere: "Drop the .json file here",
chooseFile: "or choose a file…",
fromFile: (fileName: string, n: number) => `From ${fileName} · ${n} ${n === 1 ? "game" : "games"}`,
alreadyPresent: "Already in your list",
invalidEntry: "Invalid address",
addGames: (n: number) => `Add ${n} ${n === 1 ? "game" : "games"}`,
readErrors: {
  notGamesFile: "This is not a Desktop Dles games file.",
  newerVersion: "This file was made by a newer version of Desktop Dles. Update the app, then try again.",
  noGames: "This file has no games in it.",
},
importFailed: "Some games could not be added. Your list shows the ones that were.",
```

- [x] **Step 1: Load the `design` skill.**

- [x] **Step 2: Drop step**

`<dialog>` opened with `showModal()`, as in mockup A of `import.html`. A drop zone takes `dragover` (`preventDefault`, a hover class) and `drop` (`preventDefault`, `stopPropagation`, first item of `dataTransfer.files`; no file means nothing happens). "choose a file…" is a `<label>` around a visually hidden `<input type="file" accept=".json,application/json">`. Both paths call `readGamesFile`. A `ReadError` shows `readErrors[error]` with `role="alert"` above the drop zone, which stays usable.

- [x] **Step 3: Review step**

After a successful read, the drop zone is replaced by `fromFile(file.name, entries.length)` and one row per `classifyEntries(entries, games)` entry, in file order. `new` rows are checked by default; `present` and `invalid` rows are greyed, unchecked, disabled, with the `alreadyPresent` or `invalidEntry` tag. State is a `Set<number>` of checked row indexes.

- [x] **Step 4: Confirm**

"Add N games" is disabled at zero or while adding. It calls `addGames(await getDb(), checked rows in file order, dayKey(new Date()))`, then `refresh()`, then closes. On a rejection it calls `refresh()` anyway and shows `importFailed`, keeping the dialog open.

- [x] **Step 5: Gates and commit**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all green.

```bash
git add src/sharing/ImportDialog.tsx src/pages/SettingsPage.tsx src/strings.ts src/styles.css
git commit -m "feat: import games from a shared file"
```

### Task 5: Docs, pull request and manual check

**Files:**
- Modify: `README.md`

- [x] **Step 1: README**

One paragraph: Settings › My games › Export… saves the checked games to `desktop-dles-games.json`; Import… adds the games of such a file, skipping the ones already in the list. Run `pnpm lint`, commit `docs: describe sharing game lists`.

- [ ] **Step 2: Open the pull request** through the `open-pr` skill. Expected: every check green, `windows-check` included. A red check is fixed on the branch first.

- [ ] **Step 3: Manual check on macOS** with `pnpm tauri dev`:

1. Settings › Export…: all games checked, "All (N of N)". Uncheck one: "All (N-1 of N)". "Save file…", cancel the save dialog: the popup is still open with the same selection. Save for real: the file has the checked games only, in list order, and reads well in a text editor.
2. Import…, drop that same file: every game shows "Already in your list", "Add 0 games" is disabled.
3. Edit the file: add one new `https://` game, one `http://` game, one entry with no name. Import it with "choose a file…": the new game is checked, the other two are invalid. "Add 1 game": the popup closes, the game is at the bottom of My games and in the routine.
4. Drop a non-JSON file, then a JSON file without `format`: each shows its error, the popup stays open.
5. Escape closes each popup, focus is back on its button.
6. Save the exported file from TextEdit as UTF-8 and import it again: it reads.
7. Drop a file on the Settings page outside the popup, and on the Routine page: nothing happens, the page stays. Drag selected text onto the drop zone: nothing happens.
8. Drag a link (from a browser or Discord) onto the Settings page outside any input, and onto the Routine page: the app page stays (added after the final review: only file drops are prevented globally). Drag the same link onto the drop zone: "Save the file first, then drop it here."
9. Drag a URL from a browser into the "https://…" field of Settings: it is inserted.

- [ ] **Step 4: Manual check on Windows** on the released v0.6.0, steps 1 to 5 and 7. A failing drop is a `fix/*` follow-up; "choose a file…" covers it meanwhile (spec, Decided by Ludo).

- [ ] **Step 5: Record the results** under this step: date, platform, what failed.

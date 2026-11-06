# Share game lists design

Date: 2026-11-06. Status: approved by Ludo on 2026-11-06.

## Intent

Ludo and his friends each keep a routine of dles. When one of them finds a good game, the others have to
retype its name and URL by hand. They talk on a Discord channel, so the natural way to pass games around is
a file posted there.

This work lets Ludo export some or all of his games to a JSON file, and lets a friend drop that file into
the app to add the games to their own routine. Importing only ever adds games. It never removes, replaces,
renames or reorders what the friend already has.

It is backlog item 1 of `2026-11-03-mvp-design.md` ("Import the games list from a JSON or CSV file"), with
export added and CSV dropped. That spec's backlog is updated to point here. The daily recommendation
(backlog item 5) comes next, in its own brainstorm.

## Decided by Ludo

- Lists are shared as a JSON file posted on Discord (2026-11-06).
- Import adds games to the routine. It does not replace the list.
- Export: in Settings › My games, an "Export…" button opens a popup listing every game, all checked. Ludo
  unchecks the ones he keeps to himself, then "Save file…" opens the system save dialog (mockup A).
- Import: an "Import…" button opens a popup with a drop zone. Dropping the file, or picking it with a
  "choose a file…" link, replaces the drop zone with the file's games, each with a checkbox. Games already in
  the list stay visible, greyed out, not checkable, marked "Already in your list". "Add N games" confirms
  (mockup A).
- Windows drag and drop is not tried before merge, as with content blocking: no branch installer. A drop
  that fails on Windows is found after the release, and "choose a file…" stays the way in until a fix
  (2026-11-06).
- Agreed after it was proposed (2026-11-06):
  - The file holds each game's name and URL, plus a format marker and version. Nothing else: no day
    states, no streaks, no list order beyond the order of the entries, no shuffle setting.
  - A game counts as already present when its URL matches a game in the list, whatever its name.
  - Imported games go to the end of the list and count as added today, so their streaks start today, as
    with a game added by hand.
  - A game in the file whose URL does not start with `https://` is shown as refused and cannot be checked.
  - An unreadable file, or a file in another format, shows an error inside the popup. The popup stays open
    so another file can be dropped.
  - The default file name in the save dialog is `desktop-dles-games.json`.

## Goals

1. Settings › My games has "Import…" and "Export…" buttons next to its title.
2. Export: a modal popup lists the current games (not removed ones) in list order, all checked, with an
   "All" checkbox that shows "(n of N)". "Save file…" is disabled when nothing is checked. It opens the
   system save dialog with `desktop-dles-games.json` as the suggested name, writes the file, and closes the
   popup. Cancelling the save dialog leaves the popup open with its selection intact.
3. Import: a modal popup with a drop zone and a "choose a file…" link. After a file is read, the popup lists
   every entry of the file in file order:
   - new and valid: checked by default;
   - already in the list: greyed, unchecked, disabled, tag "Already in your list";
   - invalid (URL not `https://`, or empty name): greyed, unchecked, disabled, tag "Invalid address" or
     equivalent.
   The confirm button reads "Add N games" with N the checked count, and is disabled at zero. Confirming adds
   the checked games at the end of the list, in file order, with today as their added day, then closes the
   popup. The game list on the page shows them right away.
4. A file that is not valid JSON, not in this app's format, or empty of games shows an error message in the
   import popup. Dropping another file retries. A file written by a newer format version gets its own message
   ("made by a newer version of Desktop Dles").
5. A file exported by the app imports back into the same app with every game shown as "Already in your list".

## Non-goals

- CSV, or any format other than this app's JSON.
- Replacing the list, deleting or renaming games through an import.
- Sharing history, day states, streaks or settings (backlog item 4 covers history, separately).
- Sending the file anywhere: no Discord integration, no link sharing, no clipboard copy. The file goes on
  disk and Ludo posts it himself.
- Opening a `.json` file from Finder or Explorer into the app (file association). The drop zone and the file
  picker are the only ways in.
- Editing a game's name or URL in the import popup. Settings already does that after import.
- Import or export from the Routine page.

## Anti-goals

- An import that changes or removes anything already in the list.
- A game whose URL does not start with `https://` entering the database through an import. The import path
  uses the same validation as adding by hand (`isValidGameUrl` in `src/routine/routine.ts`).
- A popup that opens under a game webview. Game webviews are drawn above the `ui` webview, which is why both
  popups live on the Settings page, where `RoutinePage` has already hidden every game
  (`src/pages/RoutinePage.tsx:60`).
- Widening what the UI can reach on disk. No general file-system permission scoped to the whole disk or the
  home folder. See Constraints.
- Any change to the capability target (`"webviews": ["ui"]`) or to the other security invariants of
  `AGENTS.md`.

## File format

```json
{
  "format": "desktop-dles/games",
  "version": 1,
  "games": [
    { "name": "Wordle", "url": "https://www.nytimes.com/games/wordle" },
    { "name": "Scrandle", "url": "https://scrandle.net" }
  ]
}
```

- `format` must equal `"desktop-dles/games"`, otherwise the file is "not a Desktop Dles games file".
- `version` is an integer. `1` is read. A greater value gets the "newer version" message. Anything else is
  "not a Desktop Dles games file".
- `games` is an array of objects. Fields other than `name` and `url` are ignored, so a later version can add
  fields that version 1 skips. An entry where `name` or `url` is missing or not a string is shown as invalid,
  not a reason to reject the whole file.
- Export writes names and URLs as stored (already trimmed), pretty-printed with two-space indent and a
  trailing newline, so the file stays readable when someone opens it.

## Constraints

- Tauri 2.12. Check every Rust signature and plugin API on docs.rs or in `~/.cargo/registry` for the
  installed versions, never from memory.
- Dropping a file on the `ui` webview: the `ui` webview is built in `src-tauri/src/lib.rs:55` with Tauri's
  default drag-and-drop handler, which intercepts drops and emits a native event carrying file paths, so the
  page's HTML `drop` event does not get the file. Pick one of the two ways and check it on macOS and on
  Windows:
  - `WebviewBuilder::disable_drag_drop_handler()` on the `ui` webview, then read the dropped `File` in
    JavaScript. No file system access from the UI is needed. Check that nothing else relies on the native
    drag-drop event (nothing does today) and that HTML drag and drop then works in WebView2.
  - Keep the handler, listen to the native drag-drop event, and read the file in a Rust command.
  The first is preferred because it adds no IPC surface. Windows is only checked after the release (see
  Decided by Ludo), so the plan picks the approach from the WebView2 and Tauri docs, not from a Windows run.
- "choose a file…" uses an `<input type="file" accept=".json,application/json">`, which hands JavaScript a
  `File` without any Tauri permission. Check it opens the system picker in both webviews.
- Saving: the UI must not get a write permission on arbitrary paths. Preferred shape: one Rust command,
  `export_games(contents: String)`, that opens the native save dialog itself (through
  `tauri-plugin-dialog`'s Rust API, `rfd`, or whatever the dialog plugin exposes for 2.12) with the default
  name, and writes the file to the path the user picked. The UI never sends a path. The command gets its own
  `allow-export-games` permission in the `ui` capability, like the existing game commands. If the dialog
  plugin is added, its JavaScript permissions are not granted to the `ui` capability unless the plan shows
  they are needed.
- Storage: `addGame` in `src/storage/gamesRepo.ts` computes the next position per call and the SQL plugin has
  no transaction across calls (see `saveOrder`). Adding N games one `addGame` call after another, in file
  order, keeps them in order at the end. A failure midway leaves the games added so far; the popup then shows
  an error and the list reflects what was added.
- Pure logic (parsing a file, building a file from games, classifying entries against the current list) is
  written test-first under Vitest, in a module that does not import Tauri.
- UI copy in English, in `src/strings.ts`. `.tsx` and `.css` edits load the `design` skill first.
- Both popups are modal: focus moves into the popup on open, Escape and "Cancel" close it, focus returns to
  the button that opened it. A native `<dialog>` with `showModal()` gives most of this; check it in both
  webviews.

## Claude's calls (not Ludo's)

- Branch and PR name: `feat/share-lists`. Merging it releases a minor version (v0.6.0).
- URL comparison for "already in your list": both URLs go through `new URL(x).href` before comparing, so
  `https://scrandle.net` and `https://scrandle.net/` match, as do differences in host case. Paths, query
  strings and fragments otherwise compare exactly. Only games not removed from the routine count; a game
  removed earlier and imported again comes back as a new game.
- Two entries of the same file with the same URL: the first is treated as new, the next ones as "Already in
  your list".
- An entry's name is trimmed. An empty name makes the entry invalid.
- File size cap: a file over 1 MB is refused with the "not a Desktop Dles games file" message before parsing.
- The pure logic lives in `src/sharing/` (`gamesFile.ts` and its test), next to `src/routine/` and
  `src/storage/`.
- A file dropped anywhere else in the `ui` webview is ignored: it must not navigate the webview to the file.
- After a successful import, the popup closes with no separate confirmation message: the new games appear at
  the bottom of the list on the page behind it.

## Left to the builder

- The exact wording of the error messages and tags, in `src/strings.ts`.
- Component split between the two popups and the Settings page.
- Visual details of the drop zone (hover state while a file is dragged over it).
- Whether the export command writes with `std::fs` or through a plugin, as long as the UI never sends a path.

## Manual check (macOS, then Windows)

1. Settings › Export…: all games checked, "All (N of N)". Uncheck one: "(N-1 of N)". "Save file…", cancel
   the save dialog: the popup is still open with the same selection. Save for real: the file has the checked
   games only, in list order, and opens readable in a text editor.
2. Settings › Import…, drop that same file: every game shows "Already in your list", "Add 0 games" is
   disabled.
3. Edit the file by hand: add one new `https://` game, one `http://` game, and one entry with no name.
   Import it with "choose a file…": the new game is checked, the two others show as invalid. "Add 1 game":
   the popup closes and the game is at the bottom of My games, and in the routine.
4. Drop a non-JSON file, then a JSON file without `format`: each shows an error and the popup stays open.
5. Escape closes each popup and focus returns to its button.
6. On Windows, check that a drop on the drop zone works (drag and drop handling differs from macOS).

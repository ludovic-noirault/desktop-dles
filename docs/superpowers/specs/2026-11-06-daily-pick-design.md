# Daily pick design

Date: 2026-11-06. Status: approved by Ludo on 2026-11-06.

## Intent

Ludo's routine only grows when he hears about a game somewhere else. dles.gg lists more than a thousand
dles, and nothing in the app helps him discover them.

This work shows one game from dles.gg each day, the "pick of the day", in a card in the routine sidebar.
Ludo reads its synopsis and either adds it to his routine or asks for another one. The same synopsis
appears when he hovers a game of his routine, so he can remember what a game is about.

The sidebar also becomes resizable, so the bubble has room and a game that needs more width can get it.
Two smaller changes ride along in the same pull request: games are reordered in Settings by dragging a
handle instead of arrow buttons, and the app's buttons become icons, with their label on hover.

It is backlog item 5 of `2026-11-03-mvp-design.md` ("Daily recommendation"). That spec's backlog is
updated to point here. Merging it releases v0.7.0.

## Decided by Ludo

- The pick comes from the dles.gg catalog, read live by the app. dles.gg has no API and no data licence;
  its terms (https://dles.gg/terms) only forbid scraping "abusively". The app makes a handful of requests a
  day, which Ludo judged acceptable (2026-11-06).
- A new pick each day, whether or not Ludo acted on the previous one.
- The card has two actions: "Add to routine" and "Another one". "Another one" draws a new pick at once.
- A game skipped with "Another one" can come back on a later day.
- A game already in the routine is never picked.
- Ludo reads the synopsis on hover, and can also try the game before choosing (changed 2026-11-06, see
  "Trying the pick" below; the first version said he decides on the synopsis alone).
- The synopsis also shows on hover for the games of his routine.
- Layout: option C of the brainstorming mockups. The card sits at the bottom of the sidebar, between the
  routine list and the day counters. It shows the label "Pick of the day", the game's name, its category,
  and two buttons, "Add to routine" (primary) and "Another one". They are icon buttons, see below.
- Agreed after it was proposed (2026-11-06):
  - The pick is drawn from the whole catalog, every category, no filter.
  - A game removed from the routine can be picked again.
  - "Another one" has no daily limit. A game skipped today does not come back today.
  - An added game goes to the end of the routine and counts as added today, as with a game added by hand
    or imported. The card then disappears until tomorrow.
  - Without network, or when dles.gg does not answer, the card is absent and nothing else is affected.
  - A routine game that cannot be found on dles.gg has no synopsis.
  - Clicking a routine game keeps its current behaviour.
  - The card stays hidden while the pick loads. If loading fails, it stays hidden, with no error message,
    and the app tries again at the next launch.
  - The synopsis bubble says "From dles.gg". A game without a synopsis shows no bubble.
  - Hover synopsis only in the routine sidebar, not in Settings › My games.
  - Synopses are fetched once and kept locally. A game added later is fetched in turn. No periodic refresh.
- The game page is drawn above the app's interface, so the synopsis bubble stays inside the sidebar: as wide
  as the sidebar, right under the hovered row (right above the card for the pick). It may cover the rows
  below it while it shows. Option A of the second mockup screen (2026-11-06).
- The sidebar becomes resizable, in the same pull request. It gives the bubble room, and gives a game more
  room when it needs it (2026-11-06). Agreed after it was proposed:
  - Ludo drags the border between the sidebar and the game. The game page follows live.
  - The width is saved and restored at the next launch.
  - Minimum about 180px, maximum about half the window. A double-click on the border restores 220px.
- Same pull request, same release (2026-11-06):
  - Settings › My games: the up and down arrows are replaced by a drag handle on the left of each row.
    Dragging the row up or down reorders the games.
  - Icons replace the text of the app's action buttons. The label shows on hover.
  - Agreed after it was proposed:
    - Icon set: Lucide. Game panel: Reload (rotate-cw), Reload without blocking (shield-off), Ignore
      (skip-forward), Finished (check). Settings: Edit (pencil), Remove (trash-2), Import (log-in), Export
      (log-out), Add (plus), drag handle (grip-vertical). Sidebar states: to do (circle), finished
      (circle-check), ignored (circle-minus). Pick card: Add to routine (plus), Another one (shuffle).
    - Every icon button keeps an accessible name, as the arrows have today.
    - The handle works from the keyboard: focus it, then the up and down arrow keys move the game.
    - Buttons that confirm a choice keep their text: Save and Cancel when editing a game, the import and
      export popups, the startup screen, the update offer, Settings › Updates.

## Goals

1. On the Routine page, when a pick exists for today, a card appears at the bottom of the sidebar, above the
   counters, with the game's name, its category and the two buttons.
2. The pick is stable for the day: restarting the app shows the same pick, or no card if Ludo already added
   it. At local midnight (the same day boundary as `src/routine/day.ts`), a new pick is drawn.
3. "Another one" replaces the pick with another game of the catalog that is neither in the routine nor
   already skipped today. If no such game is left, the card disappears for the day.
4. "+ Add to routine" adds the game with its dles.gg name and URL at the end of the routine, with today as
   its added day, and the card disappears for the day. The new game shows in the sidebar right away, as a
   game still to do.
5. Hovering the card, or a game row of the routine that has a synopsis, shows a bubble with the game's name,
   its synopsis and "From dles.gg", drawn inside the sidebar, under the row (above the card for the pick).
   Keyboard focus on the row or on the card shows it too.
6. The border between the sidebar and the game panel can be dragged to resize the sidebar, within the
   limits above. The game page resizes with it, without reloading. The width survives a restart. A
   double-click on the border restores the default width.
7. Settings › My games: each row has a drag handle and no arrow buttons. Dragging a row by its handle and
   dropping it elsewhere saves the new order, which the routine uses. With the handle focused, the up and
   down arrow keys move the game one place and keep the focus on its handle.
8. The buttons listed in "Decided by Ludo" show their icon instead of their text. Hovering one shows its
   label. A screen reader announces the same label.
9. Clicking the card's game name opens the pick in the panel as described in "Trying the pick". The name
   is a button, reachable from the keyboard, and shows as selected while the trial is open.
10. Nothing on the page waits for dles.gg. The routine works the same with dles.gg down or slow.

- Trying the pick (2026-11-06, after the first build). Agreed after it was proposed:
  - Clicking the card (the game's name) opens the game in the right panel, like a routine game, with the same
    content blocking and the same shared session.
  - While trying, the card shows as selected and no routine row does. The panel header shows the game's name
    with "Pick of the day", and the buttons Reload, Add to routine and Another one in place of Ignore and
    Finished. Trying records nothing: no day state, no streak.
  - "Another one" while trying opens the new pick in the panel at once.
  - "Add to routine" while trying adds the game at the end of the routine; it stays open and becomes the
    current routine game.
  - Clicking a routine row hides the trial game without closing it, as with other games.
  - The trial page is closed when the game is skipped or when the day changes.
  - Leaving the Routine page (for Settings) closes the trial page and ends the trial, so a day change
    while Settings is open never reopens yesterday's pick (Claude's call, after review).

## Non-goals

- Filtering the pick by category, rating, or anything else.
- Remembering skipped games beyond the day, or a "never show again" action.
- Synopses in Settings, editing a synopsis, or a synopsis for games not on dles.gg.
- Any other data from dles.gg: rating, cover image, reviews, related games, "how to play".
- A history of past picks.
- Contacting dles.gg or using an official feed. If Peter (the site's owner) asks the app to stop, a
  `fix/*` release removes or changes the fetch.

## Anti-goals

- Load on dles.gg beyond what a person browsing would cause. At most one catalog request per app launch and
  per day, and one game-page request per game whose synopsis is missing, one at a time.
- A pick or a synopsis that delays the routine or blocks the first game from loading.
- Anything from dles.gg stored in the repository or shipped in the installer. The catalog and synopses live
  only in the user's local database.
- A new way for the `ui` webview to reach arbitrary URLs. See Constraints.
- Any change to the security invariants of `AGENTS.md`.

## What dles.gg exposes (observed 2026-11-06)

- `https://dles.gg/` (about 660 KB) embeds the full catalog in its React Server Components payload, in an
  `allGames` array of `{ id, name, url, slug }` objects. 1118 games on 2026-11-06. Example:
  `{"id":1,"name":"Wordle","url":"https://www.nytimes.com/games/wordle/index.html","slug":"wordle"}`.
  The payload is escaped inside `self.__next_f.push(...)` script calls.
- `https://dles.gg/game/<slug>` carries the synopsis in `<meta name="description" content="...">` (also in
  `og:description`), one or two sentences. Example for Wordle: "Guess a 5-letter word in 6 tries. Each guess
  reveals which letters are correct, in the word but misplaced, or absent." The same page lists the game's
  categories and has JSON-LD blocks (4 `application/ld+json` scripts on the Wordle page); the plan picks the
  most stable place to read the category from.
- `robots.txt` allows everything except `/api/`.
- The site is a Next.js app; its markup can change without notice. The parser must fail closed: no pick and
  no synopsis rather than wrong data.

## Constraints

- The `ui` webview cannot read dles.gg with `fetch`: dles.gg sends no CORS headers. The fetch happens in
  Rust, behind one or two Tauri commands, for example `dles_catalog()` and `dles_game_page(slug)`. The UI
  never sends a URL: the commands build `https://dles.gg/` and `https://dles.gg/game/<slug>` themselves, and
  reject a slug that does not match `^[a-z0-9-]+$`. Each command gets its own permission in the `ui`
  capability, like `allow-export-games`. The capability still targets `"webviews": ["ui"]` only.
- HTTP client: the plan picks one (`reqwest` with rustls, or `tauri-plugin-http` used from Rust only) and
  checks its API for the installed versions on docs.rs. The plugin's JavaScript permissions are not granted.
  Requests send a User-Agent naming the app and its repository, and time out after 10 seconds.
- Response size cap: 5 MB per response, refused beyond.
- Whether parsing happens in Rust or in TypeScript is the plan's call. What matters: the parser is pure and
  written test-first against saved fixtures of the two page types. Fixtures are trimmed to the parts the
  parser reads, so the repository does not carry a copy of dles.gg's content beyond a few entries.
- Game webviews are drawn above the `ui` webview (see `2026-11-06-share-lists-design.md`, Anti-goals), which
  is why the bubble stays inside the sidebar. No new webview or window for it.
- Resizing: the game panel already follows its element's size through a `ResizeObserver` that calls
  `setGameBounds` (`src/pages/RoutinePage.tsx:53`). The drag only changes the sidebar's width; the plan
  checks that the bounds updates keep up during a drag on macOS, and throttles them to one per animation
  frame if they do not. While dragging, the pointer moves over the game webview, which takes mouse events:
  the plan finds a way to keep the drag going (for example pointer capture on the handle) and checks it.
- The sidebar width is stored in the existing `settings` table, like `shuffle`.
- Icons: `lucide-react` as the one new frontend dependency, imported icon by icon so the bundle only carries
  the icons used. Icons are `aria-hidden`; the button carries the label through `aria-label`, from
  `src/strings.ts`.
- Hover labels: the label must show above the game page. Buttons in the game panel header sit right above
  the game webview. The plan first checks the native `title` tooltip on macOS. If it is drawn under the
  game webview, the label is drawn in HTML inside the header strip, to the left of the button. Labels in the
  sidebar and in Settings have no such problem.
- Drag to reorder: no drag-and-drop library. Pointer events on the handle, with pointer capture. Not HTML5
  drag and drop, since the `ui` webview's drop handling is reserved for file import (`AGENTS.md`). The order
  is saved once on drop through `saveOrder` (`src/storage/gamesRepo.ts`); `moveGame` in
  `src/routine/routine.ts` gives way to a pure "move from index to index" function written test-first.
- Every URL taken from dles.gg goes through `isValidGameUrl` (`src/routine/routine.ts`) before it can be
  picked. A catalog entry with a non-`https://` URL is skipped.
- Pure logic (catalog parsing, URL matching, drawing a pick, the pick's state for the day) is written
  test-first under Vitest, in modules that do not import Tauri. Storage follows `src/storage/` and its tests.
- Storage: a new migration, `003_daily_pick.sql`. SQL uses `?` placeholders.
- UI copy in English, in `src/strings.ts`. `.tsx` and `.css` edits load the `design` skill first.

## Claude's calls (not Ludo's)

- Branch and PR name: `feat/daily-pick`.
- Matching a game to the catalog ("already in the routine", "has a synopsis") compares a normalised URL:
  lower-case host with a leading `www.` removed, path with a trailing `/` and a trailing `/index.html`
  removed, query string and fragment ignored. So `https://www.nytimes.com/games/wordle` and
  `https://www.nytimes.com/games/wordle/index.html?ref=dles.gg` match. Only games not removed from the
  routine count as "in the routine".
- Storage shape (the plan may adjust names):
  - `daily_pick`: one row per day with the pick's slug, name, URL, category, synopsis, and its status
    (`shown` or `added`). "Another one" overwrites today's row.
  - `daily_pick_skip`: `(day, slug)` for games skipped today.
  - `dles_info`: synopsis and category keyed by normalised URL, with the slug and the day fetched. Filled
    for the pick and for routine games found in the catalog.
- The catalog itself is kept in memory for the session, not in the database. It is fetched at launch only
  when today's pick or a routine game's synopsis needs it, and again after midnight if the app stays open.
- The draw is uniform over the eligible games. A drawn game whose page has no readable synopsis is still a
  valid pick: the card shows without a bubble.
- The card shows the game's first category only.
- Synopsis fetches for routine games run after the pick is settled, one at a time, in list order.
- If two dles.gg entries normalise to the same URL, the first one wins.
- The card shows from today's `daily_pick` row alone. A launch offline on a day whose pick is already stored
  shows that pick; only a day with no stored pick needs dles.gg.
- "Another one" fetches the catalog (if not in memory) and the new game's page. While it runs, the current
  pick stays on the card and the button is disabled. If the catalog cannot be loaded, the current pick stays
  and is not marked skipped. If only the game page fails, the new pick is shown without category and without
  bubble. Never a silent second draw.
- A newly drawn game whose page cannot be fetched or parsed is a valid pick shown with its name only.
- Retry rule for synopses: `dles_info` stores every completed fetch, with or without a synopsis, and
  the day. A page fetched and parsed with no synopsis found is not requested again. A network error or a
  timeout stores nothing, so the game is tried again at the next launch. If dles.gg changes its markup, the
  `fix/*` release that updates the parser also clears the rows without synopsis in a migration.
- The trial webview reuses the game webview commands with the reserved id `0` (label `game-0`): SQLite
  `AUTOINCREMENT` ids start at 1, so it never collides with a routine game, and no new IPC command or
  permission is needed. Because `show_game` only shows an existing webview, the UI closes `game-0` before
  opening another pick, after an add, and on a day change.
- After "Add to routine" the game reopens as a routine game in its own webview, so its page loads once more.
  Its session (cookies, local storage) is the shared store, so a game in progress usually survives.
- The trial header also has "Reload without blocking", like a routine game's header, for a page the blocker
  breaks.
- An empty routine keeps today's empty state with no sidebar, so no card. The pick is for people who already
  have a routine.

## Left to the builder

- Exact wording of the labels, in `src/strings.ts`.
- Component split, and how the card reuses the sidebar's existing styles.
- Hover delay before the bubble shows.
- Look of the resize handle and its hover cursor; keyboard resizing on the handle if it comes cheap.
- Look of the row while dragged and of the drop position marker in Settings.
- Icon size and stroke width, within the existing button styles.
- Where the catalog and synopsis parsing runs, Rust or TypeScript, within the Constraints.

## Manual check (macOS)

1. Launch with network: the card appears at the bottom of the sidebar after a moment, with a name and a
   category. The first game of the routine loads without waiting for it.
2. Hover the card: the bubble shows the synopsis and "From dles.gg". Hover a routine game that is on dles.gg
   (Wordle): its synopsis shows. Hover one that is not: no bubble.
3. "Another one" several times: each pick differs, none is in the routine.
4. Restart: the same pick shows.
5. "+ Add to routine": the card disappears, the game is at the bottom of the routine as to do, and in
   Settings › My games. Restart: no card.
6. Change the machine's date to the next day (or wait for midnight): a new pick appears.
7. Launch offline on a day with no stored pick (for example after step 6): no card, no error, the routine
   works. Launch offline after a pick was stored today: the same pick shows.
8. Offline, click "Another one": the current pick stays.
9. Hover the last routine row and the card at the default width: the bubble stays inside the sidebar and is
   fully readable.
10. Drag the sidebar border wider, then narrower: the game page follows without reloading, the limits hold,
    the drag does not stop when the pointer crosses the game page. Restart: same width. Double-click the
    border: back to 220px.
11. Settings: drag a game by its handle from the bottom to the top. The new order shows in Settings and in
    the routine, and survives a restart. Focus a handle, press the down arrow: the game moves one place.
12. Every icon button of the game panel, the sidebar, the card and Settings shows its label on hover, and
    the label is not hidden under the game page.
13. Click the card's game name: the game opens in the panel, the card shows as selected, the header shows
    "Pick of the day" with Reload, Add to routine and Another one. "Another one": the new pick opens in
    the panel. Click a routine row, then the card again: the trial game is still where it was. "Add to
    routine": the game is the current routine game, the card is gone. Nothing was recorded for the trial
    (no day state on the added game until Ignore or Finished).

# Updater and startup splash design

Date: 2026-11-05. Status: draft, waiting for Ludo's review.

## Intent

Testing a release today means opening the GitHub Releases page, downloading the `.dmg`, replacing the app in
Applications, then allowing it again in System Settings > Privacy & Security. Ludo wants the app to find and
install its own updates, so the loop between a merge and testing the new version shrinks to one click. This
comes before the next features on purpose: every later feature gets tested through it.

The same startup moment also fixes an offline problem. Launched without network, the app opens the game list
and every game page fails to load, with nothing to do about it. A startup splash checks the network first and
shows an error page with a retry button instead.

This reverses a non-goal of `2026-11-03-release-pipeline-design.md` (auto-update inside the app). That spec is
updated to point here.

## Decided by Ludo

- A new version becomes visible to the app only once its release is public, that is after both installers
  are built and attached. A draft release is never offered.
- The app checks for an update at launch. When one exists, it offers to install it.
- Settings has a button that runs the same check on demand.
- Launch goes through a splash screen that runs the checks: network first, then update.
- No network at launch: an error page with a manual "retry" button, instead of a game list where nothing works.
- The offline page also offers "Continue anyway", which opens the routine as the app does today. It is a
  secondary action, visibly less prominent than "Retry" (2026-11-05).
- The Windows update flow is in scope and tested by hand on Windows, not only published (2026-11-05).
- The `ui` capability gains the updater and restart permissions it needs (accepted on 2026-11-05 after the
  security invariant was raised). It still targets `"webviews": ["ui"]` only.
- A new GitHub Actions secret holds the Tauri updater signing key.

## Goals

1. Release builds produce signed updater artifacts and a `latest.json` attached to the GitHub release, for
   macOS (Apple Silicon) and Windows.
2. The app reads `https://github.com/ludovic-noirault/desktop-dles/releases/latest/download/latest.json`.
   GitHub's `releases/latest` ignores drafts, so the existing draft-then-publish flow already gives "only after
   both builds pass" with no extra CI logic.
3. On launch, a splash screen is shown before the routine:
   - It probes the network. If the probe fails, the offline page is shown.
   - If the network is up, it checks for an update. If one exists, the splash shows the new version and two
     actions: "Install and restart" and "Later".
   - Otherwise it continues to the routine with no click.
4. The offline page explains that the app needs a connection. Its primary action, "Retry", reruns the splash
   sequence from the network probe. Its secondary action, "Continue anyway", opens the routine without the
   update check.
5. "Install and restart" downloads the update, shows that it is downloading (with progress when the size is
   known), installs it and relaunches the app. On Windows the app closes to run the installer, then the
   installer relaunches it; the wording before the download says so.
6. "Later" opens the routine. Nothing is remembered: the next launch asks again.
7. Settings shows the installed version and a "Check for updates" button. Its outcomes: "Up to date", the same
   update offer as the splash, or a short error message.
8. The first release that contains the updater is installed by hand, like today. Every later release arrives
   through the app.

## Non-goals

- Detecting a network loss after the splash. Once the routine is open, a game that fails to load behaves as
  today. (Raised on 2026-11-05, not answered; left out as the builder's call. Easy to add later.)
- Checking for updates while the app stays open (periodic check).
- Skipping a version, release channels, rollback, downgrade.
- Paid code signing or notarization. The updater signature is Tauri's own key, unrelated to Apple or Microsoft.
- Intel macOS and Linux, as in the release pipeline spec.

## Anti-goals

- Being stuck on the splash. Every step has a timeout and a way out.
- An update offer that appears before both installers are attached to a public release.
- An update offer in development (`pnpm tauri dev`): installing a release over a dev run makes no sense.
- An unreachable GitHub, a missing `latest.json` or a malformed one sending Ludo to the offline page while
  his internet works. Only the network probe decides "offline".
- Weakening a security invariant of `AGENTS.md`: no `windows` or `remote` entry in the capability, nothing
  injected into a game webview, game URLs still `https://` only.

## Constraints

- Tauri 2.12 (`tauri` 2.12.5 in `Cargo.lock`). Plugins: `tauri-plugin-updater` and `tauri-plugin-process`
  (for the relaunch), with their JS packages. Check exact APIs, config keys and permission names on docs.rs,
  the Tauri docs or Context7 for the installed versions, never from memory.
- Updater config (Tauri docs, `plugin/updater`): `bundle.createUpdaterArtifacts: true`,
  `plugins.updater.pubkey` holding the public key content (not a path), `plugins.updater.endpoints` with the
  URL of goal 2. The signature cannot be disabled.
- Signing key: generated once by Ludo with `pnpm tauri signer generate`. The public key is committed in
  `tauri.conf.json`. The private key and its password go to the repo secrets `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and to Ludo's password manager. Losing it means installed apps can no
  longer update, and Ludo reinstalls once by hand. The key never enters the repo or a transcript.
- The release workflow passes both secrets to the `tauri-action` step as env. The pipeline spec's "no secret
  beyond `GITHUB_TOKEN`" constraint is amended accordingly.
- macOS build args are `--bundles dmg` today. The updater needs the `.app.tar.gz` archive and its `.sig`.
  Check whether `dmg` alone produces them or whether `app,dmg` is needed. Windows NSIS: check which file
  `latest.json` points to.
- Check how `tauri-action@v1` builds `latest.json` when it uploads to an existing `releaseId` from a matrix:
  the macOS and Windows jobs must end with one `latest.json` holding both platforms.
- Game webviews are children drawn above the `ui` webview. The splash runs before any game webview exists,
  and leaving the routine page hides all games (`src/pages/RoutinePage.tsx`), so the splash and Settings can
  show React UI safely. No native dialog is needed.
- UI copy in English, in `src/strings.ts`. `.tsx` and `.css` edits load the `design` skill first.
- Pure logic is written test-first (Vitest), as `src/routine/` and `src/storage/` are.

## Builder's calls (Claude's, not Ludo's)

- Network probe: a `fetch` from the `ui` webview with `mode: "no-cors"`, `method: "HEAD"`, `cache: "no-store"`
  and a 5 s timeout, to two hosts in parallel: `https://www.gstatic.com/generate_204` and
  `https://1.1.1.1/`. Online when either answers, so one filtered host does not mean offline. With `no-cors`
  the response is opaque, but the promise only rejects on a network failure, which is the only signal
  needed. CSP is `null`, so no config change. No new Rust code and no capability for the probe.
- Update check timeout: 10 s. A check that fails or times out after a good probe counts as "no update" and the
  routine opens. In Settings, the same failure shows the short error message.
- The splash sequence is a small pure module (a reducer or state machine: `probing`, `offline`,
  `checking`, `update-available`, `installing`, `install-failed`, `done`) with the probe and the check
  injected, so it is unit tested without Tauri. `offline` leads to `probing` ("Retry") or `done`
  ("Continue anyway"). The React layer only renders states and wires the real probe and plugin calls.
- Windows install mode: `passive` (progress bar, no prompts), set in `plugins.updater.windows.installMode`.
  Check the key name in the docs.
- Order of the rollout: Ludo generates the key and adds both secrets before the pull request of this work
  is merged, and the public key is committed on the branch. Otherwise the release build of that merge fails.
- `latest.json` across the matrix: `tauri-action@v1` merges by downloading the release's `latest.json`,
  adding its platform, deleting the asset and uploading the new one (its `upload-version-json.ts`). Two jobs
  finishing close together can drop each other's entry. So the build jobs set `uploadUpdaterJson: false`
  and the `publish` job builds `latest.json` from the uploaded `.sig` files, with the release body as notes,
  before the release goes public. A missing platform fails `publish` and the release stays a draft.
- `publish` sets `make_latest=legacy`, so a slower older release published after a newer one does not
  become GitHub's "latest".
- The Settings "Check for updates" button stays visible in dev but reports that updates are disabled in
  development, consistent with the skipped check.
- The download has no timeout of its own; a network failure during it lands in `install-failed`.
- The splash gates the router: the routine and Settings render only after the sequence reaches `done`. The
  update check is skipped when `import.meta.env.DEV` is true; the network probe still runs.
- Release notes: shown under the version only when `latest.json` carries non-empty notes. The release body
  comes from GitHub's generated notes, which may not reach `latest.json`; the version alone is enough.
- An install failure (download or signature) shows a short error with "Continue" to the routine. The current
  version keeps running.
- Settings reuses the same update offer component as the splash.
- The installed version comes from `getVersion()` of `@tauri-apps/api/app`.
- README: one paragraph on updates, and the note that the first updater release is installed by hand.

## Left to the builder

- Splash and offline page layout and wording, within the `design` skill's rules.
- File and module names.
- Whether the download progress is a bar or a percentage.

## Check

- `pnpm test`, `pnpm lint`, `pnpm build`, `cargo test`, `cargo clippy -- -D warnings` pass.
- Unit tests cover every transition of the splash sequence, including probe timeout, one probe host failing
  while the other answers, check failure after a good probe, "Later", "Retry", "Continue anyway" and install
  failure.
- The release of version N carries a `latest.json` with both `darwin-aarch64` and `windows-x86_64` entries.
- Manual, on macOS, after the merge that releases this work (version N):
  1. Install N by hand. Launch with Wi-Fi off: the offline page shows, "Retry" stands out over "Continue
     anyway". Click "Continue anyway": the routine opens. Relaunch offline, turn Wi-Fi on, click "Retry": the
     routine opens.
  2. Launch with network: no update offer, the routine opens. Settings shows N and "Up to date".
  3. Merge any `fix/*` branch to release N+1. While its builds run, launch the app: no offer.
  4. Once N+1 is public, launch the app: the splash offers N+1. "Later" opens the routine.
  5. Settings > "Check for updates" offers N+1. "Install and restart": the app relaunches on N+1 with no
     Gatekeeper prompt, games and their sessions intact.
- Manual, on Windows: steps 1, 2, 4 and 5 on the same releases. On step 5 the app closes, the installer shows
  its progress, the app comes back on N+1 with games and sessions intact.

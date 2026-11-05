# Updater and Startup Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app finds and installs its own releases, and every launch goes through a splash that checks the network (offline page with "Retry" and "Continue anyway") and then offers a pending update.

**Architecture:** The splash sequence is a pure reducer in `src/startup/`, driven by a React gate mounted above the routine. The network probe and the update progress are small pure modules with injected I/O, unit tested without Tauri. `tauri-plugin-updater` and `tauri-plugin-process` do the check, install and relaunch. CI builds signed updater artifacts; the `publish` job writes `latest.json` itself from the uploaded `.sig` files, through a tested script next to `scripts/release.ts`.

**Tech Stack:** Tauri 2.12 (`tauri-plugin-updater`, `tauri-plugin-process`), React 19, TypeScript, Vitest, Biome, GitHub Actions with `tauri-apps/tauri-action@v1`, Node 24, `gh`.

**Spec:** `docs/superpowers/specs/2026-11-05-updater-splash-design.md`

## Global Constraints

- Update endpoint, exactly: `https://github.com/ludovic-noirault/desktop-dles/releases/latest/download/latest.json`.
- Network probe: `fetch` with `mode: "no-cors"`, `method: "HEAD"`, `cache: "no-store"`, 5000 ms timeout, to `https://www.gstatic.com/generate_204` and `https://1.1.1.1/` in parallel. Online when either resolves.
- Update check timeout: 10000 ms. A failed or timed-out check after a good probe means "no update" at launch.
- The update check is skipped when `import.meta.env.DEV` is true. The probe still runs.
- Windows `installMode`: `"passive"`.
- The `ui` capability gains only `updater:default` and `process:allow-restart`. It keeps `"webviews": ["ui"]`; no `windows` or `remote` key anywhere (the `verify.md` grep must still pass).
- Secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The private key never enters the repo, a commit, a log or a transcript. Only the public key is committed.
- UI copy in English, every string in `src/strings.ts`. Load the `design` skill before editing `.tsx` or `.css`.
- Pure logic test-first with Vitest (`pnpm test`). Conventional commits, no tool attribution. Add files by path, never `git add -A`.
- Check exact plugin APIs, config keys and permission names against docs.rs, the Tauri docs or Context7 for the installed versions, never from memory. Values below were read from Context7 on 2026-11-05.

## Review Focus

1. A stale async result after the state moved on (StrictMode double effect, a probe resolving after "Continue anyway"): the reducer ignores events that do not belong to the current status. Pinned by `ignores events from another status` in Task 2.
2. A double click on "Install and restart": a second `install` while `installing` is ignored, and the button is disabled. Pinned in Task 2, checked by reading in Task 5.
3. A download whose size is unknown (`contentLength` missing): progress stays `null` and the UI shows an indeterminate state, never `NaN%`. Pinned in Task 4.
4. A release missing one platform's `.sig`, or asset names with dots and spaces: `buildUpdaterJson` throws, `publish` fails, the release stays a draft. Pinned in Task 7.
5. Two releases built side by side and published out of order: `make_latest=legacy` keeps the newer one as GitHub's latest. Checked by reading in Task 7.

---

### Task 1: Signing key (Ludo, by hand)

Nothing in this task is done by an agent. The agent waits for Ludo to paste the **public** key.

- [ ] **Step 1:** Ludo runs `pnpm tauri signer generate -w ~/.tauri/desktop-dles.key` and sets a password.
- [ ] **Step 2:** Ludo stores the private key file and the password in his password manager.
- [ ] **Step 3:** Ludo adds the repo secrets `TAURI_SIGNING_PRIVATE_KEY` (the content of `~/.tauri/desktop-dles.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub > Settings > Secrets and variables > Actions.
- [ ] **Step 4:** Ludo pastes the content of `~/.tauri/desktop-dles.key.pub` into the session. It is used in Task 4.

### Task 2: Startup sequence reducer

**Files:**
- Create: `src/startup/startup.ts`
- Test: `src/startup/startup.test.ts`

**Interfaces:**
- Produces:
  - `type UpdateInfo = { version: string; notes: string | null }`
  - `type StartupState = { status: "probing" } | { status: "offline" } | { status: "checking" } | { status: "update-available"; update: UpdateInfo } | { status: "installing"; update: UpdateInfo; progress: number | null } | { status: "install-failed" } | { status: "done" }`
  - `type StartupEvent = { type: "probe-ok" } | { type: "probe-failed" } | { type: "update-found"; update: UpdateInfo } | { type: "no-update" } | { type: "retry" } | { type: "continue" } | { type: "later" } | { type: "install" } | { type: "progress"; progress: number | null } | { type: "install-failed" }`
  - `initialStartup: StartupState` (`{ status: "probing" }`)
  - `startupReducer(skipCheck: boolean): (state: StartupState, event: StartupEvent) => StartupState`

Transitions (anything else returns `state` unchanged):

| From | Event | To |
|------|-------|----|
| `probing` | `probe-ok` | `checking`, or `done` when `skipCheck` |
| `probing` | `probe-failed` | `offline` |
| `offline` | `retry` | `probing` |
| `offline` | `continue` | `done` |
| `checking` | `update-found` | `update-available` |
| `checking` | `no-update` | `done` (a failed or timed-out check is reported as `no-update`) |
| `update-available` | `later` | `done` |
| `update-available` | `install` | `installing`, `progress: null` |
| `installing` | `progress` | `installing` with the new `progress` |
| `installing` | `install-failed` | `install-failed` |
| `install-failed` | `continue` | `done` |

- [ ] **Step 1: Write the failing tests** in `src/startup/startup.test.ts`, one `it` per table row, plus:
  - `skips the check in development`: `startupReducer(true)({status:"probing"}, {type:"probe-ok"})` equals `{ status: "done" }`.
  - `ignores events from another status`: from `done`, `probe-ok` and `update-found` return the same object; from `offline`, `probe-ok` returns the same object (a late probe after "Retry" was not clicked).
  - `ignores a second install`: from `installing` with `progress: 0.4`, `install` returns the same object.
- [ ] **Step 2:** Run `pnpm test src/startup/startup.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `src/startup/startup.ts` with the types and the reducer above.
- [ ] **Step 4:** Run `pnpm test src/startup/startup.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/startup/startup.ts src/startup/startup.test.ts && git commit -m "feat: add startup sequence reducer"`

### Task 3: Network probe

**Files:**
- Create: `src/startup/network.ts`
- Test: `src/startup/network.test.ts`

**Interfaces:**
- Produces:
  - `const PROBE_URLS: readonly string[]` = `["https://www.gstatic.com/generate_204", "https://1.1.1.1/"]`
  - `const PROBE_TIMEOUT_MS = 5000`
  - `type Probe = (url: string, signal: AbortSignal) => Promise<unknown>`
  - `isOnline(probe: Probe, urls?: readonly string[], timeoutMs?: number): Promise<boolean>`: `true` as soon as one probe resolves, `false` when all reject or the timeout passes first. Aborts the pending probes once settled.
  - `fetchProbe: Probe`: `fetch(url, { mode: "no-cors", method: "HEAD", cache: "no-store", signal })`.

- [ ] **Step 1: Write the failing tests** with a fake `Probe`:
  - `online when one host answers and the other fails`: one rejects, one resolves → `true`.
  - `offline when every host fails` → `false`.
  - `offline when no host answers before the timeout`: probes never settle, `vi.useFakeTimers()`, advance 5000 ms → `false`.
  - `aborts pending probes once settled`: the signal passed to a hanging probe is `aborted` after the result.
- [ ] **Step 2:** Run `pnpm test src/startup/network.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `src/startup/network.ts` (`Promise.any` over the probes, raced against a timer; one `AbortController` shared by the probes).
- [ ] **Step 4:** Run `pnpm test src/startup/network.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/startup/network.ts src/startup/network.test.ts && git commit -m "feat: probe the network at startup"`

### Task 4: Updater plugins, config and client

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"`)
- Modify: `src-tauri/src/lib.rs` (register both plugins on the builder, next to `tauri_plugin_opener`)
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/ui.json` (add `"updater:default"`, `"process:allow-restart"`)
- Modify: `package.json` (add `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process` with `pnpm add`)
- Create: `src/update/updater.ts`
- Create: `src/update/progress.ts`
- Test: `src/update/progress.test.ts`

**Interfaces:**
- Consumes: `UpdateInfo` (Task 2).
- Produces:
  - `type DownloadEvent = { event: "Started"; data: { contentLength?: number } } | { event: "Progress"; data: { chunkLength: number } } | { event: "Finished" }` (mirror of the plugin's type; import it from `@tauri-apps/plugin-updater` if exported).
  - `type ProgressState = { total: number | null; received: number }`
  - `nextProgress(state: ProgressState, event: DownloadEvent): ProgressState`
  - `fractionOf(state: ProgressState): number | null`: `received / total` clamped to `[0, 1]`, `null` when `total` is `null` or `0`.
  - `type PendingUpdate = UpdateInfo & { install(onProgress: (fraction: number | null) => void): Promise<void> }`
  - `findUpdate(): Promise<PendingUpdate | null>`: `check({ timeout: 10000 })` from `@tauri-apps/plugin-updater`; `notes` is `update.body` trimmed, `null` when empty. Rejects on error; callers decide.
  - `install` calls `downloadAndInstall` with a handler that folds events through `nextProgress` and reports `fractionOf`, then `relaunch()` from `@tauri-apps/plugin-process`. On Windows the app exits during install and `relaunch` is never reached; that is expected.

`tauri.conf.json` additions:

```json
"bundle": { "createUpdaterArtifacts": true },
"plugins": {
  "updater": {
    "pubkey": "<public key pasted by Ludo in Task 1>",
    "endpoints": ["https://github.com/ludovic-noirault/desktop-dles/releases/latest/download/latest.json"],
    "windows": { "installMode": "passive" }
  }
}
```

- [ ] **Step 1: Write the failing tests** in `src/update/progress.test.ts`:
  - `tracks received bytes against the announced size`: `Started` with `contentLength: 1000`, then `Progress` 250 twice → `fractionOf` is `0.5`.
  - `stays indeterminate without a size`: `Started` with no `contentLength`, `Progress` 250 → `fractionOf` is `null`.
  - `never exceeds 1`: total 100, received 150 → `1`.
- [ ] **Step 2:** Run `pnpm test src/update/progress.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `src/update/progress.ts`, then `src/update/updater.ts`, add the dependencies, register the plugins, edit the config and the capability. Check `check()` options, `Update.body`, the `DownloadEvent` shape, the `windows.installMode` key and the permission names against Context7 (`/tauri-apps/plugins-workspace`) before writing them.
- [ ] **Step 4:** Run `pnpm test`, `pnpm lint`, `pnpm build`, `(cd src-tauri && cargo test && cargo clippy -- -D warnings)`, `! grep -rqE '"(windows|remote)"' src-tauri/capabilities`. Expected: all pass.
- [ ] **Step 5: Commit** `git add` the files above and `pnpm-lock.yaml`, `src-tauri/Cargo.lock`, then `git commit -m "feat: add the Tauri updater and process plugins"`

### Task 5: Splash, offline page and update offer

Load the `design` skill first.

**Files:**
- Modify: `src/strings.ts` (add the `startup` and `update` groups below)
- Create: `src/update/UpdateOffer.tsx`
- Create: `src/startup/StartupGate.tsx`
- Modify: `src/main.tsx` (wrap `<RoutineProvider>` in `<StartupGate>`)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `startupReducer`, `initialStartup` (Task 2); `isOnline`, `fetchProbe` (Task 3); `findUpdate`, `PendingUpdate` (Task 4).
- Produces:
  - `UpdateOffer({ update, progress, installing, failed, onInstall, onLater, onContinue }: { update: UpdateInfo; progress: number | null; installing: boolean; failed: boolean; onInstall(): void; onLater(): void; onContinue(): void })`: version, notes when present, "Install and restart" (disabled while `installing`) and "Later"; while installing, a progress bar (indeterminate when `progress` is `null`); on Windows (`navigator.userAgent.includes("Windows")`) the `windowsNote` before install; when `failed`, `installFailed` and "Continue".
  - `StartupGate({ children }: { children: ReactNode })`: runs the sequence, renders `children` only at `done`.

Strings:

```ts
startup: {
  starting: "Starting…",
  offlineTitle: "No connection",
  offlineBody: "Desktop Dles needs the internet to load your games.",
  retry: "Retry",
  continueAnyway: "Continue anyway",
},
update: {
  available: (version: string) => `Version ${version} is available`,
  install: "Install and restart",
  later: "Later",
  downloading: "Downloading the update…",
  windowsNote: "The app will close to install the update, then reopen.",
  installFailed: "The update could not be installed.",
  continue: "Continue",
  sectionTitle: "Updates",
  installedVersion: (version: string) => `Installed version ${version}`,
  check: "Check for updates",
  checking: "Checking…",
  upToDate: "Up to date",
  checkFailed: "Could not check for updates.",
  devDisabled: "Updates are disabled in development.",
},
```

`StartupGate` behaviour:
- `useReducer(startupReducer(import.meta.env.DEV), initialStartup)`.
- One effect keyed on `state.status`: on `probing`, `isOnline(fetchProbe)` dispatches `probe-ok` or `probe-failed`; on `checking`, `findUpdate()` dispatches `update-found` (keep the `PendingUpdate` in a ref for `install`) or `no-update` on `null` or error (log the error). A `cancelled` flag in the cleanup drops results of a superseded run, as `RoutineProvider` does.
- `install` dispatches `install`, then calls `pending.install(fraction => dispatch({ type: "progress", progress: fraction }))`, dispatching `install-failed` on rejection.
- `probing` and `checking` render the app name and `starting`. `offline` renders the title, body, "Retry" as the primary button and "Continue anyway" as a visibly secondary action (text button or link style). `update-available`, `installing`, `install-failed` render `UpdateOffer`.

- [ ] **Step 1:** Add the strings, `UpdateOffer`, `StartupGate`, the `main.tsx` change and the styles.
- [ ] **Step 2:** Run `pnpm test`, `pnpm lint`, `pnpm build`. Expected: all pass.
- [ ] **Step 3: Manual check in dev:** `pnpm tauri dev` with network: the splash shows briefly, then the routine (no check in dev). Wi-Fi off and relaunch: the offline page shows, "Retry" stands out. "Continue anyway" opens the routine. Relaunch offline, Wi-Fi on, "Retry": the routine opens.
- [ ] **Step 4: Commit** `git add src/strings.ts src/update/UpdateOffer.tsx src/startup/StartupGate.tsx src/main.tsx src/styles.css && git commit -m "feat: add the startup splash and offline page"`

### Task 6: Updates section in Settings

Load the `design` skill first.

**Files:**
- Create: `src/update/UpdateSection.tsx`
- Modify: `src/pages/SettingsPage.tsx` (render `<UpdateSection />` after the games list)
- Modify: `src/styles.css` if needed

**Interfaces:**
- Consumes: `findUpdate`, `PendingUpdate` (Task 4); `UpdateOffer` (Task 5); `getVersion` from `@tauri-apps/api/app`.
- Produces: `UpdateSection()`: heading `sectionTitle`, `installedVersion(v)`, a "Check for updates" button. States: idle, `checking` (button disabled), `upToDate`, `checkFailed`, an `UpdateOffer` when an update is found ("Later" returns to idle). In dev, the button shows `devDisabled` instead of calling `findUpdate`.

- [ ] **Step 1:** Implement `UpdateSection` and render it in `SettingsPage`.
- [ ] **Step 2:** Run `pnpm test`, `pnpm lint`, `pnpm build`. Expected: all pass.
- [ ] **Step 3: Manual check in dev:** Settings shows the version `0.1.0` and "Check for updates"; clicking it shows `devDisabled`. Games stay hidden while on Settings.
- [ ] **Step 4: Commit** `git add src/update/UpdateSection.tsx src/pages/SettingsPage.tsx src/styles.css && git commit -m "feat: check for updates from Settings"`

### Task 7: Release pipeline publishes `latest.json`

**Files:**
- Create: `scripts/updater-json.ts`
- Test: `scripts/updater-json.test.ts`
- Modify: `.github/workflows/release.yml`
- Modify: `README.md` (Install and Releases sections)
- Modify: `docs/agents/verify.md` only if a command changes (none expected)

**Interfaces:**
- Produces:
  - `type SignedAsset = { name: string; signature: string }`: `name` is the `.sig` asset name as uploaded, `signature` its content.
  - `type UpdaterJson = { version: string; notes: string; pub_date: string; platforms: Record<"darwin-aarch64" | "windows-x86_64", { signature: string; url: string }> }`
  - `buildUpdaterJson(input: { version: string; notes: string; pubDate: string; repo: string; assets: SignedAsset[] }): UpdaterJson`. A name ending in `.app.tar.gz.sig` maps to `darwin-aarch64`, one ending in `-setup.exe.sig` to `windows-x86_64`. Other `.sig` files are ignored. The URL is `https://github.com/<repo>/releases/download/v<version>/<name without .sig, URI-encoded>`. Throws when a platform is missing or matched twice.
  - CLI when `import.meta.main`: `node scripts/updater-json.ts <sig-dir> <version>`, reading `REPO` and `NOTES` from env, prints the JSON to stdout, exits 1 with the error on stderr.

Workflow changes:
- macOS matrix entry: `--bundles app,dmg` (the `.app.tar.gz` updater archive comes from the `app` bundle).
- `tauri-action` step: `env` gains `TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}`; `with` gains `uploadUpdaterJson: false`.
- `publish` job, before un-drafting: checkout at the merge commit, set up Node 24, `gh release download "v$VERSION" --pattern '*.sig' --dir sigs`, read the body with `gh api "repos/$GITHUB_REPOSITORY/releases/$RELEASE_ID" --jq .body` into `NOTES`, run the script into `latest.json`, `gh release upload "v$VERSION" latest.json`, then the existing PATCH with `-F draft=false -f make_latest=legacy`. Values pass through `env`, never interpolated into the script, as the existing steps do. The job needs `version`'s `version` output.

- [ ] **Step 1: Write the failing tests** in `scripts/updater-json.test.ts`:
  - `maps both platforms` with names `Desktop.Dles_aarch64.app.tar.gz.sig` and `Desktop.Dles_0.3.0_x64-setup.exe.sig`: the darwin URL is `https://github.com/ludovic-noirault/desktop-dles/releases/download/v0.3.0/Desktop.Dles_aarch64.app.tar.gz`, signatures copied, `version`, `notes`, `pub_date` as given.
  - `encodes asset names`: a name with a space is `%20`-encoded in the URL.
  - `ignores other signatures`: an extra `foo.msi.sig` does not change the result.
  - `throws when a platform is missing`: only the macOS asset → throws with a message naming `windows-x86_64`.
  - `throws when a platform matches twice`.
- [ ] **Step 2:** Run `pnpm test scripts/updater-json.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `scripts/updater-json.ts` in the style of `scripts/release.ts`.
- [ ] **Step 4:** Run `pnpm test scripts/updater-json.test.ts`. Expected: PASS.
- [ ] **Step 5: Local bundle check (throwaway key, not Ludo's):** generate a key in the scratchpad with `pnpm tauri signer generate -w <scratch>/test.key -p test --ci`, then `TAURI_SIGNING_PRIVATE_KEY="$(cat <scratch>/test.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD=test pnpm tauri build --target aarch64-apple-darwin --bundles app,dmg`. Expected: `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/` holds `Desktop Dles.app.tar.gz` and `Desktop Dles.app.tar.gz.sig`. If `--bundles dmg` alone also produces them, keep `app,dmg` anyway. Check the flag names of `signer generate` with `pnpm tauri signer generate --help`. Delete the throwaway key afterwards.
- [ ] **Step 6:** Edit `release.yml` as described. Edit the README: Install says the first updater release (`v0.3.0` if this merges as a `feat`) is installed by hand and later ones arrive through the app; Releases says a release needs the two signing secrets and that `publish` writes `latest.json`.
- [ ] **Step 7:** Run `pnpm test`, `pnpm lint`, `pnpm build`. Expected: all pass. Read the workflow diff once more for interpolated `${{ }}` inside `run:` scripts: none allowed.
- [ ] **Step 8: Commit** `git add scripts/updater-json.ts scripts/updater-json.test.ts .github/workflows/release.yml README.md && git commit -m "ci: publish signed updater artifacts and latest.json"`

### Task 8: Release and manual verification (after merge)

Prerequisite: Task 1 done (both secrets present) before the pull request is merged. The pull request goes through `open-pr`.

- [ ] **Step 1:** After the merge, the release `vN` carries the `.dmg`, the `.exe`, the `.app.tar.gz`, the `.sig` files and a `latest.json` with `darwin-aarch64` and `windows-x86_64`. Check with `gh release view vN --json assets --jq '.assets[].name'` and `gh release download vN --pattern latest.json --output - | jq '.platforms | keys'`.
- [ ] **Step 2: macOS**, spec "Check" steps 1 to 5, with a `fix/*` merge to produce N+1.
- [ ] **Step 3: Windows**, spec "Check" Windows steps on the same releases.
- [ ] **Step 4:** Tick the boxes of this plan and report results to Ludo, failures included.

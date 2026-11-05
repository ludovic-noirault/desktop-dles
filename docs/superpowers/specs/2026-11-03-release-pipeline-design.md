# Release pipeline design

Date: 2026-11-03. Status: approved.

## Intent

Today the app only runs through `pnpm tauri dev` on a machine with Rust and Node. The goal is an installer
anyone, Ludo first, can download from the repo's GitHub Releases page and install on macOS or Windows,
with no toolchain. Releases happen on their own: merging a pull request into `main` is the release act.

## Decided by Ludo

- Platforms: macOS and Windows.
- A release is created each time code lands on `main`, and its installers are built and attached to it.
- Version numbers follow semver, tagged `vX.Y.Z`.
- The bump comes from the name of the merged branch, not from commit messages:
  - `feat/<name>` bumps the minor number (`v0.2.0` to `v0.3.0`).
  - `fix/<name>` bumps the patch number (`v0.2.0` to `v0.2.1`).
- Every branch follows the `<type>/<name>` convention.
- Nothing lands on `main` without a pull request.
- The release workflow is triggered by the merge of a pull request, not by a push to `main` (2026-11-04).

## Goals

1. A workflow on the merge of a pull request into `main` that reads the pull request's head branch name,
   computes the next version from the latest `v*` tag, and creates the tag and the release on the merge
   commit.
2. The release carries a macOS installer (`.dmg`, Apple Silicon) and a Windows installer (NSIS `.exe`),
   built by `tauri-apps/tauri-action@v1`.
3. The release only becomes public once both installers are attached. A failed build leaves a draft,
   never a public release with a missing installer.
4. The installers and the bundle metadata carry the release's version, not `0.1.0`.
5. A pull request check that fails when the head branch does not match `<type>/<name>`.
6. `main` protected on GitHub: pull request required, branch-name check required, no direct push.
7. README: how to install from a release, including the first-launch warnings below.

## Non-goals

- Code signing with a paid identity: no Apple Developer ID, no notarization, no Windows certificate.
- Intel macOS and Linux builds.
- ~~Auto-update inside the app (`tauri-plugin-updater`).~~ Brought in scope on 2026-11-05 by
  `2026-11-05-updater-splash-design.md`.
- Running tests and lints in CI on pull requests. The local `verify-gate.py` pre-push hook already runs
  `docs/agents/verify.md`. Could come later if asked.
- A major bump from a branch name.

## Anti-goals

- A public release whose installer does not start on a clean machine.
- A release triggered by a branch type that changes nothing for the user (`docs/`, `chore/`, and so on).
- A workflow that pushes commits to `main`: it would need to bypass the branch protection of goal 6.

## Constraints

- The repo is public: GitHub-hosted macOS and Windows runners are free. No secret is needed beyond the
  built-in `GITHUB_TOKEN` (job permission `contents: write`). Amended on 2026-11-05: the build also needs
  the updater signing secrets, see `2026-11-05-updater-splash-design.md`.
- macOS: the build uses ad-hoc signing (`bundle.macOS.signingIdentity: "-"`). Without it, Apple Silicon
  reports a downloaded app as damaged. Ad-hoc signing still asks the user to allow the app once in
  System Settings > Privacy & Security > Open Anyway.
- Windows: the installer is unsigned, so SmartScreen shows "Windows protected your PC" on first run. The
  user clicks "More info", then "Run anyway".
- Windows was never run by the MVP checklist. Child webviews (`unstable`) are supported on Windows by
  Tauri, but nothing proves the app behaves there. The first Windows release must be launched by hand
  before it is trusted.
- The security invariants of `AGENTS.md` are untouched: no capability change, no script injected into
  games.
- Tauri version: check `tauri-action` inputs and the `tauri build --config` flag against current docs,
  not from memory.

## Version rules

| Merged branch | Latest tag | New tag |
|---------------|------------|---------|
| `feat/*` | `v0.2.0` | `v0.3.0` |
| `fix/*` | `v0.2.0` | `v0.2.1` |
| any other type | any | no release |
| `feat/*` | none | `v0.2.0` |
| `fix/*` | none | `v0.1.1` |

With no tag yet, the base is `0.1.0`, the version currently in `package.json`, `Cargo.toml` and
`tauri.conf.json`.

## Builder's calls (Claude's, not Ludo's)

- The tag is the single source of truth for the version. The workflow injects it at build time
  (`tauri build --config '{"version":"X.Y.Z"}'`), and the three files in the repo stay at `0.1.0`. This
  follows from the anti-goal on pushing to `main`.
- The workflow runs on `pull_request` `closed` against `main` and only continues when the pull request
  was merged. The branch name comes from the event (`pull_request.head.ref`) and the build checks out
  `pull_request.merge_commit_sha`, which works for merge, squash and rebase merges alike. A pull request
  closed without merge runs nothing.
- Allowed branch types, a closed list: the conventional commit types of `AGENTS.md` (`feat`, `fix`,
  `docs`, `chore`, `refactor`, `test`) plus `ci`. No Dependabot, no fork pull requests: it is a solo repo.
- A direct push to `main` triggers nothing. The branch protection of goal 6, admins included, is what
  prevents one.
- The workflow pushes the `vX.Y.Z` tag first, then creates the draft release on it, so a failed build
  leaves both. Recovery is "Re-run failed jobs" in the Actions tab, which reuses the tag and the draft.
  If the draft is abandoned, the next merge bumps from that tag and its notes start from it.
- Only the two named installers are built: `--bundles dmg` on macOS, `--bundles nsis` on Windows.
- Versions are plain `X.Y.Z`, never a prerelease suffix (Windows installers reject one anyway). The
  first build checks that the `--config` override reaches the bundle version.
- Release notes: GitHub's generated notes (`--generate-notes`), titled with the tag. For `v0.2.0`, with
  no earlier tag, they cover the whole history, which is fine.
- Concurrency: one version job at a time (job-level `concurrency` group, no cancel), so two quick merges
  cannot compute the same version. Builds of two releases may run side by side.
- Branch protection is applied with `gh api`, after Ludo confirms the command, once the pull request of
  this work has run the branch-name check: GitHub can only require a check it has already seen.

## Rollout order

1. Create the GitHub remote and push `main`.
2. Merge `feat/mvp` through a pull request. No workflow exists yet on `main`, so no release.
3. Open the pull request of `feat/release-pipeline`. Its branch-name check runs once.
4. Apply the branch protection on `main` (goal 6), requiring that check.
5. Merge it. It is a `feat` merge, so it produces the first release, `v0.2.0`, with the MVP and the
   pipeline.
6. Ludo installs `v0.2.0` on macOS and on a Windows machine and launches it once on each.

## Left to the builder

- The exact workflow file layout (one workflow with jobs, or several workflows).
- The README wording.

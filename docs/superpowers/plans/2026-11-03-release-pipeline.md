# Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every pull request merged into `main` from a `feat/*` or `fix/*` branch publishes a GitHub release `vX.Y.Z` with a macOS `.dmg` and a Windows NSIS `.exe` attached.

**Architecture:** The version rules live in one small TypeScript module, `scripts/release.ts`, unit-tested with Vitest and run by Node 24 directly (type stripping) from the workflows. A pull request workflow checks the branch name. A push workflow on `main` finds the merged pull request, computes the version, pushes the tag, opens a draft release, builds both installers with `tauri-action` into it, and publishes it only when both builds pass.

**Tech Stack:** GitHub Actions, `tauri-apps/tauri-action@v1`, `gh` CLI and REST API, Node 24, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-03-release-pipeline-design.md`

## Global Constraints

- Branch types, closed list: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`. Branch form `<type>/<name>`.
- `feat` bumps the minor number, `fix` the patch number, every other type makes no release. No major bump from a branch name.
- With no `v*` tag yet, the base version is `0.1.0`.
- Versions are plain `X.Y.Z`, tags `vX.Y.Z`. No prerelease suffix.
- The workflow never pushes a commit to `main`. `package.json`, `Cargo.toml` and `tauri.conf.json` stay at `0.1.0`; the version reaches the bundle through `tauri build --config '{"version":"X.Y.Z"}'`.
- Targets: macOS Apple Silicon (`macos-latest`, `--bundles dmg`) and Windows x64 (`windows-latest`, `--bundles nsis`).
- macOS ad-hoc signing: `bundle.macOS.signingIdentity` set to `"-"`. No paid signing on either platform.
- Only secret: the built-in `GITHUB_TOKEN`, with `contents: write` on the release jobs.
- The security invariants of `AGENTS.md` are untouched: no capability change, no script injected into games.
- Pin every action to a major tag (`@v1`, `@v4`…). Check current tags and inputs on each action's README, never from memory.
- Add files by path in commits, never `git add -A`.

## Review Focus

1. Tags sorted as text: `v0.10.0` must win over `v0.9.0`. Test `nextVersion` with both tags.
2. Malformed branch names: `feat/`, `feature/x`, `Feat/x`, `feat` alone must be rejected; `feat/a-b.c_d` and `fix/a/b` accepted. Test `branchType`.
3. Stray tags that are not `vX.Y.Z` (`v1.2`, `app-v0.3.0`, `latest`) must be ignored, not crash the run. Test `nextVersion`.
4. A pushed commit associated with several pull requests: only the one merged into `main` counts. Encoded in the workflow's `jq` filter (Task 3), checked by reading.
5. A failed build must leave the release a draft. Encoded by `publish` needing both build jobs (Task 3), checked by reading.

---

### Task 1: Release rules module

**Files:**
- Create: `scripts/release.ts`
- Create: `scripts/release.test.ts`
- Modify: `tsconfig.json` (add `"scripts"` to `include`)

**Interfaces:**
- Produces:
  - `type BranchType = "feat" | "fix" | "docs" | "chore" | "refactor" | "test" | "ci"`
  - `branchType(ref: string): BranchType | null`: the type when `ref` matches `^(feat|fix|docs|chore|refactor|test|ci)/[a-z0-9][a-z0-9._/-]*$`, else `null`.
  - `nextVersion(type: BranchType, tags: string[]): string | null`: the next `X.Y.Z` (no `v`), or `null` for a type that makes no release.
  - CLI, run as `node scripts/release.ts <command> ...` when `import.meta.main`:
    - `check-branch <ref>`: exit 0 when valid, else print `Branch "<ref>" must be <type>/<name>, with type one of: feat, fix, docs, chore, refactor, test, ci` to stderr and exit 1.
    - `next-version <ref>`: reads tags, one per line, from stdin; prints the version or nothing; exits 1 on an invalid branch.

- [ ] **Step 1: Write the failing tests in `scripts/release.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { branchType, nextVersion } from "./release";

describe("branchType", () => {
  it("accepts every allowed type", () => {
    for (const t of ["feat", "fix", "docs", "chore", "refactor", "test", "ci"]) {
      expect(branchType(`${t}/x`)).toBe(t);
    }
  });
  it("accepts dots, dashes, underscores and slashes in the name", () => {
    expect(branchType("feat/a-b.c_d")).toBe("feat");
    expect(branchType("fix/a/b")).toBe("fix");
  });
  it("rejects malformed names", () => {
    for (const ref of ["feat/", "feat", "feature/x", "Feat/x", "feat/X", "main", "release/1.0"]) {
      expect(branchType(ref)).toBeNull();
    }
  });
});

describe("nextVersion", () => {
  it("starts from 0.1.0 when no tag exists", () => {
    expect(nextVersion("feat", [])).toBe("0.2.0");
    expect(nextVersion("fix", [])).toBe("0.1.1");
  });
  it("bumps minor on feat and resets patch", () => {
    expect(nextVersion("feat", ["v0.2.3"])).toBe("0.3.0");
  });
  it("bumps patch on fix", () => {
    expect(nextVersion("fix", ["v0.2.0"])).toBe("0.2.1");
  });
  it("makes no release for other types", () => {
    for (const t of ["docs", "chore", "refactor", "test", "ci"] as const) {
      expect(nextVersion(t, ["v0.2.0"])).toBeNull();
    }
  });
  it("compares versions numerically, not as text", () => {
    expect(nextVersion("fix", ["v0.9.0", "v0.10.0"])).toBe("0.10.1");
  });
  it("ignores tags that are not vX.Y.Z", () => {
    expect(nextVersion("fix", ["v1.2", "app-v0.3.0", "latest", "v0.2.0", ""])).toBe("0.2.1");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test scripts/release.test.ts`
Expected: FAIL, cannot resolve `./release`.

- [ ] **Step 3: Implement `branchType`, `nextVersion` and the CLI in `scripts/release.ts`**

Only syntax Node can strip (no `enum`, no parameter properties). The CLI reads stdin with `readFileSync(0, "utf8")`. Add `"scripts"` to `tsconfig.json` `include` so `pnpm build` type-checks the module.

- [ ] **Step 4: Run tests, type-check, lint and the CLI**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: all exit 0, 26 tests passed (17 existing + 9 new).

Run: `printf 'v0.9.0\nv0.10.0\n' | node scripts/release.ts next-version feat/x`
Expected: `0.11.0`

Run: `node scripts/release.ts next-version docs/x < /dev/null; echo "exit $?"`
Expected: empty line, `exit 0`

Run: `node scripts/release.ts check-branch feature/x; echo "exit $?"`
Expected: the error message on stderr, `exit 1`

- [ ] **Step 5: Commit**

```bash
git add scripts/release.ts scripts/release.test.ts tsconfig.json
git commit -m "feat: add release version rules"
```

---

### Task 2: Branch-name check on pull requests

**Files:**
- Create: `.github/workflows/branch-name.yml`
- Modify: `AGENTS.md` (`## Conventions`)

**Interfaces:**
- Consumes: `node scripts/release.ts check-branch <ref>` (Task 1).
- Produces: a check whose job name is `branch-name`. The branch protection of Task 5 requires it by that exact name.

- [ ] **Step 1: Write `.github/workflows/branch-name.yml`**

Trigger: `pull_request` on `opened`, `synchronize`, `reopened`, `edited`, base branch `main`. One job `branch-name` on `ubuntu-latest`, permissions `contents: read`: `actions/checkout`, `actions/setup-node` with `node-version: 24`, then `node scripts/release.ts check-branch "$HEAD_REF"` with `HEAD_REF: ${{ github.head_ref }}` passed through `env`, never interpolated into the script (a branch name is user input).

- [ ] **Step 2: Add the branch convention to `AGENTS.md` `## Conventions`**

One bullet: branches are named `<type>/<name>` with the types of the Global Constraints; nothing lands on `main` without a pull request; merging a `feat/*` pull request releases a minor version, a `fix/*` one a patch version (rules in `scripts/release.ts`).

- [ ] **Step 3: Verify**

Run: `pnpm lint` and, if `actionlint` is installed, `actionlint .github/workflows/branch-name.yml`
Expected: exit 0. Without `actionlint`, note it in the report; the real check is the first pull request (Task 5).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/branch-name.yml AGENTS.md
git commit -m "ci: check branch names on pull requests"
```

---

### Task 3: Release workflow and ad-hoc signing

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `src-tauri/tauri.conf.json` (`bundle.macOS.signingIdentity: "-"`)

**Interfaces:**
- Consumes: `node scripts/release.ts next-version <ref>` (Task 1).

- [ ] **Step 1: Set `bundle.macOS.signingIdentity` to `"-"` in `src-tauri/tauri.conf.json`**

- [ ] **Step 2: Prove the version override reaches the bundle, locally on macOS**

Run: `pnpm tauri build --bundles app --config '{"version":"9.9.9"}'`
Then: `defaults read "$PWD/src-tauri/target/release/bundle/macos/Desktop Dles.app/Contents/Info" CFBundleShortVersionString`
Expected: `9.9.9`. Also `codesign -dv "src-tauri/target/release/bundle/macos/Desktop Dles.app" 2>&1 | grep Signature` prints `Signature=adhoc`.
If the version is not `9.9.9`, stop and report: the whole version design rests on this.

- [ ] **Step 3: Write `.github/workflows/release.yml`**

Trigger: `push` on `main`. Top-level `concurrency: { group: release, cancel-in-progress: false }`.

Job `version` (`ubuntu-latest`, `contents: write`), outputs `version` and `release_id`:
1. `actions/checkout` with `fetch-depth: 0` (tags needed), `actions/setup-node` with Node 24.
2. Find the merged pull request:
   `gh api "repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/pulls" --jq '[.[] | select(.base.ref == "main" and .merged_at != null)][0].head.ref // empty'`.
   Empty result: fail the job with `::error::` "Push to main with no merged pull request" (spec: fail loudly).
3. `git tag --list 'v*' | node scripts/release.ts next-version "$HEAD_REF"`. Empty: set no output, the run ends green with a notice "No release for <ref>".
4. Otherwise: `git tag "v$VERSION" "$GITHUB_SHA"`, `git push origin "v$VERSION"`, then create the draft with
   `gh api "repos/$GITHUB_REPOSITORY/releases" -f tag_name="v$VERSION" -f name="v$VERSION" -F draft=true -F generate_release_notes=true --jq .id`
   and output that id as `release_id`.
All values reach shell steps through `env`, never `${{ }}` inside `run`.

Job `build` (`needs: version`, `if: needs.version.outputs.version != ''`, `contents: write`), matrix:

| platform | args |
|----------|------|
| `macos-latest` | `--target aarch64-apple-darwin --bundles dmg` |
| `windows-latest` | `--bundles nsis` |

`fail-fast: false`. Steps: `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` (Node 24, `cache: pnpm`), `dtolnay/rust-toolchain@stable` (with `targets: aarch64-apple-darwin` on macOS), `swatinem/rust-cache` (`workspaces: src-tauri`), `pnpm install --frozen-lockfile`, then `tauri-apps/tauri-action@v1` with `releaseId` from `version`, and `args: ${{ matrix.args }} --config '{"version":"<version>"}'`.

Job `publish` (`needs: [version, build]`, same `if`, `contents: write`):
`gh api -X PATCH "repos/$GITHUB_REPOSITORY/releases/$RELEASE_ID" -F draft=false`.
Because `needs` waits for every matrix leg, one failed platform keeps the release a draft.

- [ ] **Step 4: Verify**

Run: `pnpm lint`, `(cd src-tauri && cargo test && cargo clippy -- -D warnings)`, and `actionlint` if installed.
Expected: exit 0. Read the workflow once against Review Focus 4 and 5 and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml src-tauri/tauri.conf.json
git commit -m "ci: build and publish releases for macOS and Windows"
```

---

### Task 4: Install instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`**

- Opening paragraph: macOS and Windows, not "macOS app".
- New `## Install` section before `## Prerequisites`: download the `.dmg` or the `.exe` from the latest GitHub release. macOS: open the app once, then System Settings > Privacy & Security > Open Anyway (ad-hoc signed, not notarized). Windows: SmartScreen shows "Windows protected your PC", click "More info" then "Run anyway" (unsigned installer).
- New `## Releases` section after `## Checks`: merging a `feat/*` pull request into `main` releases a minor version, a `fix/*` one a patch version, other branch types release nothing; rules in `scripts/release.ts`, pipeline in `.github/workflows/release.yml`.
- `## Prerequisites` stays the developer setup; title it so (`## Develop`) if the new section makes it ambiguous.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: explain installing from a release"
```

---

### Task 5: Rollout with Ludo (controller, not a subagent)

Each step touches GitHub and needs Ludo's go.

- [ ] **Step 1:** Ludo creates the public repo `ludovic-noirault/desktop-dles`; add it as `origin`, push `main`.
- [ ] **Step 2:** Push `feat/mvp`, open its pull request with `open-pr`, merge it. Expected: no workflow runs on `main` yet.
- [ ] **Step 3:** Rebase `feat/release-pipeline` on `main`, push, open its pull request. Expected: the `branch-name` check passes.
- [ ] **Step 4:** Apply the branch protection on `main` with `gh api -X PUT repos/ludovic-noirault/desktop-dles/branches/main/protection`: pull request required (0 approvals, solo repo), required status check `branch-name`, `enforce_admins: true` so not even an admin push lands alone. Show Ludo the exact payload before running it.
- [ ] **Step 5:** Merge the pull request. Expected: the release run creates `v0.2.0`, both builds pass, the release is public with one `.dmg` and one `.exe`.
- [ ] **Step 6:** Ludo installs and launches `v0.2.0` on macOS and on Windows, and runs the MVP checklist on Windows. Record the result in the plan.

# Verify

Commands `~/.claude/hooks/verify-gate.py` runs before it lets a `git push` through. Every 4-space-indented
line is one command, run from the repo root. A non-zero exit denies the push.

They exist once the scaffold task of the MVP plan is done. Until then a push is denied, which is fine:
nothing should be pushed before the app builds.

## Frontend: unit tests, lint, type-check and bundle

    pnpm install --frozen-lockfile
    pnpm test
    pnpm lint
    pnpm build

## Rust: tests and lints, warnings as errors

    cd src-tauri && cargo test
    cd src-tauri && cargo clippy -- -D warnings

## Security invariant: games never match a capability

A `windows` or `remote` key in a capability would give game webviews access to the IPC.

    ! grep -rqE '"(windows|remote)"' src-tauri/capabilities

# AGENTS.md

Guidance for any AI coding agent (Claude Code, Codex, Cursor, Aider, etc.) working in this repo. Project overview lives in [README.md](README.md); contributor architecture notes in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Branching & Git workflow

This is a **solo project** — Sumner is the only active developer, and `main` (on `origin`, `Sylverity/cylform`) is the source of truth.

- **Work directly on `main`.** Do NOT create a feature branch for routine work, even to commit or push. Many harnesses default to "branch before committing on the default branch" — do not do that here.
- **CI runs on every push to `main`** (`.github/workflows/rust.yml`), so pushing straight to `main` gets full validation. A pull request is not required just to run CI.
- Only create a branch + PR when Sumner **explicitly** asks for one (e.g. to gate a risky change on CI before it lands).
- **Keep local `main` in sync.** The repo squash-merges PRs, which rewrites commits into new SHAs; if local `main` isn't reset afterward it silently diverges. Start each session with `git fetch origin && git switch main && git pull --ff-only`, and after any merge run `git switch main && git reset --hard origin/main`. If `pull --ff-only` is rejected, `main` has diverged — reconcile before building new work on it.
- Delete local branches once merged so they don't accumulate (`git branch -d <name>`, or `git tidy` if that alias is configured). GitHub is set to auto-delete merged head branches; keep local clones matching.

## Changelog & releases

- Commit per meaningful step; add a one-line entry to the `## [Unreleased]` section of `CHANGELOG.md` for each. Do NOT bump the version on every commit.
- At release, consolidate `Unreleased` into one dated version entry and bump the version in `Cargo.toml`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-ui/package.json`, `CITATION.cff`, and the README citation block. Sync `Cargo.lock` with a `cargo` command.

## Building & checks (must pass before pushing)

Repo lives on WSL; run `git`/`cargo`/`pnpm` in a Linux shell.

- Frontend (`desktop/src-ui`): `npx tsc --noEmit`, `pnpm test`, `pnpm build`.
- Backend (`desktop/src-tauri` + `crates/core`): `cargo test --workspace --all-features`, `cargo fmt --all --check`, and `cargo clippy --workspace --all-targets --all-features -- -D warnings` (**CI denies warnings**, so run clippy locally).
- To eyeball rendering, build the desktop app (`pnpm --dir desktop/src-ui run build:desktop:fast`) and use `pnpm --dir desktop/src-ui run snapshot:molecule -- --molecule <path>`.

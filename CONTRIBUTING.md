# Contributing to Cylform

For end users: download a release from GitHub Releases. No build tools required.

For contributors: this guide covers building from source.

## Prerequisites

- Rust 1.70+ via [rustup](https://rustup.rs/)
- Node.js 20 LTS
- Tauri system dependencies — [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

On Ubuntu / Debian, install:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```

## Building from source

```bash
# Install frontend dependencies
pnpm --dir desktop/src-ui install --frozen-lockfile

# Dev mode (hot-reload)
cargo tauri dev

# Standalone local release binary
pnpm --dir desktop/src-ui run build:desktop

# Installer/package bundles for the current OS
cargo tauri build
```

The `build:desktop` script is a developer convenience for producing a local standalone executable. User-friendly installers and packages should come from the Tauri bundle output and GitHub Releases.

## Running tests

```bash
pnpm --dir desktop/src-ui run build
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

These commands mirror the important local checks used by CI. Run `cargo fmt --all` without `--check` to apply Rust formatting before committing.

## Benchmarking performance

Use the desktop benchmark before changing public atom-count claims or after modifying renderer, parser, or molecule-loading code:

```bash
pnpm --dir desktop/src-ui run build:desktop:fast
pnpm --dir desktop/src-ui run benchmark:atoms -- --sizes 5000,10000,25000,50000
```

The benchmark launches the real app, loads generated XYZ fixtures, samples frame timing, and writes ignored JSON artifacts under `benchmark-results/`. See [docs/BENCHMARKING.md](docs/BENCHMARKING.md) for WSLg/GPU setup, result interpretation, and guidance for humans or agents working on performance-sensitive changes.

## Project structure

```
crates/core/src/
  molecule.rs   — Atom, Bond, BondKind, frame-ready Structure; bond perception
  io.rs         — parser registry; XYZ + PDB readers/writers
  camera.rs     — Orbital camera maths
  picker.rs     — Selection framework

desktop/src-tauri/src/
  main.rs       — load_molecule command, saved state, Tauri app setup

desktop/src-ui/src/
  App.tsx                         — root component, shared types
  components/MoleculeCanvas.tsx   — Three.js scene, instanced atom/bond rendering
  components/Toolbar.tsx          — file open, reset view
  components/InfoPanel.tsx        — molecule metadata
```

For the current data flow, renderer batching model, frame-ready structure model, parser registry, material presets, and saved presentation schema, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Conventions

- Rust: `cargo fmt` + `cargo clippy` before committing
- TypeScript: `pnpm --dir desktop/src-ui run build` to check types and build the frontend
- Changelog: update `CHANGELOG.md` for user-visible features, release-prep work, architecture changes, and packaging changes
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `chore:`)

## Workflow

1. Fork → feature branch → PR
2. Keep PRs focused — one concern per PR
3. Open an issue first for anything architectural
4. Prefer existing extension points before adding new cross-cutting systems:
   - New molecule readers should use the `FormatParser` registry.
   - New persisted UI state should extend the versioned presentation envelope with defaults.
   - New saved labels, measurements, or other persisted notes should extend the unified annotation model.
   - New permanent bond styles should flow through `BondKind` and the instanced bond batches.

## Documentation map

- `README.md` is the end-user overview: what Cylform does, supported workflows, install pointers, usage, roadmap, and the brief architecture sketch.
- `CHANGELOG.md` is the project history at release-note level. Keep it current, but do not turn it into a commit log.
- `docs/INSTALL.md` is the step-by-step install, uninstall, basic-use, file-safety, and troubleshooting guide for users.
- `docs/ARCHITECTURE.md` is the contributor-facing data-flow and extension-point guide.
- `docs/BENCHMARKING.md` is the performance benchmark guide and the source of truth for atom-capacity claim validation.
- `SECURITY.md` and `CODE_OF_CONDUCT.md` are public project policy documents.
- `AGENTS.md` is intentionally only a pointer back to `README.md`, so project guidance has one maintained home.

## License

Contributions are licensed under Apache 2.0.

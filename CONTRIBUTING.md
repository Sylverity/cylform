# Contributing to Cylform

This guide is for contributors building from source. If you only want to use Cylform, download a Windows or Ubuntu/Debian release from GitHub Releases instead; release builds do not require Rust, Node.js, or Tauri tooling.

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
npm --prefix desktop/src-ui ci

# Dev mode (hot-reload)
cargo tauri dev

# Standalone local release binary
npm --prefix desktop/src-ui run build:desktop

# Installer/package bundles for the current OS
cargo tauri build
```

The `build:desktop` script is a developer convenience for producing a local standalone executable. User-friendly installers and packages should come from the Tauri bundle output and GitHub Releases.

## Running tests

```bash
npm --prefix desktop/src-ui run build
cargo test -p cylform-core
cargo check -p cylform-core
```

## Project structure

```
crates/core/src/
  molecule.rs   — Atom, Bond, Structure; bond perception
  io.rs         — XYZ + PDB readers/writers
  camera.rs     — Orbital camera maths
  picker.rs     — Selection framework
  render/       — wgpu rendering engine (future use)

desktop/src-tauri/src/
  main.rs       — load_molecule command, Tauri app setup

desktop/src-ui/src/
  App.tsx                         — root component, shared types
  components/MoleculeCanvas.tsx   — Three.js scene
  components/Toolbar.tsx          — file open, reset view
  components/InfoPanel.tsx        — molecule metadata
```

## Conventions

- Rust: `cargo fmt` + `cargo clippy` before committing
- TypeScript: `npm --prefix desktop/src-ui run build` to check types and build the frontend
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `chore:`)

## Workflow

1. Fork → feature branch → PR
2. Keep PRs focused — one concern per PR
3. Open an issue first for anything architectural

## License

Contributions are licensed under Apache 2.0.

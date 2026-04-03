# Contributing to CYLview-NG

## Prerequisites

- Rust 1.70+ via [rustup](https://rustup.rs/)
- Node.js 20 LTS
- Tauri system dependencies — [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

## Building from source

```bash
# Frontend deps
cd desktop/src-ui && npm install

# Dev mode (hot-reload)
cd .. && cargo tauri dev

# Release build
cd desktop/src-ui && npm run build && cd ../..
cargo tauri build
```

## Running tests

```bash
cargo test -p cylview-core
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
- TypeScript: `npx tsc --noEmit` to check types
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `chore:`)

## Workflow

1. Fork → feature branch → PR
2. Keep PRs focused — one concern per PR
3. Open an issue first for anything architectural

## License

Contributions are licensed under Apache 2.0.

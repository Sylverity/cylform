# Changelog

High-level project history for Cylform. This file intentionally summarizes user-visible behavior, release engineering, and architecture milestones rather than every internal code edit.

## [Unreleased]

### V1 Prep Added
- Added a desktop benchmark workflow for large generated XYZ fixtures, including real app launch, molecule loading, frame sampling, WebGL renderer metadata, and ignored JSON results under `benchmark-results/`.
- Moved normal molecule topology rendering onto bounded Three.js instancing paths for atoms and bonds, including styled bond buckets, so figure bond styles no longer create one persistent mesh per styled bond.
- Added a frame-ready Rust molecule model with `Frame`, `Structure.frames`, `static_bonds`, and compatibility helpers while keeping the current app display on frame 0.
- Extended `load_molecule` with an optional zero-based `frameIndex` and preserved the existing frontend `MoleculeData` shape for v1 compatibility.
- Added a versioned per-file presentation-state envelope with defaults for poses, annotations, hidden atoms, styles, material preset, and camera state.
- Replaced persisted labels with a unified persisted annotation model for atom labels, distances, angles, and dihedrals while keeping in-progress measurement selection transient.
- Added a `FormatParser` registry in `cylform-core`, built-in XYZ/PDB parser implementations, and frontend/native-dialog extension discovery from the backend.
- Added serializable material presets, starting with `CYLview` and `Houkmol`, and stored the active preset in per-file state.
- Added `BondKind` to the core data model for normal, transition-state, dative, interaction, and thin figure bonds, with frontend style overrides layered on top.

### V1 Prep Changed
- Updated README, install notes, benchmarking guidance, contributing notes, and architecture documentation to describe the current rendering path, parser registry, frame model, annotation model, material presets, and saved-state schema.
- Clarified that the 25,000 atom cap is a conservative real-time viewer limit and that trajectory/computational-output workflows will use separate streaming or lazy-loading designs later.
- Kept the README oriented toward chemists and researchers, with implementation detail moved into `docs/ARCHITECTURE.md`.

### Release Engineering
- Hardened the desktop release workflow and GitHub Actions setup for the release-candidate path.
- Prepared the repository for private-to-open-source transition, including dependency cleanup, pnpm lockfile use, issue templates, license/security/conduct docs, and release packaging polish.
- Added macOS Apple Silicon packaging support with `.app` bundle and `.dmg` installer paths.

### Planned
- Promote `1.0.0-rc.1` to `1.0.0` after Windows 11, Ubuntu/Debian, and macOS smoke testing.
- Continue keeping this changelog current after each feature or release-prep slice.

---

## [1.0.0-rc.1] - 2026-04-26

Release candidate for the v1 publication-workflow milestone.

### Added
- Windows and Ubuntu/Debian release packaging through GitHub Releases.
- XYZ/PDB loading with stricter file safety limits and source metadata disclosure.
- Native file dialogs, recent files, previous/next navigation through supported files in the current folder, and single-instance desktop behavior.
- View overlay with floor/grid, backdrop, projection, lighting, fog, auto-rotate, and camera presets.
- Selection modes for view, measure, atom, bond, atom+bond, and label workflows.
- Distance, angle, dihedral, atom labels, editable saved label text, and label-aware PNG export.
- Session atom visibility controls, including hide selected atoms, show all atoms, hide hydrogens, and hide C-H hydrogens.
- Per-file presentation state in app data for labels, styles, hidden atoms, bond styles, view options, and saved poses.
- Visual selected atom styling and simple bond restyling for full, transition-state, dative, interaction, and thin bonds.
- Native desktop menu scaffold and About dialog.
- Toasts, dismissible errors, shortcut dialog, collapsible side panels, and general UI polish for release-candidate use.

### Changed
- Rebranded the project from CYLview-NG to Cylform and added open-source readiness materials.
- Consolidated project guidance into the README so release goals and contribution direction have one visible source of truth.

---

## [0.1.4] - 2026-04-24

View-control milestone.

### Added
- In-canvas view overlay controls for floor/grid, backdrop, projection, lighting, fog, auto-rotate, and camera presets.
- Additional renderer polish around the CYLview-inspired default presentation.

---

## [0.1.3] - 2026-04-24

Desktop usability milestone.

### Added
- Single-instance app behavior.
- Keyboard shortcut hints and toolbar polish.

---

## [0.1.2] - 2026-04-24

Windows release fix milestone.

### Fixed
- Windows release command invocation for the desktop packaging workflow.

---

## [0.1.1] - 2026-04-24

Private test release milestone.

### Changed
- Bumped the private test release version and sped up the desktop release workflow.

---

## [0.1.0] - 2026-04-24

First tagged desktop milestone with hardened loading and startup behavior.

### Added
- `cylform-core` Rust library with `Atom`, `Bond`, `Structure`, camera, picker, and molecule I/O foundations.
- XYZ and PDB file I/O with automatic format detection.
- Covalent-radius bond perception to avoid phantom long-range bonds.
- Tauri v2 desktop shell with React, Vite, native file opening, and a standalone desktop build path.
- Three.js real-time renderer with cylinder bonds, CPK atom spheres, CYLview-inspired lighting, and auto-fit camera behavior.
- Orbit controls for rotate, pan, zoom, and reset.
- Info panel with molecule name, atom count, and bond count.
- Cross-platform install documentation and early GitHub Actions release workflows.

### Fixed
- Hardened file loading, desktop startup behavior, and browser/WebView compatibility.
- Repaired early GitHub Actions Rust toolchain setup.

---

## Pre-Tag Development - 2026-03-31 to 2026-04-23

Initial construction before the first tagged desktop release.

### Added
- Project skeleton, Cargo workspace, Rust core crate, and professional repository setup.
- Early renderer experiments, including a Rust `wgpu` rendering direction before the app settled on Tauri plus React/Three.js for the desktop UI.
- Browser-mode fallback and file-loading compatibility work during the transition into the Tauri desktop shell.
- CYLview reference materials and a local desktop build script for early private testing.
- Chemistry controls for element color customization, measurement workflows, style controls, and the first iteration of the molecule side panel.

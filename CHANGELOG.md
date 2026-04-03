# Changelog

## [Unreleased]

### Planned
- Hydrogen visibility toggle
- Element colour customisation
- Distance / angle / dihedral labels
- PNG export
- Multi-frame XYZ trajectory playback
- Gaussian output file support (opt steps, frequencies)

---

## [0.1.0] — 2026-04-01

First working build. Open an `.xyz` file, see the molecule in 3-D.

### Added
- `cylview-core` Rust library — `Atom`, `Bond`, `Structure` data structures
- XYZ and PDB file I/O with automatic format detection
- Bond perception using covalent radii
- Tauri v2 desktop shell — standalone `.exe`, no installation required
- `load_molecule` Tauri command — parses file in Rust, returns centred atom/bond JSON
- Three.js real-time renderer — cylinder bonds and CPK atom spheres
- 4-point directional lighting matching the CYLview aesthetic
- OrbitControls — left drag = rotate, right drag = pan, scroll = zoom, R = reset
- Native OS file picker (`.xyz`, `.pdb`)
- Auto-fit camera to bounding box on load
- Info panel — molecule name, atom count, bond count

### Fixed
- Bond perception was using van der Waals radii, creating phantom bonds at ~4 Å;
  switched to covalent radii with a 1.3× tolerance

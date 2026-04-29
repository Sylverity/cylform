# Changelog

## [Unreleased]

### Planned
- Promote `1.0.0-rc.1` to `1.0.0` after Windows 11, Ubuntu/Debian, and macOS smoke testing.

### Added
- macOS Apple Silicon release packaging (`.app` bundle + `.dmg` installer).

---

## [1.0.0-rc.1] — 2026-04-26

Release candidate for the v1 publication-workflow milestone.

### Added
- Windows and Ubuntu/Debian release packaging through GitHub Releases.
- XYZ/PDB loading with stricter file safety limits and metadata disclosure.
- View overlay with floor/grid, backdrop, projection, lighting, fog, auto-rotate, and camera presets.
- Selection modes for view, measure, atom, bond, atom+bond, and label workflows.
- Distance, angle, dihedral, atom labels, editable saved label text, and label-aware PNG export.
- Session atom visibility controls, including hide selected atoms, show all atoms, hide H, and hide C-H H.
- Per-file presentation state in app data for labels, styles, hidden atoms, bond styles, view options, and saved poses.
- Recent files plus previous/next navigation through supported files in the current folder.
- Visual selected atom styling and simple bond restyling for full, TS, dative, interaction, and thin bonds.
- Native menu scaffold, single-instance behavior, and About dialog.

---

## [0.1.0] — 2026-04-01

First working build. Open an `.xyz` file, see the molecule in 3-D.

### Added
- `cylform-core` Rust library — `Atom`, `Bond`, `Structure` data structures
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

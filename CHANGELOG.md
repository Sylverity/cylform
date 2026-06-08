# Changelog

High-level project history for Cylform.

## [Unreleased]

### Planned
- Multi-frame XYZ trajectory playback, PDB residue-level colouring, and Gaussian output support.
- Expanded file-format support, animation authoring, and offline render export.

---

## [0.5.1] - 2026-06-08

UI polish and quality-of-life improvements.

### Added
- **Theme selector** in Settings → App with Dark, Light, and Auto options.
- Theme preference now persisted across sessions in the Rust backend.
- Hydrogen-visibility toggle grouped with the left-side mode selector (View, Measure, Atom, Bond, etc.).

### Changed
- **Dark mode is now the default** theme instead of system auto.
- **Window now launches maximized** by default.
- **Depth-cue slider range widened** so the fog effect is clearly visible across the full slider range.
- **Residue group limit raised** from 12 to 200 in the Molecules panel.
- **Dark-mode button contrast improved** for `.view-toggle`, `.appearance-mini-button`, and `.camera-preset-grid button`.

---

## [0.5.0] - 2026-05-28

First public release. Validated on Windows 11, Ubuntu/Debian, and macOS (Apple Silicon).

### Added
- Windows, Ubuntu/Debian, and macOS (Apple Silicon) release packaging through GitHub Releases.
- XYZ/PDB loading with source metadata disclosure (PDB atom/residue fields and CONECT bonds).
- Native file dialogs, recent files, previous/next folder navigation, and single-instance desktop behavior.
- Three.js real-time renderer with instanced cylinders, CPK spheres, CYLview Legacy / Cylform Glossy / Houkmol presets, 4-point lighting, and depth cue.
- View overlay with floor/grid, backdrop, projection, lighting, fog, auto-rotate, and camera presets.
- Selection modes for view, measure, atom, bond, atom+bond, and label workflows.
- Distance, angle, dihedral, and atom labels with editable saved text and label-aware PNG export.
- Atom visibility controls: hide selected, show all, hide hydrogens, hide C-H hydrogens, and element colour customisation.
- Visual selected-atom styling and bond restyling (normal, transition-state, dative, interaction, thin).
- Saved poses with thumbnail library stored in app data.
- Browser-style molecule tabs, session restoration, and per-file presentation state.
- Versioned persisted app settings (rendering, chemistry, interaction, files, app, shortcuts).
- Native desktop menu scaffold, Settings dialog, keyboard-shortcut dialog, and About dialog.
- Toasts, dismissible errors, collapsible side panels, and general UI polish.

### Changed
- Rebranded from CYLview-NG to Cylform with open-source readiness materials.

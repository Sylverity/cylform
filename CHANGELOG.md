# Changelog

High-level project history for Cylform.

## [Unreleased]

### Changed
- Bumped the development version to 0.6.1 across Rust, Tauri, frontend, and citation metadata.
- Removed the citation release date while 0.6.1 remains unreleased on main.
- Normalized repository metadata and source links to `https://github.com/Sylverity/cylform`.
- Updated the Apache 2.0 appendix copyright holder to Sylverity LLC.
- Documented dependency-license scan results in the README.

### Verified
- Confirmed Rust workspace packages inherit the `Apache-2.0` SPDX license declaration.
- Confirmed repository license, README license section and badge, and community health files remain present.
- Checked Rust and frontend dependency license metadata; no GPL or AGPL dependencies were found.

### Planned
- Multi-frame XYZ trajectory playback, PDB residue-level colouring, and Gaussian output support.
- Expanded file-format support, animation authoring, and offline render export.

---

## [0.6.0] - 2026-06-24

CYLview parity milestone — annotations, rendering refinements, frontend architecture cleanup, and release hardening.

### Added
- **Label font scale slider** (0.75–1.5×) in the Appearance panel.
- **Å / ° symbol units** toggle in Settings → Chemistry, persisted in the Rust backend.
- **Subscript / superscript** support in persistent labels (`<sub>`, `<sup>`) with rich canvas text for PNG export.
- **Label link lines** — dashed canvas overlay connecting persistent labels to their atom/bond anchors.
- **Bond size scale slider** (0.5–1.5×) in the Appearance panel.
- **Angle arc mesh** — orange 3D arc appears when 3 atoms are selected for angle measurement.
- **Houkmol profile tuning** — separate approximate publication-style profile with white background defaults, black normal bonds, glossy element-colored atoms, and shader-drawn black atom quadrants.
- **PNG export scale quick-access** dropdown in the View panel (1× / 2× / 4×).
- **CYLview render profile** promoted as a first-class rendering mode with persisted profile selection and snapshot tooling.
- **Keyboard shortcut defaults** consolidated around reusable shortcut definitions and documented material-preset shortcuts.
- **Render profile snapshot tooling** for comparing visual profiles and depth-cue behavior.

### Changed
- Refactored `MoleculeCanvas.tsx` (2820 → ~1790 lines) into focused domain modules under `components/molecule-canvas/`:
  `types.ts`, `labels.ts`, `visualStyle.ts`, `camera.ts`, `visibility.ts`, `benchmark.ts`, `geometry.ts`, `picking.ts`, `exportPng.ts`.
- `renderCurrentViewDataUrl` converted from a long `useCallback` closure to a pure exported function.
- CYLview depth cues now use profile-specific depth-cue math for clearer publication-style atom and bond separation.
- Material preset handling now uses centralized preset definitions for UI state, persistence, tests, and shortcuts.
- Frontend dependencies were refreshed to age-gated current stable releases, with pnpm configured to reject packages published in the last 14 days.

### Fixed
- **XYZ bond perception for crowded organic structures** — bounded inferred-bond cutoffs and valence-aware candidate filtering now reject long through-space C-C contacts while preserving ordinary covalent bonds.
- Fixed duplicate `capture-camera-pose` listener registration.
- Fixed missing `bondSizeScale` dependency in the mesh rebuild effect.
- Fixed material preset shortcuts and defaults so shortcut labels, persisted settings, and rendered presets stay aligned.

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

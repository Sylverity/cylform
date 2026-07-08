# Changelog

High-level project history for Cylform.

## [Unreleased]

- Moved shared frontend domain types and default settings out of `App.tsx` into dedicated `types/` modules so panels, canvas, and persistence no longer import from the root component.
- Deduplicated C-H hydrogen visibility and distance/angle formatting into shared `domain/` helpers used by `InfoPanel`, `AppearancePanel`, the canvas, and `App`, with new unit tests.
- Fixed Rust presentation-state normalization emitting an invalid `"paper"` backdrop tone for non-Houkmol camera defaults, and added shared TS/Rust golden fixture tests so default settings and camera state cannot drift between languages.
- Split `App.tsx` (2.4k → 1.8k lines) into focused domain hooks: `useAppSettings`, `useWorkspaceTabs`, `usePresentationStateAutosave`, and `usePoseLibrary`.
- Centralized the window custom events between App/panels and the canvas into a typed `canvasEvents.ts` with `dispatchCanvasEvent`/`listenToCanvasEvent` helpers.
- Isolated pure export-sequencing logic (frame range resolution, numbered PNG paths, filename sanitization) into `molecule-canvas/exportWorkflow.ts` with unit tests, removing the no-op `collisionSuffix`.
- Extracted Three.js scene construction into `molecule-canvas/sceneSetup.ts` (`createSceneContext` + dispose) and per-frame HTML overlay positioning into `molecule-canvas/screenLabels.ts` (`updateScreenOverlays`).
- Extracted instanced atom/bond mesh building into `molecule-canvas/moleculeBatches.ts` (`buildMoleculeBatches`), shrinking `MoleculeCanvas.tsx` from 2.5k to ~2k lines overall.

## [0.7.1] - 2026-07-01

Multi-frame foundation milestone.

### Added
- **Multi-frame XYZ loading** stores all frames in `Structure.frames` and exposes selected-frame coordinates through `load_molecule(frameIndex)`.
- **Frame metadata** parses each XYZ frame title/comment and optional energy/unit metadata.
- **Frame transport controls** in the View panel: frame slider, previous/next, play/pause, and playback speed.
- **Frame-aware rendering** preserves camera, projection, render profile, styles, and annotations while swapping frame coordinates.
- **Current-frame XYZ export** writes the selected frame as a standalone `.xyz` file.
- **Frame sequence PNG export** supports current frame, explicit ranges, every-Nth frame sampling, numbered PNG output, fixed camera, and fixed crop bounds.

### Changed
- Bumped the development version to 0.7.1 across Rust, Tauri, frontend, and citation metadata.
- Documentation now describes trajectory display/export rather than first-frame-only XYZ handling.

## [0.7.0] - 2026-07-01

Publication rendering pipeline milestone.

### Added
- **Shared publication render state** for molecule geometry, styles, render profile, camera/projection, lighting, background, depth cue, labels, link lines, angle arcs, residue groups, hidden atoms, and saved poses.
- **Deliberate export workflow** in the canvas with Viewport Exact, Publication Raster, and Experimental Progressive Path-Traced modes.
- **Publication export settings** for 1x/2x/4x/custom scale, manuscript/slide/poster/custom sizes, white/transparent/current background, crop-to-molecule padding, absolute scale, print-safe annotation scaling, preview thumbnails, and optional JSON metadata sidecars.
- **Publication raster renderer** with high-resolution offscreen rendering, supersampling, tiled canvas compositing, export shadows, ambient-occlusion style enhancement, depth-aware outline option, tone mapping, and annotation parity.
- **Experimental path-traced export** using `three-gpu-pathtracer` with draft/standard/final sample presets, progress, cancellation, shared Cylform render state, and annotation compositing after accumulation.
- Native metadata sidecar export command with JSON and `.json` validation.

### Changed
- Export actions now open the publication workflow instead of immediately saving the current viewport PNG.
- Bumped the development version to 0.7.0 across Rust, Tauri, frontend, and citation metadata.
- Normalized repository metadata and source links to `https://github.com/Sylverity/cylform`.
- Updated the Apache 2.0 appendix copyright holder to Sylverity LLC.
- Documented dependency-license scan results in the README.

### Verified
- Confirmed Rust workspace packages inherit the `Apache-2.0` SPDX license declaration.
- Confirmed repository license, README license section and badge, and community health files remain present.
- Checked Rust and frontend dependency license metadata; no GPL or AGPL dependencies were found.

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

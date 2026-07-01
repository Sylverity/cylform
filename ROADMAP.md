# Cylform Roadmap

This roadmap tracks completed milestones and upcoming feature work. The main project overview lives in [README.md](README.md).

## Released — v0.7.0

Cylform **0.7.0** turns export into a deliberate publication rendering pipeline.

### What's new in 0.7.0

- **Shared render state** — export snapshots molecule geometry, styles, render profile, camera/projection, lighting, background, depth cue, labels, link lines, angle arcs, residue groups, hidden atoms, and saved poses
- **Export modes** — Viewport Exact, Publication Raster, and Experimental Progressive Path-Traced export
- **Figure presets** — 1x/2x/4x/custom scale plus manuscript, slide, poster, viewport, and custom pixel sizes
- **Background and crop controls** — white, transparent, or current background with optional crop-to-molecule padding
- **Comparable figure scale** — optional pixels-per-angstrom absolute scale
- **Publication raster quality** — high-resolution offscreen rendering, supersampling, tiled canvas compositing, export shadows, ambient-occlusion style enhancement, depth-aware outlines, and tone mapping
- **Path-tracing experiment** — `three-gpu-pathtracer` integration with draft/standard/final accumulation, progress, cancel, and annotation compositing
- **Metadata sidecars** — optional `.cylform-render.json` export next to the PNG

## Released — v0.6.0

Cylform **0.6.0** adds the CYLview parity milestone: annotations, rendering refinements, frontend architecture cleanup, and release hardening.

### What's new in 0.6.0

- **Label font scale** — adjustable label size in the Appearance panel
- **Å / ° symbol units** — chemistry-style unit symbols with a Settings toggle
- **Subscript / superscript labels** — `<sub>` and `<sup>` support in persistent labels
- **Label link lines** — dashed lines connecting labels to their anchors
- **Bond size scale** — adjustable bond thickness
- **Angle arcs** — 3D arc visualization for angle measurements
- **Houkmol quadrant shading** — view-space quadrant tinting in the Houkmol preset
- **PNG export scale quick-access** — 1× / 2× / 4× dropdown in the View panel
- **CYLview render profile** — first-class rendering mode with persisted profile selection
- **Crowded-structure bond perception** — valence-aware filtering avoids long through-space bonds
- **Release hardening** — age-gated frontend dependency updates for safer installs
- **Frontend architecture cleanup** — `MoleculeCanvas.tsx` refactored into 9 focused domain modules

## Released — v0.5.0

Cylform **0.5.0** is publicly available with validated installers for Windows, Linux (Ubuntu/Debian), and macOS (Apple Silicon). All core desktop functionality is complete and tested across platforms.

### What's included

- **Core engine** — XYZ/PDB parsing, covalent-radius bond perception, frame-ready Rust structure model
- **Renderer** — Three.js instanced cylinders + CPK spheres, CYLview Legacy / Cylform Glossy / Houkmol presets, 4-point lighting, depth cue, floor grid, auto-rotate
- **Navigation** — Orbit / pan / zoom with damping, camera presets, auto-fit on load, saved poses with thumbnail library
- **Selection & measurement** — View, measure, atom, bond, and atom+bond modes; distance, angle, and dihedral labels
- **Annotations** — Persistent atom/bond/angle/dihedral annotations with editable text, per-file presentation state
- **Visibility** — Hydrogen toggle (show all / hide H / hide C-H), hide/show selected atoms, element colour customisation
- **Session** — Browser-style tabs, session restoration, recent files, previous/next file in folder
- **Export** — High-resolution PNG with visible annotations
- **Settings** — Versioned persisted app settings (rendering, chemistry, interaction, files, app, shortcuts)
- **Desktop** — Tauri v2 shell, native OS menus and file dialogs, platform-specific installers

## Up Next

- [ ] Multi-frame XYZ trajectory playback
- [ ] PDB residue-level colouring
- [ ] Gaussian output support (optimizations, frequencies, scans, IRC)
- [ ] Relative-energy plotting for scans and trajectories
- [ ] van der Waals / steric-contact analysis
- [ ] Animation authoring from saved poses
- [ ] OpenBabel-based expanded file-format support
- [ ] FFmpeg movie generation
- [ ] POV-Ray or equivalent high-end offline render export

# Cylform Roadmap

This roadmap tracks completed milestones and upcoming feature work. The main project overview lives in [README.md](README.md).

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

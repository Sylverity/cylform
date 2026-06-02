# Cylform Roadmap

This roadmap tracks near-term release work and longer-term feature parity goals. The main project overview lives in [README.md](README.md).

## Done

- [x] Core data structures — `Atom`, `Bond`, `Structure`
- [x] XYZ and PDB file I/O
- [x] Covalent-radius bond perception (no phantom bonds)
- [x] Tauri desktop shell — single standalone `.exe`
- [x] Three.js real-time renderer — instanced cylinders and tiny CPK atom spheres
- [x] White background, 4-point CYLview-style lighting
- [x] CYLview and Houkmol material presets
- [x] Orbit / pan / zoom camera with damping
- [x] Session view controls for floor/grid, backdrop, projection, lighting, fog, auto-rotate, and camera presets
- [x] Native OS file dialog
- [x] XYZ/PDB source metadata disclosure, including PDB atom/residue fields and CONECT bonds
- [x] Parser registry for built-in XYZ/PDB readers
- [x] Frame-ready Rust structure model for future trajectories
- [x] Auto-fit camera to loaded molecule
- [x] Hydrogen visibility toggle (hide/show H)
- [x] Atom visibility workflows for hiding selected atoms, showing all atoms, hiding all hydrogens, and hiding C-H hydrogens
- [x] Element colour customisation
- [x] Distance label on selected bond
- [x] Angle label on three selected atoms
- [x] Dihedral label on four selected atoms
- [x] Transient selection mode foundation for view, measure, atom, bond, and atom+bond workflows
- [x] Session-persistent annotations for atoms, distances, angles, and dihedrals
- [x] Editable annotation text for saved annotations
- [x] Selected atom styling and normal/TS/dative/interaction/thin bond restyling
- [x] Saved poses for reusable publication viewpoints
- [x] Recent files plus previous/next navigation within the current structure directory
- [x] Browser-style molecule tabs and session restoration
- [x] Global Pose Library with generated thumbnails stored in app data
- [x] Native desktop menu actions for opening, recent files, tab closing, export, Settings, DevTools, and standard edit/window roles
- [x] Versioned persisted app settings for rendering/export, chemistry defaults, shortcuts, file/session behavior, and diagnostics
- [x] Versioned per-file presentation state for annotations, styles, hidden atoms, material preset, custom bonds, and poses
- [x] PNG export with native save dialog
- [x] PNG export includes visible annotations

## V1 Release Target

- [ ] Private Windows 11 validation from locally built installer and standalone executable
- [ ] Private Ubuntu/Debian validation from locally built package and standalone binary
- [ ] Private macOS Apple Silicon validation from locally built app bundle and DMG
- [ ] Publish the first public `0.5.0` release only after Windows, Linux, and macOS validation pass

## Post-v1 Parity

- [ ] Multi-frame XYZ trajectory playback
- [ ] PDB residue-level colouring
- [ ] Gaussian output support for optimization steps, frequencies, scans, and IRC trajectories
- [ ] Relative-energy plotting for scans and trajectories
- [ ] van der Waals / steric-contact analysis
- [ ] Animation authoring from saved poses
- [ ] OpenBabel-based expanded file-format support
- [ ] FFmpeg movie generation
- [ ] POV-Ray or equivalent high-end offline render export

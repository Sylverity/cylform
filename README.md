# CYLview-NG

**Open-source molecular visualization inspired by Claude Y. Legault's CYLview**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.70%2B-orange.svg)](https://www.rust-lang.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey.svg)]()

A modern reimplementation of CYLview — the chemistry community's favourite tool for generating publication-quality 3-D molecular figures. Download the desktop app, open an `.xyz` or `.pdb` file, rotate, measure, style, and export.

---

## Project Guidance

Build CYLview-NG iteratively and stay tightly aligned with the product vision.

This is not a generic molecular viewer. It is a modern open-source successor to CYLview, with emphasis on:
- the distinctive cylindrical-bond aesthetic
- publication-quality default renders
- single-window usability
- chemistry-first workflows
- clean, readable 3D structure presentation

Rules:
- Work one step at a time.
- Complete the current milestone before advancing.
- Do not overengineer for hypothetical future needs.
- Do not jump to plugins, web, headless, or ecosystem features early.
- Keep the Rust core central and the UI shell thin.
- Treat rendering style as a core product feature, not later polish.
- Favor usable, testable increments over broad scaffolding.

## Rendering Architecture

Rust (`cylview-core`) handles all file I/O and chemistry. The desktop app sends atom/bond JSON to the React frontend via a single `load_molecule` Tauri command. Three.js (WebGL) renders the scene inside the Tauri WebView. This is the correct architecture; do not attempt to drive wgpu from the Tauri window handle.

## Current State

- Standalone Windows and Linux desktop builds
- XYZ and PDB file loading via native dialog
- Three.js scene: cylinder bonds (CYLview blue), CPK atom spheres, 4-point lighting
- OrbitControls: rotate / pan / zoom / reset
- Covalent-radius bond perception (no phantom bonds)
- In-canvas measurement guidance and a task-oriented Molecule / Measure / Style panel
- Explicit transient selection modes for view, measure, atom, bond, and atom+bond workflows

## Feature Parity Philosophy

CYLview-NG v1 targets the original CYLview family's core publication workflow: fast structure loading, clean real-time viewing, measurements, labels, styling, saved presentation state, and high-quality image export. Large computational chemistry modules such as Gaussian trajectory playback, frequency animation, steric-contact analysis, and movie generation are important parity goals, but they belong after the viewer, annotation, and styling model is stable.

---

## Features

- **Friendly desktop downloads** — Windows installers and Ubuntu/Debian packages from GitHub Releases
- **Real-time 3-D rendering** — WebGL via Three.js, smooth 60 fps orbit/pan/zoom
- **CYLview visual style** — glossy cyan cylinders, tiny CPK atom spheres, white background, 4-point lighting
- **Accurate bond perception** — covalent-radius thresholds, no phantom long-range bonds
- **Native file dialogs** — open `.xyz` and `.pdb` files through the OS file picker
- **Hydrogen visibility toggle** — hide/show H atoms for cleaner structure inspection
- **Selection modes** — switch between view-only, measurement, atom selection, bond selection, and atom+bond selection
- **Element colour customisation** — adjust atom colours per element for the current molecule view
- **Interactive measurements** — click a bond for distance, three atoms for angle, or four atoms for dihedral
- **PNG export** — save the current view to a chosen `.png` path with a native desktop save dialog
- **Rust file I/O** — fast, reliable parsing with automatic format detection

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  Tauri desktop shell (Rust)                  │
│  • Native window, file dialogs               │
│  • load_molecule command                     │
│     reads file → perceives bonds             │
│     centres coordinates → sends JSON         │
└────────────────────┬─────────────────────────┘
                     │  Tauri invoke (JSON)
┌────────────────────▼─────────────────────────┐
│  React + TypeScript frontend                 │
│  • Three.js / WebGL renders to <canvas>      │
│  • OrbitControls — rotate / pan / zoom       │
│  • CPK colour table, atom + bond meshes      │
│  • ResizeObserver keeps canvas crisp         │
└──────────────────────────────────────────────┘
```

### Technology stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| File I/O & chemistry | `cylview-core` Rust library |
| 3-D rendering | Three.js (WebGL) |
| UI framework | React 19 + TypeScript + Vite |
| Build | Cargo + npm |

---

## Download & Install

For normal use, download CYLview-NG from the project’s [GitHub Releases](https://github.com/Summykai/CYLview-NG/releases). You do not need Rust, Node.js, Tauri, WSL, or developer tools to run release builds.

### Windows 10/11

Download the newest Windows installer from GitHub Releases:

1. Recommended: `CYLview-NG-setup.exe`
2. Alternative: `CYLview-NG.msi`
3. Portable fallback: `cylview-ng.exe`

Run the installer, then launch **CYLview-NG** from the Start menu. Early open-source builds may be unsigned, so Windows SmartScreen may ask for confirmation on first launch. Choose **More info** → **Run anyway** only if you downloaded the file from the official project release page.

### Ubuntu / Debian Linux

Download the newest Debian package from GitHub Releases:

```bash
sudo apt install ./CYLview-NG_0.1.0_amd64.deb
```

Then launch **CYLview-NG** from your application menu, or run:

```bash
cylview-ng
```

Advanced Linux fallbacks may also be published, such as an AppImage or standalone `cylview-ng` binary. If using one of those, mark it executable first with `chmod +x`.

See [docs/INSTALL.md](docs/INSTALL.md) for step-by-step install, uninstall, and troubleshooting notes.

---

## Development Setup

These steps are only for contributors building CYLview-NG from source. Users should install a release build instead.

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.70 or later
- [Node.js](https://nodejs.org/) 20 LTS or later
- Tauri system dependencies — see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

Ubuntu / Debian packages for Tauri:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```

### Development

```bash
cargo tauri dev
```

`cargo tauri dev` starts the Vite dev server automatically on both Windows and Linux.

### Local release build

Run from the repo root:

```bash
npm --prefix desktop/src-ui run build:desktop
```

For repeat local builds when `node_modules` is already present:

```bash
npm --prefix desktop/src-ui run build:desktop:fast
```

This cross-platform convenience script builds the standalone desktop executable and refreshes a repo-root copy of the platform-specific binary:

- Windows: `target/release/cylview-ng.exe` and `./cylview-ng.exe`
- Linux: `target/release/cylview-ng` and `./cylview-ng`

If you also want installer bundles, use the full Tauri packaging command separately:

```bash
cargo tauri build
```

Output:

```
Windows:
target/release/cylview-ng.exe                         ← standalone exe
target/release/bundle/nsis/CYLview-NG_*-setup.exe    ← NSIS installer
target/release/bundle/msi/CYLview-NG_*_x64_en-US.msi ← MSI installer

Linux:
target/release/cylview-ng                             ← standalone binary
target/release/bundle/appimage/*.AppImage            ← AppImage bundle
target/release/bundle/deb/*.deb                      ← Debian package
```

---

## Usage

| Action | Control |
|---|---|
| Open file | Click **Open File** → pick `.xyz` or `.pdb` |
| Rotate | Left-click + drag |
| Pan | Right-click + drag |
| Zoom | Scroll wheel |
| Reset view | **Reset View** button, or press **R** |
| Toggle hydrogens | **Hide H / Show H** button |
| Adjust atom colours | Use the **Colours** controls in the side panel |
| Measure bond distance | Click a bond |
| Measure bond angle | Click three atoms progressively |
| Measure dihedral angle | Click four atoms progressively |
| Export PNG | Click **Export PNG** → choose a `.png` save location |

---

## Project layout

```
CYLviewClone/
├── Cargo.toml                   # Workspace
├── Cargo.lock
│
├── crates/
│   └── core/                    # cylview-core — pure Rust library
│       └── src/
│           ├── lib.rs
│           ├── molecule.rs      # Atom, Bond, Structure; bond perception
│           ├── io.rs            # XYZ + PDB readers/writers
│           ├── camera.rs        # Orbital camera maths
│           ├── picker.rs        # Selection framework
│           └── render/          # wgpu rendering engine (future use)
│
├── desktop/
│   ├── src-tauri/               # Tauri Rust backend
│   │   └── src/main.rs          # load_molecule command, app setup
│   └── src-ui/                  # React frontend
│       └── src/
│           ├── App.tsx
│           └── components/
│               ├── MoleculeCanvas.tsx   # Three.js scene
│               ├── Toolbar.tsx
│               └── InfoPanel.tsx
│
├── docs/
│   └── references/              # CYLview manuals, reference image, sample structures
└── scripts/
    ├── build-desktop.mjs        # Cross-platform standalone desktop build
    └── build-desktop.ps1        # Windows PowerShell wrapper retained for convenience
```

---

## Roadmap

### Done
- [x] Core data structures — `Atom`, `Bond`, `Structure`
- [x] XYZ and PDB file I/O
- [x] Covalent-radius bond perception (no phantom bonds)
- [x] Tauri desktop shell — single standalone `.exe`
- [x] Three.js real-time renderer — glossy cyan cylinders, tiny CPK atom spheres
- [x] White background, 4-point CYLview-style lighting
- [x] Orbit / pan / zoom camera with damping
- [x] Native OS file dialog
- [x] Auto-fit camera to loaded molecule
- [x] Hydrogen visibility toggle (hide/show H)
- [x] Element colour customisation
- [x] Distance label on selected bond
- [x] Angle label on three selected atoms
- [x] Dihedral label on four selected atoms
- [x] Transient selection mode foundation for view, measure, atom, bond, and atom+bond workflows
- [x] PNG export with native save dialog

### V1 Release Target
- [ ] Persistent label mode built on the explicit selection-mode foundation
- [ ] Persistent labels for atoms, distances, angles, dihedrals, and custom text
- [ ] Basic per-atom and per-bond styling, including selected-region style application
- [ ] Hide/show selected atoms, show all atoms, hide all hydrogens, and hide C-H hydrogens
- [ ] Add, remove, and restyle simple bond types such as full, TS, dative, interaction, and thin
- [ ] Saved poses for reusable publication viewpoints
- [ ] Recent files plus previous/next navigation within the current structure directory
- [ ] Centralized per-file presentation state for labels, styles, hidden atoms, custom bonds, and poses

### Post-v1 Parity
- [ ] Multi-frame XYZ trajectory playback
- [ ] PDB residue-level colouring
- [ ] Gaussian output support for optimization steps, frequencies, scans, and IRC trajectories
- [ ] Relative-energy plotting for scans and trajectories
- [ ] van der Waals / steric-contact analysis
- [ ] Animation authoring from saved poses
- [ ] OpenBabel-based expanded file-format support
- [ ] FFmpeg movie generation
- [ ] POV-Ray or equivalent high-end offline render export

---

## License

Apache License 2.0. See [LICENSE](LICENSE).

CYLview-NG is an independent open-source project with no affiliation to the original CYLview by Claude Y. Legault.

---

## Acknowledgements

- **Claude Y. Legault** — creator of the original CYLview and its distinctive visual language
- **The Tauri team** — for making lean native desktop apps with web frontends practical
- **Three.js contributors** — for the WebGL rendering library

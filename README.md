# CYLview-NG

**Open-source molecular visualization inspired by Claude Y. Legault's CYLview**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.70%2B-orange.svg)](https://www.rust-lang.org)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)]()

A modern reimplementation of CYLview — the chemistry community's favourite tool for generating publication-quality 3-D molecular figures. Double-click the `.exe`, open an `.xyz` file, rotate and inspect.

---

## Features

- **Standalone `.exe`** — no installation, no dependencies; just run it
- **Real-time 3-D rendering** — WebGL via Three.js, smooth 60 fps orbit/pan/zoom
- **CYLview visual style** — glossy cyan cylinders, tiny CPK atom spheres, white background, 4-point lighting
- **Accurate bond perception** — covalent-radius thresholds, no phantom long-range bonds
- **Native file dialogs** — open `.xyz` and `.pdb` files through the OS file picker
- **Hydrogen visibility toggle** — hide/show H atoms for cleaner structure inspection
- **Interactive measurements** — click a bond for distance, click three atoms for angle
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

## Quick start

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.70 or later
- [Node.js](https://nodejs.org/) 20 LTS or later
- Tauri system dependencies — see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

### Development

```bash
# 1. Install frontend dependencies
cd desktop/src-ui
npm install

# 2. Start dev server + Tauri window (hot-reload)
cd ..
cargo tauri dev
```

### Release build

Run from the repo root:

```bash
cd desktop/src-ui && npm run build && cd ../..
cargo tauri build
```

Or use the automated Windows build script from the repo root:

```powershell
./scripts/build-desktop.ps1
```

For repeat local builds when `node_modules` is already present:

```powershell
./scripts/build-desktop.ps1 -SkipFrontendInstall
```

This script builds the standalone desktop executable and refreshes both:

- `target/release/cylview-ng.exe`
- `CYLview-NG.exe` at the repo root

If you also want installer bundles (`nsis` / `msi`), keep using the full Tauri packaging command separately:

```powershell
cd desktop/src-ui
npm run tauri-build
```

Output:

```
target/release/cylview-ng.exe                          ← standalone exe
target/release/bundle/nsis/CYLview-NG_*-setup.exe     ← NSIS installer
target/release/bundle/msi/CYLview-NG_*_x64_en-US.msi  ← MSI installer
CYLview-NG.exe                                        ← auto-copied repo-root executable
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
| Measure bond distance | Click a bond |
| Measure bond angle | Click three atoms progressively |
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
    └── build-desktop.ps1        # Builds standalone exe and copies to repo root
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
- [x] Distance label on selected bond
- [x] Angle label on three selected atoms
- [x] PNG export with native save dialog

### Next
- [ ] Element colour customisation
- [ ] Dihedral label on four selected atoms
- [ ] Multi-frame XYZ trajectory playback
- [ ] PDB residue-level colouring
- [ ] Gaussian output file support (opt steps, frequencies)

---

## License

Apache License 2.0. See [LICENSE](LICENSE).

CYLview-NG is an independent open-source project with no affiliation to the original CYLview by Claude Y. Legault.

---

## Acknowledgements

- **Claude Y. Legault** — creator of the original CYLview and its distinctive visual language
- **The Tauri team** — for making lean native desktop apps with web frontends practical
- **Three.js contributors** — for the WebGL rendering library

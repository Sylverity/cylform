# Cylform

**Open-source molecular visualization inspired by Claude Y. Legault's CYLview**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.70%2B-orange.svg)](https://www.rust-lang.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

A modern reimplementation of CYLview — the chemistry community's favourite tool for generating publication-quality 3-D molecular figures. Download the desktop app, open an `.xyz` or `.pdb` file, rotate, measure, style, and export.

---

## Project Guidance

Build Cylform iteratively and stay tightly aligned with the product vision.

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

Rust (`cylform-core`) handles all file I/O and chemistry. The desktop app sends atom/bond JSON to the React frontend via a single `load_molecule` Tauri command. Three.js (WebGL) renders the scene inside the Tauri WebView.

## Current State

- Standalone Windows and Linux desktop builds
- XYZ and PDB file loading via native dialog
- Three.js scene: cylinder bonds (CYLview blue), CPK atom spheres, 4-point lighting
- OrbitControls: rotate / pan / zoom / reset
- In-canvas View overlay for floor/grid, backdrop, projection, lighting, fog, auto-rotate, and camera presets
- Covalent-radius bond perception (no phantom bonds)
- XYZ/PDB metadata awareness for titles, energies, PDB atom/residue fields, multi-frame/model detection, and PDB CONECT bonds
- In-canvas measurement guidance and a task-oriented Molecule / Measure / Style panel
- Explicit transient selection modes for view, measure, atom, bond, and atom+bond workflows
- Session-persistent atom and measurement labels with show/hide/delete controls
- Session atom visibility workflows for hiding selected atoms, showing all atoms, hiding all hydrogens, and hiding C-H hydrogens
- Centralized per-file presentation state, saved poses, recent files, selected styling, and visual bond restyling
- Native desktop menu scaffold for File / Edit / View / Window / Help

## Feature Parity Philosophy

Cylform v1 targets the original CYLview family's core publication workflow: fast structure loading, clean real-time viewing, measurements, labels, styling, saved presentation state, and high-quality image export. Large computational chemistry modules such as Gaussian trajectory playback, frequency animation, steric-contact analysis, and movie generation are important parity goals, but they belong after the viewer, annotation, and styling model is stable.

---

## Features

- **Friendly desktop downloads** — Windows installers and Ubuntu/Debian packages from GitHub Releases
- **Real-time 3-D rendering** — WebGL via Three.js, smooth 60 fps orbit/pan/zoom
- **CYLview visual style** — glossy cyan cylinders, tiny CPK atom spheres, white background, 4-point lighting
- **View controls overlay** — floor/grid reference plane, backdrop tones, projection mode, lighting moods, fog, auto-rotate, and camera presets
- **Accurate bond perception** — covalent-radius thresholds, no phantom long-range bonds
- **Source metadata disclosure** — preserves common XYZ/PDB titles, energies, PDB atom/residue fields, frame/model counts, parser notes, and explicit PDB `CONECT` bonds
- **Native file dialogs** — open `.xyz` and `.pdb` files through the OS file picker
- **Atom visibility controls** — hide selected atoms, show all atoms, hide all hydrogens, or hide only C-H hydrogens for cleaner figures
- **Selection modes** — switch between view-only, measurement, atom selection, bond selection, and atom+bond selection
- **Session labels** — add persistent atom, distance, angle, and dihedral labels for the current molecule session
- **Saved presentation state** — labels, visibility, styles, poses, and view choices are stored in app data per file
- **Saved poses and recent files** — recall publication camera views and move between supported files in a folder
- **Atom style controls** — adjust per-element atom colours and global atom size for the current molecule view
- **Selected styling** — apply local atom colours/sizes and visual bond styles for selected regions
- **Interactive measurements** — click a bond for distance, three atoms for angle, or four atoms for dihedral
- **PNG export** — save the current view to a chosen `.png` path with a native desktop save dialog
- **Desktop menu scaffold** — standard File / Edit / View / Window / Help menus, with Quit and About wired
- **Rust file I/O** — fast, reliable parsing with automatic format detection

---

## File Safety

Cylform treats molecule files as inert data. Opening an `.xyz` or `.pdb` file does not execute embedded scripts, shell commands, job directives, or macros. The current loaders read text records, parse atoms, coordinates, and common source metadata in Rust, perceive or read bonds locally, and send geometry data to the renderer.

For v1 stability, single-structure loading is intentionally bounded: files larger than 25 MB and structures larger than 10,000 atoms are rejected with a clear error. Larger trajectory and computational-output workflows will get separate streaming/lazy-loading designs later.

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
| File I/O & chemistry | `cylform-core` Rust library |
| 3-D rendering | Three.js (WebGL) |
| UI framework | React 19 + TypeScript + Vite |
| Build | Cargo + pnpm |

---

## Download & Install

For normal use, download Cylform from the project’s [GitHub Releases](https://github.com/Sylverity/Cylform/releases). You do not need Rust, Node.js, Tauri, WSL, or developer tools to run release builds.

### Windows 10/11

Download the newest Windows installer from GitHub Releases:

1. Recommended: `Cylform-setup.exe`
2. Alternative: `Cylform.msi`
3. Portable fallback: `cylform.exe`

Run the installer, then launch **Cylform** from the Start menu. Early open-source builds may be unsigned, so Windows SmartScreen may ask for confirmation on first launch. Choose **More info** → **Run anyway** only if you downloaded the file from the official project release page.

### Ubuntu / Debian Linux

Download the newest Debian package from GitHub Releases:

```bash
sudo apt install ./Cylform_1.0.0-rc.1_amd64.deb
```

Then launch **Cylform** from your application menu, or run:

```bash
cylform
```

Advanced Linux fallbacks may also be published, such as an AppImage or standalone `cylform` binary. If using one of those, mark it executable first with `chmod +x`.

See [docs/INSTALL.md](docs/INSTALL.md) for step-by-step install, uninstall, and troubleshooting notes.

### macOS (Apple Silicon)

Download the newest macOS release from GitHub Releases:

1. Download `Cylform_*_aarch64.dmg`.
2. Open the DMG and drag **Cylform** into your **Applications** folder.
3. Launch **Cylform** from Launchpad or Spotlight (`Cmd + Space`, then type "Cylform").

#### First-launch Gatekeeper note

Early open-source builds are not code-signed. On first launch, macOS Gatekeeper may show a warning. Right-click the app icon and choose **Open**, or go to **System Settings → Privacy & Security** and click **Open Anyway**.

#### Uninstall on macOS

Drag **Cylform** from **Applications** to the Trash, then empty the Trash.

---

## Development Setup

These steps are only for contributors building Cylform from source. Users should install a release build instead.

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
pnpm --dir desktop/src-ui run build:desktop
```

For repeat local builds when `node_modules` is already present:

```bash
pnpm --dir desktop/src-ui run build:desktop:fast
```

This cross-platform convenience script builds the standalone desktop executable and refreshes a repo-root copy of the platform-specific binary:

- Windows: `target/release/cylform.exe` and `./cylform.exe`
- Linux: `target/release/cylform` and `./cylform`

If you also want installer bundles, use the full Tauri packaging command separately:

```bash
cargo tauri build
```

Output:

```
Windows:
target/release/cylform.exe                         ← standalone exe
target/release/bundle/nsis/Cylform_*-setup.exe    ← NSIS installer
target/release/bundle/msi/Cylform_*_x64_en-US.msi ← MSI installer

Linux:
target/release/cylform                             ← standalone binary
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
| Previous / next file | Use **Previous** / **Next** after opening a file in a folder |
| Change camera preset | Use **View** overlay → **Front**, **Top**, **Right**, or **Iso** |
| Toggle floor/grid/backdrop | Use the left-side **View** overlay |
| Toggle perspective/orthographic | Use **View** overlay → **Projection** |
| Adjust lighting/fog/auto-rotate | Use the left-side **View** overlay |
| Cycle hydrogen visibility | **Hide H / Hide C-H / Show H** button, or press **H** |
| Choose hydrogen mode | Use **Style** → **Show H**, **Hide H**, or **Hide C-H H** |
| Hide selected atoms | Switch to **Atom** or **Atom+Bond**, select atoms, then click **Hide Selected Atoms** |
| Show hidden atoms | Use **Style** → **Show All Atoms** |
| Change selection mode | Use the toolbar mode buttons, or press **V**, **M**, **A**, **B**, **Z**, or **L** |
| Adjust atom style | Use **Style** in the side panel for element colours and atom size |
| Measure bond distance | Click a bond |
| Measure bond angle | Click three atoms progressively |
| Measure dihedral angle | Click four atoms progressively |
| Add atom label | Switch to **Label** mode, then click an atom |
| Add measurement label | Measure a distance/angle/dihedral, then click **Add Label** in the side panel |
| Manage labels | Use **Labels** in the side panel to show, hide, delete, or clear session labels |
| Save a pose | Use **Poses** → **Save pose** in the side panel |
| Reopen recent file | Use **Files** in the side panel |
| Export PNG | Click **Export PNG**, or press **Ctrl+E** |
| Quit | Use **File → Quit Cylform** |
| About | Use **Help → About Cylform** |

---

## Project layout

```
Cylform/
├── Cargo.toml                   # Workspace
├── Cargo.lock
│
├── crates/
│   └── core/                    # cylform-core — pure Rust library
│       └── src/
│           ├── lib.rs
│           ├── molecule.rs      # Atom, Bond, Structure; bond perception
│           ├── io.rs            # XYZ + PDB readers/writers
│           ├── camera.rs        # Orbital camera maths
│           └── picker.rs        # Selection framework
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
- [x] Session view controls for floor/grid, backdrop, projection, lighting, fog, auto-rotate, and camera presets
- [x] Native OS file dialog
- [x] XYZ/PDB source metadata disclosure, including PDB atom/residue fields and CONECT bonds
- [x] Auto-fit camera to loaded molecule
- [x] Hydrogen visibility toggle (hide/show H)
- [x] Atom visibility workflows for hiding selected atoms, showing all atoms, hiding all hydrogens, and hiding C-H hydrogens
- [x] Element colour customisation
- [x] Distance label on selected bond
- [x] Angle label on three selected atoms
- [x] Dihedral label on four selected atoms
- [x] Transient selection mode foundation for view, measure, atom, bond, and atom+bond workflows
- [x] Session-persistent labels for atoms, distances, angles, and dihedrals
- [x] Editable label text for saved labels
- [x] Selected atom styling and visual bond restyling
- [x] Saved poses for reusable publication viewpoints
- [x] Recent files plus previous/next navigation within the current structure directory
- [x] Centralized per-file presentation state for labels, styles, hidden atoms, custom bonds, and poses
- [x] PNG export with native save dialog
- [x] PNG export includes visible labels

### V1 Release Target
- [ ] Windows 11 and Ubuntu/Debian smoke test from `1.0.0-rc.1` GitHub Release artifacts
- [ ] Promote `1.0.0-rc.1` to `1.0.0` after release-candidate smoke testing

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

Cylform is an independent open-source project with no affiliation to the original CYLview by Claude Y. Legault.

---

## Acknowledgements

- **Claude Y. Legault** — creator of the original CYLview and its distinctive visual language
- **The Tauri team** — for making lean native desktop apps with web frontends practical
- **Three.js contributors** — for the WebGL rendering library

# Cylform

**Publication-quality molecular figure preparation**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.70%2B-orange.svg)](https://www.rust-lang.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

Cylform is a desktop molecular figure editor. Its default CYLView Legacy preset recreates the colored cylindrical-stick style used in natural products chemistry publications — cyan carbon framework, orange oxygen endpoints, pale hydrogen termini, 4-point lighting, and depth cues — for figures that remain readable in black-and-white print.

Open a structure, set the view, measure, annotate, export a PNG.

> Cylform is an independent project and is not affiliated with or endorsed by the original CYLview.

---

## Quick Start

1. **Download** the latest release for your platform from [GitHub Releases](#)
2. **Open** an `.xyz` or `.pdb` file via drag-and-drop or the file dialog
3. **Rotate** with left-drag, **pan** with right-drag, **zoom** with scroll
4. **Measure** distances, angles, and dihedrals by clicking atoms
5. **Export** a high-resolution PNG for your manuscript

See [docs/KEYBOARD_SHORTCUTS.md](docs/KEYBOARD_SHORTCUTS.md) for the current default shortcuts.

---

## What's Included

- **CYLView Legacy rendering** — colored cylindrical-stick default with cyan carbon framework, orange oxygen endpoints, and pale gray hydrogens; CYLform Glossy and Houkmol (with quadrant shading) alternatives for print
- **3-D navigation** — orbit, pan, zoom with damping; camera presets (front, top, right, iso)
- **Measurements** — distance, angle, dihedral with persistent labels, angle arcs, and Å / ° symbol units
- **Annotations** — persistent atom/bond labels with subscript / superscript support and adjustable font scale
- **Session state** — saved views, annotations, styles per file
- **Tabs** — multiple structures open simultaneously
- **PNG export** — label-aware, high resolution, with quick-access export scale

See [ROADMAP.md](ROADMAP.md) for completed milestones and upcoming features.

---

## Performance Expectations

Cylform's normal release path is intentionally conservative: single structures are capped at 50,000 atoms while large-file behavior is validated across more machines and driver stacks. That cap is a product safety limit, not the renderer's measured ceiling.

The developer benchmark can raise the internal atom limit and stress the real desktop app with generated XYZ files. On a single comparable WSL2/WSLg development benchmark run, using the command documented in [docs/BENCHMARKING.md](docs/BENCHMARKING.md), the current large-scene renderer produced:

| atoms | perceived bonds | passive FPS / p95 | interaction FPS / p95 |
|---:|---:|---:|---:|
| 50,000 | 154,052 | 49.0 / 23 ms | 40.9 / 26 ms |
| 100,000 | 310,534 | 39.9 / 27 ms | 29.5 / 40 ms |
| 150,000 | 438,169 | 36.1 / 30 ms | 26.4 / 40 ms |
| 250,000 | 782,621 | 34.6 / 35 ms | 25.8 / 41 ms |
| 350,000 | 1,029,184 | 35.2 / 31 ms | 26.5 / 39 ms |
| 500,000 | 1,648,764 | 33.8 / 53 ms | 27.1 / 41 ms |

Benchmarks run on WSL2/WSLg with the benchmark environment selecting the RTX 4070 Ti through D3D12/Mesa and the current default `CYLview` material preset. Your numbers will vary by GPU, driver, material preset, and molecule topology.

For reproducible performance claims, record the exact benchmark command, platform, GPU/renderer path, atom count, perceived bond count, passive FPS/p95, interaction FPS/p95, and per-phase orbit/pan/zoom results.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  cylform-core (Rust)                         │
│  • Parser registry for XYZ/PDB text files    │
│  • Frame-ready Structure + static bonds      │
│  • Bond perception, metadata, bond kinds     │
└────────────────────┬─────────────────────────┘
                     │
┌────────────────────▼─────────────────────────┐
│  Tauri desktop shell (Rust)                  │
│  • Native window, file dialogs, app data     │
│  • load_molecule command                     │
│  • Versioned per-file presentation state     │
└────────────────────┬─────────────────────────┘
                     │  Tauri invoke (JSON)
┌────────────────────▼─────────────────────────┐
│  React + TypeScript frontend                 │
│  • Three.js / WebGL renders to <canvas>      │
│  • OrbitControls — rotate / pan / zoom       │
│  • Instanced atom and bond rendering         │
│  • Annotations, material presets, PNG export │
│  • ResizeObserver keeps canvas crisp         │
└──────────────────────────────────────────────┘
```

This keeps computational file handling in Rust and interactive presentation in the desktop UI. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for contributor-facing details.

### Technology Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| File I/O & chemistry | `cylform-core` Rust library |
| 3-D rendering | Three.js (WebGL) |
| UI framework | React 19 + TypeScript + Vite |
| Build | Cargo + pnpm |

---

## Download & Install

For normal use, download Cylform from the project's GitHub Releases page. You do not need Rust, Node.js, Tauri, WSL, or developer tools to run release builds.

### Windows 10/11

Download the newest Windows installer from GitHub Releases:

1. Recommended: `Cylform-setup.exe`
2. Portable fallback: `cylform.exe`

Run the installer, then launch **Cylform** from the Start menu. Release builds may be unsigned during early access, so Windows SmartScreen may ask for confirmation on first launch.

### Ubuntu / Debian Linux

```bash
sudo apt install ./Cylform_*_amd64.deb
```

Then launch **Cylform** from your application menu, or run `cylform`.

### macOS (Apple Silicon)

1. Download `Cylform_*_aarch64.dmg`
2. Open the DMG and drag **Cylform** into your **Applications** folder
3. Launch from Launchpad or Spotlight

Early open-source builds are not code-signed. On first launch, right-click the app icon and choose **Open**, or go to **System Settings → Privacy & Security** and click **Open Anyway**.

See [docs/INSTALL.md](docs/INSTALL.md) for detailed install, uninstall, and troubleshooting notes.

---

## Development Setup

These steps are only for contributors building Cylform from source.

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.70 or later
- [Node.js](https://nodejs.org/) 20 LTS or later
- Tauri system dependencies — see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

Ubuntu / Debian packages for Tauri:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Build from source

```bash
# Clone the repository
git clone https://github.com/Summykai/Cylform.git
cd cylform

# Install frontend dependencies
cd desktop/src-ui
pnpm install
cd ../..

# Build the desktop app
cd desktop/src-ui
pnpm run build:desktop
```

The build produces platform-specific artifacts in `desktop/src-tauri/target/release/bundle/`.

### Development server

```bash
cd desktop/src-ui
pnpm run tauri dev
```

---

## File Safety

Cylform parses `.xyz` and `.pdb` files as plain text. No embedded scripts or macros are executed.

---

## License

Apache 2.0. See [LICENSE](LICENSE).

---

## Citation

If you use Cylform in your research, please cite it as below. The same metadata is available in [CITATION.cff](CITATION.cff) and through GitHub's **Cite this repository** menu.

```yaml
cff-version: 1.2.0
message: "If you use Cylform in your research, please cite it as below."
type: software
title: "Cylform: A modern open-source molecular visualization tool"
version: "0.5.1"
authors:
  - family-names: "Marston"
    given-names: "Sumner K."
    affiliation: "Sylverity Research"
  - name: "Sylverity Research"
repository-code: "https://github.com/Summykai/Cylform"
license: Apache-2.0
date-released: 2026-05-28
```

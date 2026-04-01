# CYLview-NG

**"The CYLview aesthetic, reimagined for the GPU era"**

A GPU-native, open-source molecular visualization tool inspired by Claude Y. Legault's original CYLview.

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Status](https://img.shields.io/badge/status-Phase%201%20Development-orange.svg)

## Vision

Preserve the signature characteristics that made CYLview indispensable for natural product chemistry:
- **Instant-on usability** — no configuration required
- **Publication-quality defaults** — beautiful out of the box
- **Single-window workflow** — no scattered toolbars
- **Cylindrical bond aesthetic** — the "CYLview look"

While eliminating legacy constraints:
- Replace POV-Ray offline rendering with **real-time GPU raytracing**
- Replace Tkinter with **modern reactive UI**
- Replace single-threaded geometry generation with **GPU mesh shaders**
- Add **native Apple Silicon**, **Windows ARM**, and **Linux** support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Desktop App │  │  Web Viewer │  │  Headless/Server    │  │
│  │  (Tauri)     │  │  (WASM+WebGPU)│  │  (CLI/API)         │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         └─────────────────┴────────────────────┘            │
│                    Unified Rust Core                         │
├─────────────────────────────────────────────────────────────┤
│                      RENDERING ENGINE                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  wgpu (WebGPU-native) → Vulkan/Metal/DX12/Software      │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │ │
│  │  │ Real-time   │  │ Path-traced │  │ Hybrid RT       │  │ │
│  │  │ Raster      │  │ (Offline)   │  │ (RTX/DXR/Metal) │  │ │
│  │  │ (60-240fps) │  │ (4K/8K)     │  │ (30-60fps AO)   │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                     MOLECULAR CORE                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ chemfiles   │  │ Bond perception│  │ Force field      │  │
│  │ (I/O)       │  │ & topology   │  │ (UFF/MMFF quick)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **Core Language** | Rust |
| **GPU API** | wgpu (WebGPU) |
| **UI Framework** | Tauri (Rust) + Svelte/TypeScript |
| **Compute Shaders** | WGSL |
| **File I/O** | chemfiles (Rust bindings) |
| **Build System** | Cargo + cargo-bundle |
| **Plugin System** | WASM (WASI) |

## Development Roadmap

### Phase 1: Core (Months 1-6) 🚧 *In Progress*
- [ ] wgpu renderer with cylinder instancing
- [ ] chemfiles integration (40+ formats)
- [ ] Tauri desktop shell (Windows, macOS, Linux)
- [ ] Basic measurement and selection tools

### Phase 2: Polish (Months 7-12)
- [ ] Hybrid RT mode (RTX/Metal)
- [ ] Animation and trajectory support
- [ ] Custom styling system
- [ ] WASM web build

### Phase 3: Ecosystem (Months 13-18)
- [ ] Plugin API (WASI)
- [ ] Python bindings (PyO3)
- [ ] Jupyter notebook integration
- [ ] Database connectors (PDB, PubChem)

## Getting Started

### Prerequisites
- Rust 1.70+ (`rustup update`)
- Node.js 18+ (for Tauri frontend)
- Git

### Build
```bash
# Clone the repository
git clone https://github.com/Summykai/CYLview-NG.git
cd CYLview-NG

# Build the core library
cargo build --release -p cylview-core

# Build and run the desktop app
cargo tauri dev
```

## Performance Targets

| Metric | Target Hardware | Performance |
|--------|----------------|-------------|
| 1,000 atoms | Apple M1 (integrated) | 240 fps |
| 10,000 atoms | RTX 3060 Laptop | 120 fps |
| 100,000 atoms | RTX 4090 Desktop | 60 fps |
| 1,000,000 atoms | RTX 4090 + DLSS | 30 fps |
| 8K image export | RTX 4090 (path tracer) | < 10 seconds |

## License & Attribution

- **Code:** Apache 2.0
- **Assets:** CC-BY-SA
- **Attribution:** "CYLview-NG — inspired by Claude Y. Legault's original vision"

## Project Structure

```
CYLview-NG/
├── Cargo.toml              # Workspace configuration
├── README.md               # This file
├── crates/
│   └── core/               # Core Rust library (wgpu, chemfiles)
└── desktop/                # Tauri desktop application
    ├── src-tauri/          # Rust backend
    └── src/                # Svelte frontend
```

---

**Current Status:** Setting up project skeleton (Phase 1, Step 1)

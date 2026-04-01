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
| **UI Framework** | Tauri (Rust) + React 19 + Vite + TypeScript |
| **Compute Shaders** | WGSL |
| **File I/O** | chemfiles (Rust bindings) |
| **Build System** | Cargo + cargo-bundle |
| **Plugin System** | WASM (WASI) |

## Development Roadmap

### Phase 1: Core (Months 1-6) 🚧 *In Progress*
- [x] Project skeleton and core data structures
- [x] XYZ/PDB file I/O support (chemfiles planned for Phase 2)
- [x] wgpu renderer with cylinder instancing
- [ ] **Tauri desktop shell with React 19 + Vite** ← **CURRENT STEP**
- [ ] Basic measurement and selection tools
- [ ] Mouse camera controls (orbit, pan, zoom)

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
- Rust 1.75+ (`rustup update`)
- Node.js 20+ (LTS recommended)
- cargo-tauri (`cargo install tauri-cli`)
- Git

### Development Environment Setup

```bash
# 1. Clone the repository
git clone https://github.com/Summykai/CYLview-NG.git
cd CYLview-NG

# 2. Verify Rust toolchain
rustc --version  # Should be 1.75+
cargo --version

# 3. Install Tauri CLI
cargo install tauri-cli

# 4. Build the core library (runs tests automatically)
cargo build --release -p cylview-core

# 5. Setup frontend (when desktop is ready)
cd desktop/src-ui && npm install
```

### Build
```bash
# Clone the repository
git clone https://github.com/Summykai/CYLview-NG.git
cd CYLview-NG

# Build the core library
cargo build --release -p cylview-core

# Install frontend dependencies
cd desktop
cd src-ui && npm install && cd ..

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
    ├── src-tauri/          # Rust backend (Tauri)
    └── src-ui/             # React 19 + Vite frontend
```

---

**Current Status:** Step 4 - Tauri Desktop Shell (Phase 1, Step 4)

**Recently Completed:**
- ✅ GPU-instanced cylinder rendering for bonds
- ✅ Quadrant lighting system (4-point plastic material highlights)
- ✅ Sphere impostors for compact atom rendering
- ✅ Depth testing and alpha blending

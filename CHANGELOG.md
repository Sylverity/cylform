# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Phase 1: Core Development

### Added
- Initial project skeleton and workspace structure
- Core data structures (`Atom`, `Bond`, `Structure`) with bond perception
- XYZ file I/O support (read/write)
- **chemfiles integration** supporting 40+ molecular formats (PDB, SDF, Gaussian, etc.)
- Trajectory reading for MD simulations
- Orbital camera with spherical coordinates
- Selection and picking framework
- CI/CD pipeline with GitHub Actions
- Comprehensive documentation and contribution guidelines

### In Progress
- wgpu renderer with cylinder instancing
- Tauri desktop shell setup

### Planned
- React 19 + Vite frontend
- Real-time GPU rendering
- Basic measurement tools

## [0.1.0] - 2026-03-31

### Added
- Project initialization
- Core library crate (`cylview-core`)
- README with comprehensive technical specification
- Apache 2.0 license

---

## Roadmap

### Phase 1: Core (Target: Q2 2026)
- [x] Project skeleton
- [x] chemfiles integration
- [ ] wgpu renderer
- [ ] Tauri desktop shell
- [ ] Basic tools

### Phase 2: Polish (Target: Q4 2026)
- [ ] Hybrid raytracing
- [ ] Animation support
- [ ] Custom styling
- [ ] Web build

### Phase 3: Ecosystem (Target: 2027)
- [ ] Plugin API
- [ ] Python bindings
- [ ] Jupyter integration
- [ ] Database connectors

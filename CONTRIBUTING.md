# Contributing to CYLview-NG

Thank you for your interest in contributing to CYLview-NG! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- **Rust 1.75+** (install via [rustup](https://rustup.rs/))
- **Node.js 20+** (LTS recommended)
- **Git**

### Building from Source

```bash
# Clone the repository
git clone https://github.com/Summykai/CYLview-NG.git
cd CYLview-NG

# Build the core library
cargo build --release -p cylview-core

# Run tests
cargo test

# Check formatting and lints
cargo fmt -- --check
cargo clippy -- -D warnings
```

## Project Structure

```
CYLview-NG/
├── crates/
│   └── core/           # Core Rust library
│       ├── src/
│       │   ├── lib.rs      # Main exports
│       │   ├── molecule.rs # Data structures
│       │   ├── io.rs       # File I/O
│       │   ├── render.rs   # GPU rendering
│       │   ├── camera.rs   # Camera controls
│       │   └── picker.rs   # Selection/picking
│       └── tests/      # Integration tests
├── desktop/            # Tauri desktop app (Phase 1, Step 4)
│   ├── src-tauri/      # Rust backend
│   └── src-ui/         # React 19 + Vite frontend
└── docs/               # Documentation
```

## Development Workflow

We follow a feature-branch workflow:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Make** your changes
4. **Test** your changes: `cargo test`
5. **Commit** with a descriptive message
6. **Push** to your fork
7. **Open** a Pull Request

### Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, semicolons, etc)
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Adding or updating tests
- `chore:` Build process or auxiliary tool changes

Example:
```
feat(io): add support for Gaussian output files

- Implement read_gaussian() using chemfiles
- Add tests for Gaussian format detection
- Update documentation
```

## Code Standards

### Rust

- Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Run `cargo fmt` before committing
- Run `cargo clippy` and fix warnings
- Document all public APIs with doc comments
- Write tests for new functionality

### Testing

```bash
# Run all tests
cargo test

# Run tests for specific crate
cargo test -p cylview-core

# Run with output
cargo test -- --nocapture
```

### Documentation

```bash
# Generate and open docs
cargo doc --open
```

## Architecture Decisions

When making significant changes, please discuss them first by opening an issue. Consider:

- **Performance:** How will this affect rendering performance?
- **Compatibility:** Does this maintain cross-platform support?
- **API Design:** Does this follow Rust best practices?
- **Testing:** Can this be properly tested?

## Roadmap

See [README.md](README.md) for the full roadmap. Current focus:

- **Phase 1** (Current): Core library with chemfiles, wgpu rendering
- **Phase 2:** Hybrid RT, animations, web build
- **Phase 3:** Plugin system, Python bindings

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.

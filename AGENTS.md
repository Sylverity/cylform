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

## Rendering architecture

Rust (cylview-core) handles all file I/O and chemistry. The desktop app sends
atom/bond JSON to the React frontend via a single `load_molecule` Tauri command.
Three.js (WebGL) renders the scene inside the Tauri WebView — this is the correct
architecture; do not attempt to drive wgpu from the Tauri window handle.

## Current state — v0.1.0 complete

- Standalone Windows .exe builds and runs
- XYZ and PDB file loading via native dialog
- Three.js scene: cylinder bonds (CYLview blue), CPK atom spheres, 4-point lighting
- OrbitControls: rotate / pan / zoom / reset
- Covalent-radius bond perception (no phantom bonds)

## Next step — v0.2.0: chemistry controls

Priority order:
1. Hide/show hydrogens toggle (most-used CYLview feature)
2. Distance label on selected bond (click bond → show Å value)
3. Angle label on three selected atoms
4. Export current view as PNG

For every update:
1. State the goal of the step.
2. Explain how it supports the CYLview-NG vision.
3. Implement only the needed scope.
4. Summarize what was completed.
5. Identify the next step without starting it.
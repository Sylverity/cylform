# Developer Benchmarking: Cylform Atom Capacity

This guide is for humans and coding agents evaluating Cylform performance claims. The benchmark launches the real Tauri desktop app, loads generated XYZ files through the startup-file path, samples frame timing in the WebGL canvas, writes JSON results, and exits. It does not use browser automation or headless rendering.

## What the Benchmark Measures

- `loadMs`: Rust/Tauri load path, including file parsing, bond perception, centering, serialization, and frontend invoke round trip.
- `rebuildSceneMs`: Three.js scene construction after molecule data reaches the frontend.
- `averageFps`, `p95FrameMs`, `responsive`: short requestAnimationFrame sampling after render.
- `interactionAverageFps`, `interactionP95FrameMs`, `interactionPhases`: deterministic orbit, pan, and zoom/scroll-style viewport movement sampling after the passive render sample.
- `visibleAtoms`, `visibleBonds`, `totalAtoms`, `totalBonds`: rendered structure size.
- `webglRenderer`, `webglVendor`: best-effort browser-reported WebGL strings. Treat these as advisory only; WebKit/WSLg may report misleading values.

The benchmark is meant to justify wording such as "comfortably interactive up to X atoms on this machine" and "normal builds conservatively cap single structures at Y atoms." It is not a chemistry parser benchmark and should not be used alone to claim large-trajectory support.

## Commands

Build the current app first so the benchmark uses the latest frontend and Tauri commands:

```bash
pnpm --dir desktop/src-ui run build:desktop:fast
```

Run a quick smoke test:

```bash
pnpm --dir desktop/src-ui run benchmark:atoms -- --sizes 500,1000,2000 --sample-ms 1000
```

Run the standard README-validation ladder:

```bash
pnpm --dir desktop/src-ui run benchmark:atoms -- --sizes 5000,10000,25000,50000
```

Run with a longer real-world interaction window:

```bash
pnpm --dir desktop/src-ui run benchmark:atoms -- --sizes 50000,100000,200000 --interaction-ms 2000
```

Run the full default ladder:

```bash
pnpm --dir desktop/src-ui run benchmark:atoms
```

Results are written under `benchmark-results/`, which is intentionally ignored by git.

## WSL2 / WSLg Notes

WSLg can produce useful developer data, but only if OpenGL is hardware accelerated. Check the renderer before trusting capacity numbers:

```bash
glxinfo -B
```

Good output should say `Accelerated: yes` and identify a real GPU through D3D12, for example:

```text
OpenGL renderer string: D3D12 (NVIDIA GeForce RTX 4070 Ti)
```

Bad output usually says:

```text
OpenGL renderer string: llvmpipe
Accelerated: no
```

The benchmark runner automatically applies the common WSLg environment fixes:

```bash
XDG_RUNTIME_DIR=/mnt/wslg/runtime-dir
GALLIUM_DRIVER=d3d12
MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA
LD_LIBRARY_PATH=/usr/lib/wsl/lib
```

If the machine has multiple GPUs, validate the selected GPU with:

```bash
LD_LIBRARY_PATH=/usr/lib/wsl/lib:${LD_LIBRARY_PATH:-} \
GALLIUM_DRIVER=d3d12 \
MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA \
glxinfo -B
```

WSLg numbers may still differ from native Windows release builds because rendering passes through WSLg, WebKitGTK, Mesa, and D3D12 translation. Use WSLg results for development direction, then confirm public release claims on native Windows/Linux/macOS hardware where possible.

## Interpreting Results

- If `loadMs` is low but FPS collapses, the bottleneck is rendering, not Rust parsing.
- If `rebuildSceneMs` is high, scene construction or object allocation is the immediate problem.
- If `averageFps` is low and p95 frame time is high even after rebuild, shader/geometry cost, WebView overhead, or driver path may be the sustained interaction problem.
- If passive `averageFps` is acceptable but `interactionAverageFps` or `interactionP95FrameMs` is poor, the molecule may render fine while still feeling bad during scroll zoom, orbit, or viewport panning.
- Current rendering batches atoms and bonds with Three.js `InstancedMesh`, including styled bond buckets. Large structures should therefore avoid one-object-per-atom or one-object-per-bond behavior in normal rendering.
- Strong GPUs help most once the WebView is using a hardware-accelerated path. If `renderCalls` or `sceneObjects` rises unexpectedly after a renderer change, check that new styles or overlays did not bypass the instanced batches.

For README wording, prefer conservative language:

- "Normal builds cap single structures at 50,000 atoms for v1 safety."
- "Interactive comfort depends on GPU, driver path, and renderer implementation."
- "Benchmark results from one machine should be labeled with OS, GPU, renderer path, atom count, bond count, average FPS, and p95 frame time."

## Guidance for Agents

- Do not raise `MAX_ATOMS` based only on successful parsing or startup load. Require interactive frame results.
- Record the exact command, OS/runtime, GPU renderer from `glxinfo -B` when available, and the JSON output path.
- Treat WSLg `llvmpipe` results as invalid for public performance claims.
- Do not commit `benchmark-results/` artifacts.
- After renderer performance changes, run at least `2000,3000,5000` for cutoff detection and `5000,10000,25000,50000` for README-limit validation.
- If results show low FPS with low `rebuildSceneMs`, inspect renderer/material changes, WebGL acceleration, and batch counts before optimizing Rust parsing.

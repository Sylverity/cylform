# Benchmarking Cylform Atom Capacity

This guide is for humans and coding agents evaluating Cylform performance claims. The benchmark launches the real Tauri desktop app, loads generated XYZ files through the startup-file path, samples frame timing in the WebGL canvas, writes JSON results, and exits. It does not use browser automation or headless rendering.

## What the Benchmark Measures

- `loadMs`: Rust/Tauri load path, including file parsing, bond perception, centering, serialization, and frontend invoke round trip.
- `rebuildSceneMs`: Three.js scene construction after molecule data reaches the frontend.
- `averageFps`, `p95FrameMs`, `responsive`: short requestAnimationFrame sampling after render.
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
node scripts/benchmark-atom-capacity.mjs --sizes 500,1000,2000 --sample-ms 1000
```

Run the standard README-validation ladder:

```bash
node scripts/benchmark-atom-capacity.mjs --sizes 5000,10000,25000
```

Run the full default ladder:

```bash
node scripts/benchmark-atom-capacity.mjs
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
- If `averageFps` is low and p95 frame time is high even after rebuild, draw-call/object count or shader/geometry cost is the sustained interaction problem.
- Current non-instanced rendering creates one Three.js mesh per atom and per bond; large fixtures can therefore create tens of thousands of render objects and draw participants.
- Strong GPUs help most after visual geometry is batched or instanced. If many individual meshes remain, CPU/WebView/driver overhead can dominate before the GPU is saturated.

For README wording, prefer conservative language:

- "Normal builds cap single structures at 25,000 atoms for v1 safety."
- "Interactive comfort depends on GPU, driver path, and renderer implementation."
- "Benchmark results from one machine should be labeled with OS, GPU, renderer path, atom count, bond count, average FPS, and p95 frame time."

## Guidance for Agents

- Do not raise `MAX_ATOMS` based only on successful parsing or startup load. Require interactive frame results.
- Record the exact command, OS/runtime, GPU renderer from `glxinfo -B` when available, and the JSON output path.
- Treat WSLg `llvmpipe` results as invalid for public performance claims.
- Do not commit `benchmark-results/` artifacts.
- After renderer performance changes, run at least `2000,3000,5000` for cutoff detection and `5000,10000,25000` for README-limit validation.
- If results show low FPS with low `rebuildSceneMs`, prioritize instancing/batching over Rust parser optimization.

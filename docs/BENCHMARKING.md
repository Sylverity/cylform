# Developer Benchmarking: Cylform Atom Capacity

This guide is for humans and coding agents evaluating Cylform performance claims. The benchmark launches the real Tauri desktop app, loads generated XYZ files through the startup-file path, samples frame timing in the WebGL canvas, writes JSON results, and exits. It does not use browser automation or headless rendering.

## What the Benchmark Measures

- `loadMs`: Rust/Tauri load path, including file parsing, bond perception, centering, serialization, and frontend invoke round trip.
- `rebuildSceneMs`: Three.js scene construction after molecule data reaches the frontend.
- `averageFps`, `p95FrameMs`, `responsive`: short requestAnimationFrame sampling after render.
- `interactionAverageFps`, `interactionP95FrameMs`, `interactionPhases`: deterministic orbit, pan, and zoom/scroll-style viewport movement sampling after the passive render sample.
- `visibleAtoms`, `visibleBonds`, `totalAtoms`, `totalBonds`: rendered structure size.
- `renderProfile`, `renderQuality`: the render profile and load-derived geometry/pixel-ratio profile used for the measured scene.
- `webglRenderer`, `webglVendor`: best-effort browser-reported WebGL strings. Treat these as advisory only; WebKit/WSLg may report misleading values.

The benchmark is meant to justify wording such as "comfortably interactive up to X atoms on this machine" and "normal builds conservatively cap single structures at Y atoms." It is not a chemistry parser benchmark and should not be used alone to claim large-trajectory support.

Treat atom count as only one part of the load axis. The generated lattice fixture uses `ceil(cbrt(N))` and cycles elements by index, so perceived bond count and bonds per atom can change non-smoothly between sample points. Public summaries should report bond count with atom count and should not infer renderer scaling from atom count alone.

Benchmark mode uses the app's current normalized defaults instead of persisted user settings, so stale local preferences do not change capacity results. Record `renderProfile` from the JSON anyway; `cylview`, `ball-stick`, and `houkmol` can produce different render-call and triangle-count profiles in normal interactive use.

Scene quality is load-derived rather than a single large-scene cutoff. Current builds gradually reduce sphere/cylinder segment counts and pixel ratio as `atomCount + bondCount` rises, so benchmark graphs should show smoother transitions. Always inspect `renderQuality`, `triangles`, `renderCalls`, `sceneObjects`, and bond/atom counts before explaining a step change in FPS.

## Commands

Build the current app first so the benchmark uses the latest frontend and Tauri commands:

```bash
pnpm --dir desktop/src-ui run build:desktop:fast
```

Run a quick smoke test:

```bash
pnpm --dir desktop/src-ui run benchmark:atoms -- --sizes 500,1000,2000 --sample-ms 1000
```

Save a PNG screenshot of each run's rendered view (developer visual feedback):

```bash
pnpm --dir desktop/src-ui run benchmark:atoms -- --sizes 500 --sample-ms 1000 --screenshot
```

Screenshot capture is a minimal way to reuse this runner as a "launch the app and save a picture" harness. When `--screenshot` (or `CYLFORM_BENCH_SCREENSHOT=1`) is set, the app captures the settled rendered view — the same canvas + label/link-line compositing the Export Figure path uses — and writes one PNG per run under `benchmark-results/screenshots/`. The screenshot path is recorded in each JSON result. Normal runs are unaffected.

Pick a render style to screenshot with `--render-profile` (implies `--screenshot`, and can also be set with `CYLFORM_BENCH_RENDER_PROFILE`):

```bash
pnpm --dir desktop/src-ui run benchmark:atoms -- --sizes 500 --sample-ms 1000 --render-profile ball-stick
```

Valid profiles are `cylview` (default), `ball-stick`, and `houkmol`. To eyeball a specific style, write a tiny wrapper that calls the runner with your chosen fixture size and profile; the PNG lands in the ignored `benchmark-results/screenshots/` tree with the profile in its filename. This captures the molecule render surface only, not surrounding app chrome or menus.

### Snapshotting a real molecule (no performance sampling)

The atom-capacity runner is built around generated lattice fixtures and always runs the frame-timing sample plus orbit/pan/zoom interaction. When you just want a clean, static picture of a real structure — for render review or to eyeball a specific profile — use the dedicated snapshot harness instead:

```bash
pnpm --dir desktop/src-ui run snapshot:molecule -- --molecule /path/to/structure.xyz
```

It launches the app on the given molecule, lets the scene settle, captures one PNG per render profile (default `cylview,ball-stick,houkmol`) with no timing sample or camera motion, and writes them to `benchmark-results/snapshots/`. Restrict the profiles with `--profiles cylview,houkmol`. Like the benchmark screenshot, this captures the molecule render surface only. Internally it sets `CYLFORM_BENCH_SNAPSHOT=1`, which tells the app to take the fast settle-and-capture path rather than the performance benchmark.

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

Results are written under `benchmark-results/`, which is intentionally ignored by git. This includes generated fixtures, benchmark JSON, summaries, and optional screenshot PNGs.

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
- Use `--screenshot` (optionally with `--render-profile <id>`) when you want instant visual feedback: it launches the app and saves a PNG of the rendered view under `benchmark-results/screenshots/` without a separate manual run.
- After renderer performance changes, run at least `2000,3000,5000` for cutoff detection and `5000,10000,25000,50000` for README-limit validation.
- If results show low FPS with low `rebuildSceneMs`, inspect renderer/material changes, WebGL acceleration, and batch counts before optimizing Rust parsing.

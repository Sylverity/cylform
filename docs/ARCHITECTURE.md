# Cylform Architecture

This note is for contributors who want to understand where molecule data enters the app, how it becomes a rendered scene, and which extension points should stay stable for v1.

## Data Flow

```text
molecule file
  -> cylform-core parser registry
  -> Structure { frames, static_bonds, per-frame metadata }
  -> Tauri load_molecule(frameIndex) command
  -> React MoleculeData state
  -> Three.js instanced atoms and bond batches
```

The product rule is simple: computational file handling stays in Rust, while interactive presentation stays in the desktop UI. The frontend should receive plain, centered molecule data and focus on camera controls, styling, annotations, and export.

## Rust Core

`crates/core` owns molecule data, parsing, metadata, and chemistry-oriented helpers.

- `molecule.rs` defines `Atom`, `Frame`, `Bond`, `BondOrder`, `BondKind`, `SourceMetadata`, and `Structure`.
- `Structure` stores `frames: Vec<Frame>` for XYZ trajectories. Each frame carries atoms, source title/comment text, and optional energy/unit metadata.
- `static_bonds` stores bonds perceived or imported from frame 0 and reused for the current single-frame UI.
- `BondKind` captures figure-oriented bond styles at the data-model level: normal, transition-state, dative, interaction, and thin.
- Compatibility helpers such as `atoms()`, `bonds()`, `frame(index)`, `frame_atoms(index)`, `center_for_frame(index)`, `atom_count()`, and `bond_count()` keep call sites readable while frame-aware paths use explicit frame indices.

`io.rs` provides the built-in parser registry. New read formats should implement `FormatParser`, expose their supported extensions, and be added to the built-in parser list. `read_structure_with_options(path, FileFormat::Auto, options)` remains the compatibility entry point and dispatches through the registry after reading file content once.

Current built-in read formats are XYZ and PDB. SDF/MOL export behavior has not been redesigned in this slice.

## Tauri Layer

`desktop/src-tauri/src/main.rs` is the native bridge.

- `load_molecule` accepts a path and optional `frameIndex`, defaults to frame 0, and returns `MoleculeData` for the selected frame. It preserves static topology while updating current-frame atom coordinates, frame title, and frame energy metadata.
- `get_supported_read_extensions` exposes the parser registry to the frontend so the native open dialog does not hardcode supported formats.
- The native menu stays thin: custom menu items emit `menu:*` events to the WebView for workspace actions, while Rust handles native window actions and debug-build DevTools.
- Per-file presentation state is stored under app data in a versioned JSON envelope.
- `settings.json` stores versioned global app settings for defaults and preferences. These are app-level defaults, not molecule data.
- `session-tabs.json` stores the visible workspace tab list, while `recent-files.json` remains the global open history.
- `pose-library.json` stores global Pose Library entries, and `PosePreviews/` stores generated thumbnail PNGs by library-entry id.
- `export_png` writes validated PNG bytes, `export_text_sidecar` writes validated JSON metadata sidecars for publication exports, and `export_xyz_frame` writes the selected source frame as standalone XYZ.
- Legacy saved keys such as `labels`, `hiddenAtomIndices`, `savedPoses`, and older style maps are normalized into the v1 envelope when loaded.

The saved-state envelope is intentionally presentation-focused. It belongs to the desktop app, not `cylform-core`.

## Frontend Layer

The React app owns interaction state and the Three.js scene.

- `App.tsx` coordinates file loading, saved state, annotations, render profile selection, visibility, style overrides, measurements, and publication export.
- Menu-triggered workspace actions reuse the same frontend handlers as toolbar buttons and tab controls. The Settings view persists preferences through the Rust app-data settings commands.
- Visible molecule tabs are frontend workspace state. Hidden internal preview render jobs deliberately bypass visible tab state, session persistence, and recent-file recording.
- Desktop drag-and-drop uses the same supported-extension list as the native Open dialog. Dropped molecules become visible workspace tabs; when a tab is already active, new drop tabs are loaded in the background without changing the current camera, selection, or active molecule.
- `MoleculeCanvas.tsx` builds the WebGL scene and keeps normal molecule topology rendering batched.
- It is intentionally an orchestrating React component: scene init, event handlers, effects, and JSX live here, while pure helpers and scene internals live in `components/molecule-canvas/`.
- Atoms are rendered with instanced sphere geometry.
- Bonds are rendered with one `InstancedMesh` per style bucket, including styled bonds, so transition-state, dative, interaction, and thin bonds do not fall back to one mesh per bond.
- Render profile behavior is explicit in the renderer: CYLview owns hidden-but-pickable atom spheres and split endpoint-colored cylinders, ball-and-stick owns visible glossy atom spheres and uniform glossy bonds, and Houkmol owns visible glossy atom spheres, black normal bonds, and shader-drawn atom quadrants.
- All WebGL draws that need final scene output should go through `renderScene(ctx)` so animation, export, preview, and benchmark paths share the same fog and focal-blur behavior.
- Publication export is state-first: `capturePublicationRenderState` snapshots molecule geometry, atom/bond styles, render profile, camera/projection, lighting, background, fog/depth cue, labels, link lines, angle arcs, residue groups, hidden atoms, and saved poses before rendering.
- Frame changes call `load_molecule(frameIndex)` and replace displayed coordinates without resetting presentation state, camera, projection, or render profile.
- `renderPublicationExport` owns the deliberate export workflow: viewport-exact raster, supersampled publication raster, experimental progressive path-traced output, and numbered frame sequence output. It composites DOM labels and link-line canvas output after the 3-D render so annotations stay consistent across modes.
- Selection and measurement overlays use separate transient objects.
- Angle measurements display a 3D arc mesh in the plane of the three selected atoms.

### `molecule-canvas/` modules

`MoleculeCanvas.tsx` imports domain-specific helpers from `components/molecule-canvas/`:

| Module | Responsibility |
|---|---|
| `types.ts` | Shared interfaces: `SceneCtx`, `BondSelectionData`, `AtomSelectionData`, `PickResult`, etc. |
| `labels.ts` | Label formatting (`formatDistance`, `formatAngle`), text sanitizing, and rich canvas sub/superscript rendering. |
| `materialPresets.ts` | Shared element colors and profile material definitions used by the renderer and appearance UI. |
| `visualStyle.ts` | `applyMaterialPreset`, profile behavior helpers, `atomMaterial`, bond geometry helpers (`bondTransform`, `segmentTransform`), and large-scene detection. |
| `depthCue.ts` | Molecule-relative fog and optional focal-blur rendering. It projects the molecule bounding box along the active camera direction, applies Three.js fog, updates `BokehPass`, and exposes `renderScene(ctx)` as the shared render entry point. |
| `camera.ts` | Camera sync, preset application, saved-pose restoration, and floor placement. |
| `visibility.ts` | `buildMoleculeVisibilityIndex`, `isAtomVisible`, and `labelSourceVisible` for hydrogen/visibility filtering. |
| `benchmark.ts` | Frame-time sampling, interaction-benchmark orchestration, WebGL debug info, and render stats. |
| `geometry.ts` | Angle-arc mesh creation/removal and selection overlay creation/removal. |
| `picking.ts` | Raycast resolution: `pickScene`, `resolveAtomHit`, `resolveBondHit`. |
| `exportPng.ts` | Publication export state, settings, viewport-exact PNG, supersampled/tiled raster export, experimental path-traced export, numbered frame sequence settings, metadata JSON, preview thumbnails, and the legacy `renderCurrentViewDataUrl(ctx, host, options)` helper used by pose previews. |

This split keeps `MoleculeCanvas.tsx` focused on React lifecycle and Three.js mutable state, while the modules remain mostly pure and easy to test by typecheck.

The renderer chooses bond style in this order:

1. Per-file frontend style override.
2. Backend `BondKind`.
3. Normal bond style.

Picking follows the same batch-oriented model. Each bond batch stores bond metadata in `userData.bonds`, and selection resolves `instanceId` back to the corresponding bond entry.

## Presentation State

Saved presentation state is versioned so future releases can add fields without breaking old files.

```json
{
  "version": 1,
  "poses": [],
  "annotations": [],
  "hidden_atoms": [],
  "styles": {
    "render_profile": "cylview",
    "material_preset": "CYLviewLegacy"
  },
  "camera": {
    "fogEnabled": true,
    "fogIntensity": 0.55,
    "fogDepth": 0.58,
    "focalBlurEnabled": false,
    "focalBlurAmount": 0.32,
    "focalDepth": 0.5
  }
}
```

Every field has defaults on the Rust side and the TypeScript side. Camera defaults are profile-aware: CYLview enables publication-style fog by default, while ball-and-stick and Houkmol keep fog off unless the user enables it. Legacy camera objects that predate `fogDepth`, `focalBlurEnabled`, `focalBlurAmount`, and `focalDepth` are normalized by merging with the resolved render profile's defaults.

Persisted annotations use one model for atom labels, distances, angles, and dihedrals. Active measurement picking remains transient UI state until the user chooses to save an annotation.

Global settings follow a separate precedence rule:

1. Explicit current user action in the visible document.
2. Per-file `SavedInfo/<hash>.json` presentation state for that molecule.
3. Global `settings.json` defaults.
4. Built-in defaults.

That means global visual and chemistry defaults initialize newly opened molecules when no per-file presentation state exists. Existing `SavedInfo` values continue to win for molecule-specific background, render profile, hydrogen visibility, annotations, hidden atoms, styles, camera, and saved poses. Global export scale, measurement precision, mouse/zoom behavior, keyboard shortcuts, autosave, session restore, drag/drop background behavior, and recent-file limit apply as app preferences.

The app-data layout currently includes:

- `settings.json` for global app settings.
- `SavedInfo/<hash>.json` for per-molecule presentation state.
- `session-tabs.json` for the visible workspace tabs restored on startup when enabled.
- `recent-files.json` for global recent molecule history.
- `pose-library.json` for promoted Pose Library entries.
- `PosePreviews/<entry-id>.png` for Pose Library thumbnails.

## Pose Library Previews

The global Pose Library indexes important saved poses across molecule files. It stores pose metadata and the saved `SavedPose` payload, not molecule geometry. The source molecule path and per-file `SavedInfo` state remain the authority for reopening and rendering a library pose.

Thumbnail generation reuses the WebView renderer. The frontend mounts a hidden internal preview document at fixed preview dimensions, loads the target molecule and presentation state through the same commands as normal tabs, applies the target pose, captures a small PNG from `MoleculeCanvas`, and then tears the preview document down. This is intentionally not a headless renderer and is not persisted as a user-visible tab.

## Render Profiles

Render profiles are serializable presentation choices. Current profiles are:

- `cylview`: the primary CYLview cylindrical-bond look with hidden atom spheres, split endpoint bond colors, and restrained specular.
- `ball-stick`: a traditional visible atom sphere profile with uniform glossy bonds.
- `houkmol`: a flatter figure-preparation profile with a white publication-style background, visible glossy element-colored atoms, black normal bonds, and black view-space quadrant markings via an `onBeforeCompile` shader patch.

The active profile is stored in per-file state as `render_profile`; `material_preset` is still written as a compatibility alias while older saved-state readers exist. Future exporters, such as POV-Ray output, should consume render-profile data rather than inventing separate finish settings.

New molecules use the explicit default render profile from Settings when no per-file presentation state exists. Render profiles do not have letter shortcuts; `H` is reserved for cycling hydrogen visibility.

CYLview's depth cues are part of its primary publication rendering path, not a legacy material effect. Fog is computed from `lastMoleculeBox` projected through the active perspective or orthographic camera, so the Fog and Depth controls act across the molecule's visible depth span instead of camera distance. Optional focal blur uses Three.js `EffectComposer` and `BokehPass` only when enabled; otherwise the renderer draws directly for performance.

## Extension Points

- Add a file format by writing a `FormatParser` implementation and registering it in the built-in parser list.
- Extend trajectory support by adding additional formats or interpolation on top of the existing `Structure.frames` and `load_molecule(frameIndex)` path.
- Add a persisted annotation type by extending the Rust enum, TypeScript union, and annotations panel rendering.
- Add a render profile by extending `RenderProfileId`, `renderProfiles.ts`, `materialPresets.ts`, renderer profile helpers, and the Settings/native normalization allowlists.
- Add or change depth-cue behavior in `depthCue.ts`, then keep `SceneCtx.depthCue`, `ViewOptions`, Rust saved-state normalization, export rendering, preview rendering, and benchmark rendering aligned through `renderScene(ctx)`.
- Add a bond style by extending `BondKind`, Tauri serialization, TypeScript style mapping, and the existing instanced bond bucket path.

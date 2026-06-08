# Cylform Architecture

This note is for contributors who want to understand where molecule data enters the app, how it becomes a rendered scene, and which extension points should stay stable for v1.

## Data Flow

```text
molecule file
  -> cylform-core parser registry
  -> Structure { frames, static_bonds, metadata }
  -> Tauri load_molecule command
  -> React MoleculeData state
  -> Three.js instanced atoms and bond batches
```

The product rule is simple: computational file handling stays in Rust, while interactive presentation stays in the desktop UI. The frontend should receive plain, centered molecule data and focus on camera controls, styling, annotations, and export.

## Rust Core

`crates/core` owns molecule data, parsing, metadata, and chemistry-oriented helpers.

- `molecule.rs` defines `Atom`, `Frame`, `Bond`, `BondOrder`, `BondKind`, `SourceMetadata`, and `Structure`.
- `Structure` stores `frames: Vec<Frame>` even though current release builds display frame 0 only.
- `static_bonds` stores bonds perceived or imported from frame 0 and reused for the current single-frame UI.
- `BondKind` captures figure-oriented bond styles at the data-model level: normal, transition-state, dative, interaction, and thin.
- Compatibility helpers such as `atoms()`, `bonds()`, `frame(index)`, `center()`, `atom_count()`, and `bond_count()` keep older call sites readable while the frame model settles.

`io.rs` provides the built-in parser registry. New read formats should implement `FormatParser`, expose their supported extensions, and be added to the built-in parser list. `read_structure_with_options(path, FileFormat::Auto, options)` remains the compatibility entry point and dispatches through the registry after reading file content once.

Current built-in read formats are XYZ and PDB. SDF/MOL export behavior has not been redesigned in this slice.

## Tauri Layer

`desktop/src-tauri/src/main.rs` is the native bridge.

- `load_molecule` accepts a path and optional `frameIndex`, defaults to frame 0, and returns the existing frontend `MoleculeData` shape.
- `get_supported_read_extensions` exposes the parser registry to the frontend so the native open dialog does not hardcode supported formats.
- The native menu stays thin: custom menu items emit `menu:*` events to the WebView for workspace actions, while Rust handles native window actions and debug-build DevTools.
- Per-file presentation state is stored under app data in a versioned JSON envelope.
- `settings.json` stores versioned global app settings for defaults and preferences. These are app-level defaults, not molecule data.
- `session-tabs.json` stores the visible workspace tab list, while `recent-files.json` remains the global open history.
- `pose-library.json` stores global Pose Library entries, and `PosePreviews/` stores generated thumbnail PNGs by library-entry id.
- Legacy saved keys such as `labels`, `hiddenAtomIndices`, `savedPoses`, and older style maps are normalized into the v1 envelope when loaded.

The saved-state envelope is intentionally presentation-focused. It belongs to the desktop app, not `cylform-core`.

## Frontend Layer

The React app owns interaction state and the Three.js scene.

- `App.tsx` coordinates file loading, saved state, annotations, material preset selection, visibility, style overrides, measurements, and exports.
- Menu-triggered workspace actions reuse the same frontend handlers as toolbar buttons and tab controls. The Settings view persists preferences through the Rust app-data settings commands.
- Visible molecule tabs are frontend workspace state. Hidden internal preview render jobs deliberately bypass visible tab state, session persistence, and recent-file recording.
- Desktop drag-and-drop uses the same supported-extension list as the native Open dialog. Dropped molecules become visible workspace tabs; when a tab is already active, new drop tabs are loaded in the background without changing the current camera, selection, or active molecule.
- `MoleculeCanvas.tsx` builds the WebGL scene and keeps normal molecule topology rendering batched.
- It is intentionally an orchestrating React component: scene init, event handlers, effects, and JSX live here, while pure helpers and scene internals live in `components/molecule-canvas/`.
- Atoms are rendered with instanced sphere geometry.
- Bonds are rendered with one `InstancedMesh` per style bucket, including styled bonds, so transition-state, dative, interaction, and thin bonds do not fall back to one mesh per bond.
- Selection and measurement overlays use separate transient objects.
- Angle measurements display a 3D arc mesh in the plane of the three selected atoms.

### `molecule-canvas/` modules

`MoleculeCanvas.tsx` imports domain-specific helpers from `components/molecule-canvas/`:

| Module | Responsibility |
|---|---|
| `types.ts` | Shared interfaces: `SceneCtx`, `BondSelectionData`, `AtomSelectionData`, `PickResult`, etc. |
| `labels.ts` | Label formatting (`formatDistance`, `formatAngle`), text sanitizing, and rich canvas sub/superscript rendering. |
| `visualStyle.ts` | Atom colors, `MATERIAL_PRESETS`, `applyMaterialPreset`, `atomMaterial`, bond geometry helpers (`bondTransform`, `segmentTransform`), and large-scene detection. |
| `camera.ts` | Camera sync, preset application, saved-pose restoration, and floor placement. |
| `visibility.ts` | `buildMoleculeVisibilityIndex`, `isAtomVisible`, and `labelSourceVisible` for hydrogen/visibility filtering. |
| `benchmark.ts` | Frame-time sampling, interaction-benchmark orchestration, WebGL debug info, and render stats. |
| `geometry.ts` | Angle-arc mesh creation/removal and selection overlay creation/removal. |
| `picking.ts` | Raycast resolution: `pickScene`, `resolveAtomHit`, `resolveBondHit`. |
| `exportPng.ts` | `renderCurrentViewDataUrl(ctx, host, options)` — a pure function that composites the WebGL canvas with DOM labels and link lines. |

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
    "material_preset": "CYLview"
  },
  "camera": {}
}
```

Every field has defaults on the Rust side and the TypeScript side. Persisted annotations use one model for atom labels, distances, angles, and dihedrals. Active measurement picking remains transient UI state until the user chooses to save an annotation.

Global settings follow a separate precedence rule:

1. Explicit current user action in the visible document.
2. Per-file `SavedInfo/<hash>.json` presentation state for that molecule.
3. Global `settings.json` defaults.
4. Built-in defaults.

That means global visual and chemistry defaults initialize newly opened molecules when no per-file presentation state exists. Existing `SavedInfo` values continue to win for molecule-specific background, material preset, hydrogen visibility, annotations, hidden atoms, styles, camera, and saved poses. Global export scale, measurement precision, mouse/zoom behavior, keyboard shortcuts, autosave, session restore, drag/drop background behavior, and recent-file limit apply as app preferences.

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

## Material Presets

Material presets are serializable presentation choices. Current presets are:

- `CYLviewLegacy`: the classic cylindrical-bond look with restrained specular.
- `CYLview`: a glossy default with brighter specular and shinier finishes.
- `Houkmol`: a flatter figure-preparation preset with view-space quadrant shading via `onBeforeCompile` shader patch.

The active preset is stored in per-file state and applied when bond and atom materials are created or updated. Future exporters, such as POV-Ray output, should reuse the same preset data rather than inventing separate finish settings.

## Extension Points

- Add a file format by writing a `FormatParser` implementation and registering it in the built-in parser list.
- Add trajectory playback by loading additional frames into `Structure.frames` and updating frontend instance matrices by frame index.
- Add a persisted annotation type by extending the Rust enum, TypeScript union, and annotations panel rendering.
- Add a material preset by extending the shared preset list and preserving the saved-state default behavior.
- Add a bond style by extending `BondKind`, Tauri serialization, TypeScript style mapping, and the existing instanced bond bucket path.

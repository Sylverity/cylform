import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  AmbientLight,
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  GridHelper,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MOUSE,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Intersection,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { LoadingSpinner } from './LoadingSpinner';
import type {
  ElementColorOverrides,
  HydrogenVisibility,
  PersistentLabel,
  MoleculeData,
  AtomStyleOverride,
  BondStyleOverride,
  BondStyleType,
  BondKind,
  MaterialPresetId,
  BenchmarkConfig,
  BenchmarkRenderMetrics,
  SelectionMode,
  SelectionSummary,
  SelectedAngleMeasurement,
  SelectedBondMeasurement,
  SelectedDihedralMeasurement,
  SavedPose,
  ViewOptions,
} from '../App';
import type { ToastMessage } from './Toast';

// ---------------------------------------------------------------------------
// Visual style — matches CYLview reference image
// ---------------------------------------------------------------------------

// Atom colours: keep the palette restrained so the cylindrical bonds dominate.
const ATOM_COLORS: Record<string, number> = {
  H:  0xcfd3d7,
  C:  0x8d949c,
  N:  0x4b84d8,
  O:  0xea6a1a,
  F:  0x33CC55,
  P:  0xFF8800,
  S:  0xDDAA00,
  Cl: 0x22BB44,
  Br: 0xAA2200,
  I:  0x770088,
};

// Keep spheres understated so the render reads as a CYLview-style tube drawing.
const ATOM_DISPLAY_RADIUS: Record<string, number> = {
  H:  0.075,
  C:  0.078,
  N:  0.095,
  O:  0.118,
  F:  0.09,
  P:  0.118,
  S:  0.118,
  Cl: 0.108,
  Br: 0.13,
  I:  0.145,
};

function atomColor(element: string): number {
  return ATOM_COLORS[element] ?? 0x888888;
}

function atomColorHex(element: string): string {
  return `#${atomColor(element).toString(16).padStart(6, '0')}`;
}

function atomDisplayRadius(element: string): number {
  return ATOM_DISPLAY_RADIUS[element] ?? 0.12;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function clampPrecision(precision: number): number {
  return Math.min(4, Math.max(1, Math.round(precision)));
}

function formatDistance(value: number, precision: number): string {
  return `${value.toFixed(clampPrecision(precision))} A`;
}

function formatAngle(value: number, precision: number): string {
  return `${value.toFixed(clampPrecision(precision))} deg`;
}

function perfLoggingEnabled(): boolean {
  try {
    return window.localStorage.getItem('cylformPerf') === '1';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  moleculeData: MoleculeData | null;
  hydrogenVisibility: HydrogenVisibility;
  hiddenAtomIndices: number[];
  elementColorOverrides: ElementColorOverrides;
  atomStyleOverrides: Record<string, AtomStyleOverride>;
  bondStyleOverrides: Record<string, BondStyleOverride>;
  atomSizeScale: number;
  materialPreset: MaterialPresetId;
  viewOptions: ViewOptions;
  distancePrecision: number;
  anglePrecision: number;
  pngExportScale: 1 | 2 | 4;
  mouseMode: 'standard' | 'one-button';
  invertScrollZoom: boolean;
  onViewOptionsChange: Dispatch<SetStateAction<ViewOptions>>;
  onMaterialPresetChange: Dispatch<SetStateAction<MaterialPresetId>>;
  selectedBond: SelectedBondMeasurement | null;
  selectedAngle: SelectedAngleMeasurement | null;
  selectedDihedral: SelectedDihedralMeasurement | null;
  persistentLabels: PersistentLabel[];
  selectionMode: SelectionMode;
  onBondSelected: (bond: SelectedBondMeasurement | null) => void;
  onAngleSelected: (angle: SelectedAngleMeasurement | null) => void;
  onDihedralSelected: (dihedral: SelectedDihedralMeasurement | null) => void;
  onPersistentLabelCreate: (label: Omit<PersistentLabel, 'id' | 'visible'>) => void;
  onSelectionSummaryChange: (summary: SelectionSummary) => void;
  isLoading: boolean;
  loadingLabel: string;
  onOpenFile: () => void;
  onError: (msg: string) => void;
  onToast: (text: string, type?: ToastMessage['type']) => void;
  benchmarkConfig?: BenchmarkConfig;
  onBenchmarkRender?: (metrics: BenchmarkRenderMetrics) => void;
  previewMode?: boolean;
  previewPose?: SavedPose | null;
  previewCaptureToken?: string | null;
  onPreviewCaptured?: (token: string, dataUrl: string) => void;
  onPreviewError?: (token: string, error: string) => void;
}

interface BondSelectionData {
  atom1Element: string;
  atom2Element: string;
  distance: number;
  midpoint: Vector3;
  atom1Index: number;
  atom2Index: number;
  displayRadius: number;
  matrix: Matrix4;
}

interface AtomSelectionData {
  element: string;
  atomIndex: number;
  position: Vector3;
  baseRadius: number;
}

interface SceneRenderStats {
  renderCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  sceneObjects: number;
}

interface MoleculeVisibilityIndex {
  moleculeData: MoleculeData;
  adjacency: number[][];
  isHydrogen: boolean[];
  isCarbonHydrogen: boolean[];
  bounds: Box3 | null;
}

interface PickMetrics {
  pickAtomMs: number | null;
  pickBondMs: number | null;
  pickTotalMs: number;
  pickHitType: 'atom' | 'bond' | 'none';
  pickAtomCandidates: number;
  pickBondCandidates: number;
}

interface PickResult extends PickMetrics {
  atom: AtomSelectionData | null;
  bond: BondSelectionData | null;
}

interface SceneCtx {
  renderer:   WebGLRenderer;
  scene:      Scene;
  camera:     PerspectiveCamera | OrthographicCamera;
  perspectiveCamera: PerspectiveCamera;
  orthographicCamera: OrthographicCamera;
  controls:   OrbitControls;
  molGroup:   Group;
  floorGroup: Group;
  floorPlane: Mesh;
  floorGrid: GridHelper;
  floorMat: MeshBasicMaterial;
  lights: {
    ambient: AmbientLight;
    key: DirectionalLight;
    fill: DirectionalLight;
    rim: DirectionalLight;
    topLight: DirectionalLight;
  };
  lastCameraDistance: number;
  lastMoleculeBox: Box3 | null;
  animId:     number;
  sphereGeom: SphereGeometry;
  cylGeom:    CylinderGeometry;
  atomMats:   Map<string, MeshPhongMaterial>;
  bondMat:    MeshPhongMaterial;
  selectedBondMat: MeshPhongMaterial;
  raycaster: Raycaster;
  pointer: Vector2;
  selectedBondOverlay: Mesh | null;
  selectedBondData: BondSelectionData | null;
  bondPickObjects: Array<Mesh | InstancedMesh>;
  selectedAtomMat: MeshPhongMaterial;
  atomPickObjects: InstancedMesh[];
  selectedAtomOverlays: Mesh[];
  modeSelectedAtomOverlays: Mesh[];
  modeSelectedBondOverlays: Mesh[];
  modeSelectedAtoms: AtomSelectionData[];
  modeSelectedBonds: BondSelectionData[];
  angleSelection: AtomSelectionData[];
  angleLabelPosition: Vector3 | null;
  angleDegrees: number | null;
  dihedralLabelPosition: Vector3 | null;
  dihedralDegrees: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexColorNumber(hex: string | undefined, fallback: number): number {
  if (!hex) return fallback;
  const normalized = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  return Number.parseInt(normalized.slice(1), 16);
}

function backdropColor(tone: ViewOptions['backdropTone'], customHex?: string): number {
  if (tone === 'warm') return 0xf2eee7;
  if (tone === 'slate') return 0xdce3ea;
  if (tone === 'black') return 0x05070a;
  if (tone === 'custom') return hexColorNumber(customHex, 0xffffff);
  return 0xffffff;
}

function syncOrthographicCamera(ctx: SceneCtx): void {
  const { renderer, orthographicCamera, controls } = ctx;
  const width = renderer.domElement.clientWidth || 800;
  const height = renderer.domElement.clientHeight || 600;
  const aspect = width / height;
  const distance = Math.max(ctx.camera.position.distanceTo(controls.target), ctx.lastCameraDistance, 8);
  const viewHeight = Math.max(distance * 0.55, 4);

  orthographicCamera.left = (-viewHeight * aspect) / 2;
  orthographicCamera.right = (viewHeight * aspect) / 2;
  orthographicCamera.top = viewHeight / 2;
  orthographicCamera.bottom = -viewHeight / 2;
  orthographicCamera.near = Math.max(distance / 120, 0.01);
  orthographicCamera.far = distance * 120;
  orthographicCamera.updateProjectionMatrix();
}

function applySavedPoseToContext(current: SceneCtx, pose: SavedPose) {
  current.camera.position.set(pose.cameraPosition.x, pose.cameraPosition.y, pose.cameraPosition.z);
  current.controls.target.set(pose.target.x, pose.target.y, pose.target.z);
  current.camera.lookAt(current.controls.target);
  current.controls.update();
  current.controls.saveState();
  current.lastCameraDistance = current.camera.position.distanceTo(current.controls.target);
  if (current.camera instanceof OrthographicCamera) syncOrthographicCamera(current);
}

function setActiveCamera(ctx: SceneCtx, projection: ViewOptions['projection']): void {
  const nextCamera = projection === 'orthographic'
    ? ctx.orthographicCamera
    : ctx.perspectiveCamera;

  if (ctx.camera === nextCamera) {
    if (nextCamera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
    return;
  }

  nextCamera.position.copy(ctx.camera.position);
  nextCamera.quaternion.copy(ctx.camera.quaternion);
  nextCamera.up.copy(ctx.camera.up);
  nextCamera.near = ctx.camera.near;
  nextCamera.far = ctx.camera.far;
  if (nextCamera instanceof PerspectiveCamera) {
    nextCamera.updateProjectionMatrix();
  }

  ctx.camera = nextCamera;
  if (nextCamera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
  ctx.controls.object = nextCamera;
  ctx.controls.update();
}

function updateFloorPlacement(ctx: SceneCtx): void {
  if (!ctx.lastMoleculeBox) {
    ctx.floorGroup.visible = false;
    return;
  }

  const box = ctx.lastMoleculeBox;
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const floorSize = Math.max(size.x, size.z, size.y, 4) * 2.35;

  ctx.floorGroup.position.set(center.x, box.min.y - 0.45, center.z);
  ctx.floorPlane.scale.set(floorSize, floorSize, 1);
  ctx.floorGrid.scale.setScalar(floorSize / 10);
}

function applyCameraPreset(ctx: SceneCtx, preset: 'front' | 'top' | 'right' | 'iso'): void {
  const target = ctx.controls.target.clone();
  const distance = Math.max(ctx.camera.position.distanceTo(target), ctx.lastCameraDistance, 8);
  const offsets = {
    front: new Vector3(0, 0, distance),
    top: new Vector3(0, distance, 0.001),
    right: new Vector3(distance, 0, 0),
    iso: new Vector3(0.62, 0.48, 0.62).normalize().multiplyScalar(distance),
  };

  ctx.camera.position.copy(target).add(offsets[preset]);
  ctx.camera.up.set(0, 1, 0);
  if (preset === 'top') {
    ctx.camera.up.set(0, 0, -1);
  }
  ctx.camera.lookAt(target);
  ctx.controls.target.copy(target);
  ctx.controls.update();
  ctx.controls.saveState();
  ctx.lastCameraDistance = distance;
  if (ctx.camera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
}

function bondKey(atom1: number, atom2: number): string {
  return atom1 < atom2 ? `${atom1}-${atom2}` : `${atom2}-${atom1}`;
}

function bondStyleMaterial(style: BondStyleOverride | undefined, fallback: MeshPhongMaterial): MeshPhongMaterial {
  if (!style) return fallback;
  const material = fallback.clone();
  if (style.type === 'ts') {
    material.color.set(0x9bb4d0);
    material.transparent = true;
    material.opacity = 0.48;
  } else if (style.type === 'dative') {
    material.color.set(0x8f9aa3);
    material.transparent = true;
    material.opacity = 0.62;
  } else if (style.type === 'interaction') {
    material.color.set(0x1f2933);
    material.transparent = true;
    material.opacity = 0.38;
  } else if (style.type === 'thin') {
    material.color.set(0x3bd16f);
  }
  return material;
}

const MATERIAL_PRESETS = {
  CYLview: {
    specular: new Color(0.86, 0.9, 0.96),
    shininess: 175,
    bondColor: 0x2f9df4,
  },
  Houkmol: {
    specular: new Color(0.18, 0.18, 0.18),
    shininess: 36,
    bondColor: 0x6f8796,
  },
} satisfies Record<MaterialPresetId, { specular: Color; shininess: number; bondColor: number }>;

function applyMaterialPreset(material: MeshPhongMaterial, presetId: MaterialPresetId) {
  const preset = MATERIAL_PRESETS[presetId];
  material.color.set(preset.bondColor);
  material.specular.copy(preset.specular);
  material.shininess = preset.shininess;
}

function bondMaterialForType(type: BondStyleType, fallback: MeshPhongMaterial): MeshPhongMaterial {
  return bondStyleMaterial(type === 'full' ? undefined : { type }, fallback);
}

function bondKindToStyleType(kind: BondKind | undefined): BondStyleType {
  if (kind === 'Ts') return 'ts';
  if (kind === 'Dative') return 'dative';
  if (kind === 'Interaction') return 'interaction';
  if (kind === 'Thin') return 'thin';
  return 'full';
}

function updateAngleSelection(
  selection: AtomSelectionData[],
  clickedAtom: AtomSelectionData,
): AtomSelectionData[] {
  if (selection.length >= 4) {
    return [clickedAtom];
  }

  if (selection.length === 0) {
    return [clickedAtom];
  }

  if (selection[selection.length - 1].atomIndex === clickedAtom.atomIndex) {
    return selection;
  }

  return [...selection, clickedAtom];
}

function atomMaterial(color: string): MeshPhongMaterial {
  return new MeshPhongMaterial({
    color,
    shininess: 42,
    specular: new Color(0.18, 0.18, 0.18),
  });
}

function bondTransform(start: Vector3, end: Vector3, radius: number): Matrix4 {
  const UP = new Vector3(0, 1, 0);
  const dir = new Vector3().subVectors(end, start);
  const len = dir.length();
  const midpoint = new Vector3().addVectors(start, end).multiplyScalar(0.5);
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const dirNorm = dir.clone().normalize();

  if (Math.abs(dirNorm.dot(UP)) > 0.9999) {
    quaternion.setFromAxisAngle(new Vector3(1, 0, 0), dirNorm.y < 0 ? Math.PI : 0);
  } else {
    quaternion.setFromUnitVectors(UP, dirNorm);
  }

  return matrix.compose(midpoint, quaternion, new Vector3(radius, len, radius));
}

function removeOverlay(ctx: SceneCtx, mesh: Mesh | null): void {
  if (!mesh) return;
  ctx.molGroup.remove(mesh);
}

function clearOverlays(ctx: SceneCtx, overlays: Mesh[]): void {
  for (const overlay of overlays) {
    ctx.molGroup.remove(overlay);
  }
  overlays.length = 0;
}

function createAtomOverlay(ctx: SceneCtx, atom: AtomSelectionData): Mesh {
  const overlay = new Mesh(ctx.sphereGeom, ctx.selectedAtomMat);
  overlay.position.copy(atom.position);
  overlay.scale.setScalar(atom.baseRadius * 1.45);
  overlay.userData.atom = atom;
  ctx.molGroup.add(overlay);
  return overlay;
}

function createBondOverlay(ctx: SceneCtx, bond: BondSelectionData): Mesh {
  const overlay = new Mesh(ctx.cylGeom, ctx.selectedBondMat);
  overlay.applyMatrix4(bond.matrix);
  overlay.scale.multiplyScalar(1.22);
  overlay.userData.bond = bond;
  ctx.molGroup.add(overlay);
  return overlay;
}

function resolveAtomHit(hit: Intersection | undefined): AtomSelectionData | null {
  if (!hit || !(hit.object instanceof InstancedMesh) || typeof hit.instanceId !== 'number') {
    return null;
  }
  const atoms = hit.object.userData.atoms as AtomSelectionData[] | undefined;
  return atoms?.[hit.instanceId] ?? null;
}

function resolveBondHit(hit: Intersection | undefined): BondSelectionData | null {
  if (!hit) return null;
  if (hit.object instanceof InstancedMesh && typeof hit.instanceId === 'number') {
    const bonds = hit.object.userData.bonds as BondSelectionData[] | undefined;
    return bonds?.[hit.instanceId] ?? null;
  }
  if (hit.object instanceof Mesh) {
    return (hit.object.userData.bond as BondSelectionData | undefined) ?? null;
  }
  return null;
}

function pickScene(ctx: SceneCtx, mode: SelectionMode): PickResult {
  const totalStart = performance.now();
  let atomHit: Intersection | undefined;
  let bondHit: Intersection | undefined;
  let pickAtomMs: number | null = null;
  let pickBondMs: number | null = null;

  const pickAtoms = () => {
    const startedAt = performance.now();
    atomHit = ctx.raycaster.intersectObjects(ctx.atomPickObjects, false)[0];
    pickAtomMs = performance.now() - startedAt;
    return resolveAtomHit(atomHit);
  };

  const pickBonds = () => {
    const startedAt = performance.now();
    bondHit = ctx.raycaster.intersectObjects(ctx.bondPickObjects, false)[0];
    pickBondMs = performance.now() - startedAt;
    return resolveBondHit(bondHit);
  };

  let atom: AtomSelectionData | null = null;
  let bond: BondSelectionData | null = null;

  if (mode === 'label' || mode === 'atom') {
    atom = pickAtoms();
  } else if (mode === 'bond') {
    bond = pickBonds();
  } else if (mode === 'atom-bond' || mode === 'measure') {
    atom = pickAtoms();
    if (!atom) {
      bond = pickBonds();
    }
  }

  const pickTotalMs = performance.now() - totalStart;
  return {
    atom,
    bond,
    pickAtomMs,
    pickBondMs,
    pickTotalMs,
    pickHitType: atom ? 'atom' : bond ? 'bond' : 'none',
    pickAtomCandidates: ctx.atomPickObjects.reduce((sum, object) => sum + object.count, 0),
    pickBondCandidates: ctx.bondPickObjects.reduce((sum, object) => (
      sum + (object instanceof InstancedMesh ? object.count : 1)
    ), 0),
  };
}

function benchmarkPickMetrics(ctx: SceneCtx): PickMetrics {
  ctx.pointer.set(0, 0);
  ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
  const result = pickScene(ctx, 'atom-bond');
  return {
    pickAtomMs: result.pickAtomMs,
    pickBondMs: result.pickBondMs,
    pickTotalMs: result.pickTotalMs,
    pickHitType: result.pickHitType,
    pickAtomCandidates: result.pickAtomCandidates,
    pickBondCandidates: result.pickBondCandidates,
  };
}

function sceneRenderStats(ctx: SceneCtx): SceneRenderStats {
  let sceneObjects = 0;
  ctx.molGroup.traverse(() => {
    sceneObjects += 1;
  });

  return {
    renderCalls: ctx.renderer.info.render.calls,
    triangles: ctx.renderer.info.render.triangles,
    geometries: ctx.renderer.info.memory.geometries,
    textures: ctx.renderer.info.memory.textures,
    sceneObjects,
  };
}

function buildMoleculeVisibilityIndex(moleculeData: MoleculeData | null): MoleculeVisibilityIndex | null {
  if (!moleculeData || moleculeData.atoms.length === 0) return null;

  const adjacency = moleculeData.atoms.map(() => [] as number[]);
  const isHydrogen = moleculeData.atoms.map((atom) => atom.element === 'H');
  const isCarbonHydrogen = moleculeData.atoms.map(() => false);
  const bounds = new Box3();

  moleculeData.atoms.forEach((atom) => {
    const radius = Math.max(atomDisplayRadius(atom.element), atom.radius, 0.15);
    bounds.expandByPoint(new Vector3(atom.x - radius, atom.y - radius, atom.z - radius));
    bounds.expandByPoint(new Vector3(atom.x + radius, atom.y + radius, atom.z + radius));
  });

  for (const bond of moleculeData.bonds) {
    if (!moleculeData.atoms[bond.atom1] || !moleculeData.atoms[bond.atom2]) continue;
    adjacency[bond.atom1].push(bond.atom2);
    adjacency[bond.atom2].push(bond.atom1);
  }

  for (const [atomIndex, atom] of moleculeData.atoms.entries()) {
    if (atom.element !== 'H') continue;
    isCarbonHydrogen[atomIndex] = adjacency[atomIndex].some((neighborIndex) => (
      moleculeData.atoms[neighborIndex]?.element === 'C'
    ));
  }

  return {
    moleculeData,
    adjacency,
    isHydrogen,
    isCarbonHydrogen,
    bounds: bounds.isEmpty() ? null : bounds,
  };
}

function isAtomVisible(
  atomIndex: number,
  moleculeData: MoleculeData,
  hydrogenVisibility: HydrogenVisibility,
  hiddenAtomSet: Set<number>,
  visibilityIndex: MoleculeVisibilityIndex | null,
): boolean {
  const atom = moleculeData.atoms[atomIndex];
  if (!atom || hiddenAtomSet.has(atomIndex)) return false;
  if (hydrogenVisibility === 'hidden' && (visibilityIndex?.isHydrogen[atomIndex] ?? atom.element === 'H')) return false;
  if (hydrogenVisibility === 'hide-c-h' && (visibilityIndex?.isCarbonHydrogen[atomIndex] ?? false)) return false;
  return true;
}

function labelSourceVisible(
  label: PersistentLabel,
  moleculeData: MoleculeData | null,
  hydrogenVisibility: HydrogenVisibility,
  hiddenAtomSet: Set<number>,
  visibilityIndex: MoleculeVisibilityIndex | null,
): boolean {
  if (!moleculeData) return false;
  const atomIndices = label.source?.atomIndices
    ?? (typeof label.source?.atomIndex === 'number' ? [label.source.atomIndex] : undefined)
    ?? label.source?.bond;

  if (!atomIndices || atomIndices.length === 0) return true;
  return atomIndices.every((atomIndex) => (
    isAtomVisible(atomIndex, moleculeData, hydrogenVisibility, hiddenAtomSet, visibilityIndex)
  ));
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function sampleFrameTimes(durationMs: number): Promise<number[]> {
  return new Promise((resolve) => {
    const frameTimes: number[] = [];
    let startedAt: number | null = null;
    let previous: number | null = null;

    const tick = (timestamp: number) => {
      if (startedAt === null) {
        startedAt = timestamp;
        previous = timestamp;
        requestAnimationFrame(tick);
        return;
      }

      if (previous !== null) {
        frameTimes.push(timestamp - previous);
      }
      previous = timestamp;

      if (timestamp - startedAt >= durationMs) {
        resolve(frameTimes);
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

function webglDebugInfo(renderer: WebGLRenderer): { webglRenderer: string | null; webglVendor: string | null } {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (!debugInfo) {
    return { webglRenderer: null, webglVendor: null };
  }

  return {
    webglRenderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string,
    webglVendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string,
  };
}

export function MoleculeCanvas({
  moleculeData,
  hydrogenVisibility,
  hiddenAtomIndices,
  elementColorOverrides,
  atomStyleOverrides,
  bondStyleOverrides,
  atomSizeScale,
  materialPreset,
  viewOptions,
  distancePrecision,
  anglePrecision,
  pngExportScale,
  mouseMode,
  invertScrollZoom,
  onViewOptionsChange,
  onMaterialPresetChange,
  selectedBond,
  selectedAngle,
  selectedDihedral,
  persistentLabels,
  selectionMode,
  onBondSelected,
  onAngleSelected,
  onDihedralSelected,
  onPersistentLabelCreate,
  onSelectionSummaryChange,
  isLoading,
  loadingLabel,
  onOpenFile,
  onError,
  onToast,
  benchmarkConfig,
  onBenchmarkRender,
  previewMode = false,
  previewPose = null,
  previewCaptureToken = null,
  onPreviewCaptured,
  onPreviewError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<SceneCtx | null>(null);
  const bondLabelRef = useRef<HTMLDivElement>(null);
  const angleLabelRef = useRef<HTMLDivElement>(null);
  const dihedralLabelRef = useRef<HTMLDivElement>(null);
  const selectionModeRef = useRef<SelectionMode>(selectionMode);
  const viewOptionsRef = useRef<ViewOptions>(viewOptions);
  const persistentLabelsRef = useRef<PersistentLabel[]>(persistentLabels);
  const hiddenAtomIndicesRef = useRef<number[]>(hiddenAtomIndices);
  const hydrogenVisibilityRef = useRef<HydrogenVisibility>(hydrogenVisibility);
  const moleculeDataRef = useRef<MoleculeData | null>(moleculeData);
  const distancePrecisionRef = useRef(distancePrecision);
  const anglePrecisionRef = useRef(anglePrecision);
  const visibilityIndexRef = useRef<MoleculeVisibilityIndex | null>(null);
  const viewOptionsForPoseRef = useRef<ViewOptions>(viewOptions);
  const persistentLabelRefs = useRef(new Map<string, HTMLDivElement>());
  const previousMoleculeDataRef = useRef<MoleculeData | null>(null);
  const visibilityIndex = useMemo(() => buildMoleculeVisibilityIndex(moleculeData), [moleculeData]);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  useEffect(() => {
    viewOptionsRef.current = viewOptions;
    viewOptionsForPoseRef.current = viewOptions;
  }, [viewOptions]);

  useEffect(() => {
    persistentLabelsRef.current = persistentLabels;
  }, [persistentLabels]);

  useEffect(() => {
    hiddenAtomIndicesRef.current = hiddenAtomIndices;
  }, [hiddenAtomIndices]);

  useEffect(() => {
    hydrogenVisibilityRef.current = hydrogenVisibility;
  }, [hydrogenVisibility]);

  useEffect(() => {
    moleculeDataRef.current = moleculeData;
  }, [moleculeData]);

  useEffect(() => {
    distancePrecisionRef.current = distancePrecision;
    anglePrecisionRef.current = anglePrecision;
  }, [anglePrecision, distancePrecision]);

  useEffect(() => {
    visibilityIndexRef.current = visibilityIndex;
  }, [visibilityIndex]);

  const renderCurrentViewDataUrl = useCallback((maxWidth?: number) => {
    const ctx = ctxRef.current;
    const host = containerRef.current;
    if (!ctx) throw new Error('Molecule canvas is not ready.');
    if (!moleculeData) {
      throw new Error('Load a molecule before exporting a PNG.');
    }

    const renderer = ctx.renderer;
    const sourceCanvas = renderer.domElement;
    const originalPixelRatio = renderer.getPixelRatio();
    const originalSize = new Vector2();
    renderer.getSize(originalSize);
    const cssWidth = sourceCanvas.clientWidth || originalSize.x || 800;
    const cssHeight = sourceCanvas.clientHeight || originalSize.y || 600;
    const exportScale = maxWidth ? 1 : Math.max(1, pngExportScale);
    const shouldRenderScaled = !maxWidth && exportScale > 1;

    try {
      if (shouldRenderScaled) {
        const renderWidth = Math.max(1, Math.round(cssWidth * exportScale));
        const renderHeight = Math.max(1, Math.round(cssHeight * exportScale));
        renderer.setPixelRatio(1);
        renderer.setSize(renderWidth, renderHeight, false);
        ctx.perspectiveCamera.aspect = renderWidth / renderHeight;
        ctx.perspectiveCamera.updateProjectionMatrix();
      }

      renderer.render(ctx.scene, ctx.camera);

      const outputScale = maxWidth && sourceCanvas.width > maxWidth
        ? maxWidth / sourceCanvas.width
        : 1;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = Math.max(1, Math.round(sourceCanvas.width * outputScale));
      exportCanvas.height = Math.max(1, Math.round(sourceCanvas.height * outputScale));
      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) {
        throw new Error('Could not prepare PNG export canvas.');
      }

      exportCtx.drawImage(sourceCanvas, 0, 0, exportCanvas.width, exportCanvas.height);
      if (host) {
        const scaleX = exportCanvas.width / cssWidth;
        const scaleY = exportCanvas.height / cssHeight;
        const hostRect = host.getBoundingClientRect();
        const labels = host.querySelectorAll<HTMLElement>(
          '.bond-distance-label, .angle-measure-label, .dihedral-measure-label, .persistent-label',
        );

        for (const label of labels) {
          const text = label.textContent?.trim();
          if (!text || label.style.display === 'none') continue;
          const rect = label.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const styles = window.getComputedStyle(label);
          const x = (rect.left - hostRect.left) * scaleX;
          const y = (rect.top - hostRect.top) * scaleY;
          const width = rect.width * scaleX;
          const height = rect.height * scaleY;
          const radius = Math.min(12 * scaleX, height / 2);

          exportCtx.save();
          exportCtx.fillStyle = styles.backgroundColor || 'rgba(255, 255, 255, 0.92)';
          exportCtx.strokeStyle = styles.borderColor || 'rgba(160, 175, 190, 0.85)';
          exportCtx.lineWidth = Math.max(1, scaleX);
          exportCtx.beginPath();
          exportCtx.roundRect(x, y, width, height, radius);
          exportCtx.fill();
          exportCtx.stroke();
          exportCtx.fillStyle = styles.color || '#1f2933';
          exportCtx.font = `${styles.fontWeight || '700'} ${Number.parseFloat(styles.fontSize || '12') * scaleY}px ${styles.fontFamily || 'sans-serif'}`;
          exportCtx.textAlign = 'center';
          exportCtx.textBaseline = 'middle';
          exportCtx.fillText(text, x + width / 2, y + height / 2, width - 8 * scaleX);
          exportCtx.restore();
        }
      }

      return exportCanvas.toDataURL('image/png');
    } finally {
      if (shouldRenderScaled) {
        renderer.setPixelRatio(originalPixelRatio);
        renderer.setSize(originalSize.x, originalSize.y, false);
        ctx.perspectiveCamera.aspect = cssWidth / cssHeight;
        ctx.perspectiveCamera.updateProjectionMatrix();
        renderer.render(ctx.scene, ctx.camera);
      }
    }
  }, [moleculeData, pngExportScale]);

  // ------------------------------------------------------------------
  // Init Three.js once
  // ------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth  || 800;
    const h = container.clientHeight || 600;

    // preserveDrawingBuffer is required for toDataURL PNG export
    const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color(0xffffff);
    scene.fog = new Fog(0xffffff, 42, 120);

    const camera = new PerspectiveCamera(35, w / h, 0.1, 1000);
    const orthographicCamera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    camera.position.set(0, 0, 25);
    orthographicCamera.position.copy(camera.position);

    // Bright, print-oriented lighting tuned toward the CYLview reference.
    const ambient = new AmbientLight(0xffffff, 0.52);
    scene.add(ambient);

    const key = new DirectionalLight(0xffffff, 1.65);
    key.position.set(3.2, 4.4, 6.4);
    scene.add(key);

    const fill = new DirectionalLight(0xffffff, 0.72);
    fill.position.set(-5.2, 1.4, 3.2);
    scene.add(fill);

    const rim = new DirectionalLight(0xffffff, 0.24);
    rim.position.set(-1.6, -3.6, -4.8);
    scene.add(rim);

    const topLight = new DirectionalLight(0xffffff, 0.35);
    topLight.position.set(0, 7, 1.5);
    scene.add(topLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.mouseButtons = mouseMode === 'one-button'
      ? {
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.PAN,
          RIGHT: MOUSE.PAN,
        }
      : {
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.PAN,
        };
    controls.zoomSpeed = invertScrollZoom ? -1 : 1;

    const molGroup = new Group();
    scene.add(molGroup);

    const floorGroup = new Group();
    const floorMat = new MeshBasicMaterial({
      color: 0x2d3035,
      side: DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const floorPlane = new Mesh(new PlaneGeometry(1, 1), floorMat);
    floorPlane.rotation.x = -Math.PI / 2;
    const floorGrid = new GridHelper(10, 20, 0x737983, 0x4c525a);
    floorGroup.add(floorPlane);
    floorGroup.add(floorGrid);
    floorGroup.visible = false;
    scene.add(floorGroup);

    // Shared geometries — 16-segment cylinders for smooth tubes
    const sphereGeom = new SphereGeometry(1, 20, 16);
    const cylGeom    = new CylinderGeometry(1, 1, 1, 24);

    // Saturated cyan cylinders with enough gloss to read like polished tubes.
    const bondMat = new MeshPhongMaterial({
      color:     MATERIAL_PRESETS[materialPreset].bondColor,
      shininess: MATERIAL_PRESETS[materialPreset].shininess,
      specular:  MATERIAL_PRESETS[materialPreset].specular.clone(),
    });
    const selectedBondMat = new MeshPhongMaterial({
      color:     0xffa24c,
      shininess: 190,
      specular:  new Color(0.98, 0.88, 0.78),
    });
    const selectedAtomMat = new MeshPhongMaterial({
      color:     0xffbf73,
      shininess: 150,
      specular:  new Color(0.98, 0.9, 0.78),
    });

    const atomMats = new Map<string, MeshPhongMaterial>();
    const raycaster = new Raycaster();
    const pointer = new Vector2();

    // Render loop
    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      const bondLabel = bondLabelRef.current;
      const selectedBond = ctxRef.current?.selectedBondData;
      const activeCamera = ctxRef.current?.camera ?? camera;
      if (bondLabel && selectedBond) {
        const projected = selectedBond.midpoint.clone().project(activeCamera);
        const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
        const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
        const visible = projected.z >= -1 && projected.z <= 1;

        bondLabel.style.display = visible ? 'block' : 'none';
        bondLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        bondLabel.textContent = formatDistance(selectedBond.distance, distancePrecisionRef.current);
      } else if (bondLabel) {
        bondLabel.style.display = 'none';
      }

      const angleLabel = angleLabelRef.current;
      const anglePosition = ctxRef.current?.angleLabelPosition;
      const angleDegrees = ctxRef.current?.angleDegrees;
      if (angleLabel && anglePosition && typeof angleDegrees === 'number') {
        const projected = anglePosition.clone().project(activeCamera);
        const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
        const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
        const visible = projected.z >= -1 && projected.z <= 1;

        angleLabel.style.display = visible ? 'block' : 'none';
        angleLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        angleLabel.textContent = formatAngle(angleDegrees, anglePrecisionRef.current);
      } else if (angleLabel) {
        angleLabel.style.display = 'none';
      }

      const dihedralLabel = dihedralLabelRef.current;
      const dihedralPosition = ctxRef.current?.dihedralLabelPosition;
      const dihedralDegrees = ctxRef.current?.dihedralDegrees;
      if (dihedralLabel && dihedralPosition && typeof dihedralDegrees === 'number') {
        const projected = dihedralPosition.clone().project(activeCamera);
        const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
        const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
        const visible = projected.z >= -1 && projected.z <= 1;

        dihedralLabel.style.display = visible ? 'block' : 'none';
        dihedralLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        dihedralLabel.textContent = formatAngle(dihedralDegrees, anglePrecisionRef.current);
      } else if (dihedralLabel) {
        dihedralLabel.style.display = 'none';
      }

      const currentMoleculeData = moleculeDataRef.current;
      const currentVisibilityIndex = visibilityIndexRef.current;
      const currentHiddenAtomSet = new Set(hiddenAtomIndicesRef.current);
      const currentHydrogenVisibility = hydrogenVisibilityRef.current;

      for (const label of persistentLabelsRef.current) {
        const labelElement = persistentLabelRefs.current.get(label.id);
        if (!labelElement) continue;
        if (
          !label.visible ||
          !labelSourceVisible(
            label,
            currentMoleculeData,
            currentHydrogenVisibility,
            currentHiddenAtomSet,
            currentVisibilityIndex,
          )
        ) {
          labelElement.style.display = 'none';
          continue;
        }

        const projected = new Vector3(label.anchor.x, label.anchor.y, label.anchor.z)
          .project(activeCamera);
        const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
        const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
        const visible = projected.z >= -1 && projected.z <= 1;

        labelElement.style.display = visible ? 'block' : 'none';
        labelElement.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 10}px)`;
      }
      renderer.render(scene, activeCamera);
    }
    animate();

    ctxRef.current = {
      renderer, scene, camera, perspectiveCamera: camera, orthographicCamera, controls,
      molGroup, floorGroup, floorPlane, floorGrid, floorMat,
      lights: { ambient, key, fill, rim, topLight },
      lastCameraDistance: 25,
      lastMoleculeBox: null,
      animId,
      sphereGeom, cylGeom, atomMats, bondMat, selectedBondMat,
      raycaster, pointer, selectedBondOverlay: null, selectedBondData: null, bondPickObjects: [],
      selectedAtomMat, atomPickObjects: [], selectedAtomOverlays: [], modeSelectedAtomOverlays: [],
      modeSelectedBondOverlays: [], modeSelectedAtoms: [], modeSelectedBonds: [], angleSelection: [],
      angleLabelPosition: null, angleDegrees: null, dihedralLabelPosition: null,
      dihedralDegrees: null,
    };

    // Resize
    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      renderer.setSize(cw, ch);
      const current = ctxRef.current;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      if (current) syncOrthographicCamera(current);
    });
    ro.observe(container);

    // Toolbar button and global keyboard shortcut
    const onReset = () => ctxRef.current?.controls.reset();

    const onCaptureCameraPose = (event: Event) => {
      const current = ctxRef.current;
      if (!current) return;
      const detail = (event as CustomEvent<{ updatePoseId?: string }>).detail;
      const payload = {
        updatePoseId: detail?.updatePoseId,
        cameraPosition: {
          x: current.camera.position.x,
          y: current.camera.position.y,
          z: current.camera.position.z,
        },
        target: {
          x: current.controls.target.x,
          y: current.controls.target.y,
          z: current.controls.target.z,
        },
        projection: viewOptionsForPoseRef.current.projection,
        viewOptions: viewOptionsForPoseRef.current,
      };
      window.dispatchEvent(new CustomEvent('camera-pose-captured', { detail: payload }));
    };
    window.addEventListener('capture-camera-pose', onCaptureCameraPose);

    const onApplyCameraPose = (event: Event) => {
      const current = ctxRef.current;
      const pose = (event as CustomEvent<SavedPose>).detail;
      if (!current || !pose) return;
      applySavedPoseToContext(current, pose);
    };
    if (!previewMode) {
      window.addEventListener('reset-camera', onReset);
      window.addEventListener('capture-camera-pose', onCaptureCameraPose);
      window.addEventListener('apply-camera-pose', onApplyCameraPose);
    }

    let pointerDown = { x: 0, y: 0 };
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };

    const clearMeasurementSelection = () => {
      const current = ctxRef.current;
      if (!current) return;
      removeOverlay(current, current.selectedBondOverlay);
      current.selectedBondOverlay = null;
      current.selectedBondData = null;
      clearOverlays(current, current.selectedAtomOverlays);
      current.angleSelection = [];
      current.angleLabelPosition = null;
      current.angleDegrees = null;
      current.dihedralLabelPosition = null;
      current.dihedralDegrees = null;
      onBondSelected(null);
      onAngleSelected(null);
      onDihedralSelected(null);
    };

    const clearSelection = () => {
      const current = ctxRef.current;
      if (!current) return;
      clearMeasurementSelection();
      clearOverlays(current, current.modeSelectedAtomOverlays);
      clearOverlays(current, current.modeSelectedBondOverlays);
      current.modeSelectedAtoms = [];
      current.modeSelectedBonds = [];
      onSelectionSummaryChange({ atomCount: 0, bondCount: 0, atomIndices: [], bondKeys: [] });
    };

    const publishModeSelectionSummary = (current: SceneCtx) => {
      onSelectionSummaryChange({
        atomCount: current.modeSelectedAtoms.length,
        bondCount: current.modeSelectedBonds.length,
        atomIndices: current.modeSelectedAtoms.map((atom) => atom.atomIndex),
        bondKeys: current.modeSelectedBonds.map((bond) => bondKey(bond.atom1Index, bond.atom2Index)),
      });
    };

    const toggleModeAtom = (atom: AtomSelectionData) => {
      const current = ctxRef.current;
      if (!current) return;
      const index = current.modeSelectedAtoms.findIndex((candidate) => candidate.atomIndex === atom.atomIndex);
      if (index >= 0) {
        current.modeSelectedAtoms.splice(index, 1);
        const [overlay] = current.modeSelectedAtomOverlays.splice(index, 1);
        removeOverlay(current, overlay ?? null);
      } else {
        current.modeSelectedAtoms.push(atom);
        current.modeSelectedAtomOverlays.push(createAtomOverlay(current, atom));
      }
      publishModeSelectionSummary(current);
    };

    const toggleModeBond = (bond: BondSelectionData) => {
      const current = ctxRef.current;
      if (!current) return;
      const key = bondKey(bond.atom1Index, bond.atom2Index);
      const index = current.modeSelectedBonds.findIndex(
        (candidate) => bondKey(candidate.atom1Index, candidate.atom2Index) === key,
      );
      if (index >= 0) {
        current.modeSelectedBonds.splice(index, 1);
        const [overlay] = current.modeSelectedBondOverlays.splice(index, 1);
        removeOverlay(current, overlay ?? null);
      } else {
        current.modeSelectedBonds.push(bond);
        current.modeSelectedBondOverlays.push(createBondOverlay(current, bond));
      }
      publishModeSelectionSummary(current);
    };

    const onPointerUp = (event: PointerEvent) => {
      const current = ctxRef.current;
      const host = containerRef.current;
      if (!current || !host) return;

      const movedX = Math.abs(event.clientX - pointerDown.x);
      const movedY = Math.abs(event.clientY - pointerDown.y);
      if (movedX > 4 || movedY > 4) return;

      const rect = host.getBoundingClientRect();
      current.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      current.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      current.raycaster.setFromCamera(current.pointer, current.camera);

      const activeMode = selectionModeRef.current;

      if (activeMode === 'view') {
        return;
      }

      const pick = pickScene(current, activeMode);
      const { atom, bond } = pick;
      if (perfLoggingEnabled()) {
        console.info(
          '[Cylform perf] pick',
          {
            totalMs: Math.round(pick.pickTotalMs * 100) / 100,
            atomMs: pick.pickAtomMs === null ? null : Math.round(pick.pickAtomMs * 100) / 100,
            bondMs: pick.pickBondMs === null ? null : Math.round(pick.pickBondMs * 100) / 100,
            hit: pick.pickHitType,
            atoms: pick.pickAtomCandidates,
            bonds: pick.pickBondCandidates,
            mode: activeMode,
          },
        );
      }

      if (activeMode === 'label') {
        clearMeasurementSelection();
        if (atom) {
          const serial = atom.atomIndex + 1;
          onPersistentLabelCreate({
            type: 'AtomLabel',
            text: `${atom.element}${serial}`,
            anchor: {
              x: atom.position.x,
              y: atom.position.y + 0.25,
              z: atom.position.z,
            },
            atom_id: atom.atomIndex,
            source: { atomIndex: atom.atomIndex },
          });
        }
        return;
      }

      if (activeMode === 'atom' || activeMode === 'bond' || activeMode === 'atom-bond') {
        clearMeasurementSelection();
        if (
          (activeMode === 'atom' || activeMode === 'atom-bond') &&
          atom
        ) {
          toggleModeAtom(atom);
          return;
        }

        if (
          (activeMode === 'bond' || activeMode === 'atom-bond') &&
          bond
        ) {
          toggleModeBond(bond);
        }
        return;
      }

      if (atom) {
        removeOverlay(current, current.selectedBondOverlay);
        current.selectedBondOverlay = null;
        current.selectedBondData = null;
        onBondSelected(null);

        clearOverlays(current, current.selectedAtomOverlays);
        current.angleSelection = updateAngleSelection(current.angleSelection, atom);
        current.selectedAtomOverlays = current.angleSelection.map((selectedAtom) => (
          createAtomOverlay(current, selectedAtom)
        ));

        if (current.angleSelection.length === 1) {
          current.angleLabelPosition = null;
          current.angleDegrees = null;
          current.dihedralLabelPosition = null;
          current.dihedralDegrees = null;
          onAngleSelected({
            atomElements: [atom.element, '', ''],
            angleDegrees: 0,
            stage: 1,
          });
          onDihedralSelected({
            atomElements: [atom.element, '', '', ''],
            dihedralDegrees: 0,
            stage: 1,
          });
          return;
        }

        if (current.angleSelection.length === 2) {
          current.angleLabelPosition = null;
          current.angleDegrees = null;
          current.dihedralLabelPosition = null;
          current.dihedralDegrees = null;
          onAngleSelected({
            atomElements: [
              current.angleSelection[0].element,
              current.angleSelection[1].element,
              '',
            ],
            angleDegrees: 0,
            stage: 2,
          });
          onDihedralSelected({
            atomElements: [
              current.angleSelection[0].element,
              current.angleSelection[1].element,
              '',
              '',
            ],
            dihedralDegrees: 0,
            stage: 2,
          });
          return;
        }

        const [a, b, c, d] = current.angleSelection;
        const pa = a.position.clone();
        const pb = b.position.clone();
        const pc = c.position.clone();
        const ba = pa.sub(pb);
        const bc = pc.sub(pb);
        const baLen = ba.length();
        const bcLen = bc.length();

        if (baLen < 1e-4 || bcLen < 1e-4) {
          clearSelection();
          return;
        }

        const baNorm = ba.clone().normalize();
        const bcNorm = bc.clone().normalize();
        const angleRadians = Math.acos(clamp(baNorm.dot(bcNorm), -1, 1));
        const angleDegrees = MathUtils.radToDeg(angleRadians);
        const bisector = baNorm.add(bcNorm);
        const offsetDirection =
          bisector.lengthSq() > 1e-6 ? bisector.normalize() : new Vector3(0.35, 0.35, 0);

        current.angleDegrees = angleDegrees;
        current.angleLabelPosition = b.position.clone().add(offsetDirection.multiplyScalar(0.9));
        const angleAnchor = current.angleLabelPosition.clone();
        onAngleSelected({
          atomElements: [
            a.element,
            b.element,
            c.element,
          ],
          angleDegrees,
          stage: 3,
          anchor: { x: angleAnchor.x, y: angleAnchor.y, z: angleAnchor.z },
          atomIndices: [
            a.atomIndex,
            b.atomIndex,
            c.atomIndex,
          ],
        });

        if (current.angleSelection.length === 3) {
          current.dihedralLabelPosition = null;
          current.dihedralDegrees = null;
          onDihedralSelected({
            atomElements: [
              a.element,
              b.element,
              c.element,
              '',
            ],
            dihedralDegrees: 0,
            stage: 3,
          });
          return;
        }

        const pd = d.position.clone();
        const b0 = new Vector3().subVectors(pa, pb);
        const b1 = new Vector3().subVectors(pc, pb);
        const b2 = new Vector3().subVectors(pd, pc);
        const b1Len = b1.length();

        if (b1Len < 1e-4) {
          clearSelection();
          return;
        }

        const b1Norm = b1.clone().normalize();
        const v = b0.sub(b1Norm.clone().multiplyScalar(b0.dot(b1Norm)));
        const w = b2.sub(b1Norm.clone().multiplyScalar(b2.dot(b1Norm)));
        const vLen = v.length();
        const wLen = w.length();

        if (vLen < 1e-4 || wLen < 1e-4) {
          clearSelection();
          return;
        }

        const x = v.normalize().dot(w.normalize());
        const y = new Vector3().crossVectors(b1Norm, v).dot(w);
        const dihedralDegrees = MathUtils.radToDeg(Math.atan2(y, x));
        current.dihedralDegrees = dihedralDegrees;
        current.dihedralLabelPosition = new Vector3()
          .addVectors(b.position, c.position)
          .multiplyScalar(0.5)
          .add(new Vector3(0.35, 0.35, 0));
        const dihedralAnchor = current.dihedralLabelPosition.clone();
        onDihedralSelected({
          atomElements: [
            a.element,
            b.element,
            c.element,
            d.element,
          ],
          dihedralDegrees,
          stage: 4,
          anchor: { x: dihedralAnchor.x, y: dihedralAnchor.y, z: dihedralAnchor.z },
          atomIndices: [
            a.atomIndex,
            b.atomIndex,
            c.atomIndex,
            d.atomIndex,
          ],
        });
        return;
      }

      if (!bond) {
        clearSelection();
        return;
      }

      clearOverlays(current, current.selectedAtomOverlays);
      current.angleSelection = [];
      current.angleLabelPosition = null;
      current.angleDegrees = null;
      current.dihedralLabelPosition = null;
      current.dihedralDegrees = null;
      onAngleSelected(null);
      onDihedralSelected(null);

      removeOverlay(current, current.selectedBondOverlay);
      current.selectedBondOverlay = createBondOverlay(current, bond);

      current.selectedBondData = bond;
      onBondSelected({
        atom1Element: bond.atom1Element,
        atom2Element: bond.atom2Element,
        distance: bond.distance,
        anchor: { x: bond.midpoint.x, y: bond.midpoint.y, z: bond.midpoint.z },
        atomIndices: [bond.atom1Index, bond.atom2Index],
      });
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // PNG export
    const onExport = async () => {
      if (!moleculeData) {
        onError('Load a molecule before exporting a PNG.');
        return;
      }

      try {
        const defaultName = `${moleculeData.name || 'molecule'}.png`
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
          .replace(/\s+/g, '_');

        const targetPath = await save({
          title: 'Export Current View as PNG',
          defaultPath: defaultName,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        });

        if (!targetPath) return;

        const pngBytes = dataUrlToBytes(renderCurrentViewDataUrl());
        await writeFile(targetPath, pngBytes);
        onToast(`Exported PNG to ${targetPath.split(/[\\/]/).pop() ?? 'file'}`, 'success');
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      }
    };
    if (!previewMode) {
      window.addEventListener('export-png', onExport);
    }

    const onClearSelection = () => clearSelection();
    if (!previewMode) {
      window.addEventListener('clear-selection', onClearSelection);
    }

    return () => {
      ro.disconnect();
      window.removeEventListener('reset-camera', onReset);
      window.removeEventListener('capture-camera-pose', onCaptureCameraPose);
      window.removeEventListener('apply-camera-pose', onApplyCameraPose);
      window.removeEventListener('export-png', onExport);
      window.removeEventListener('clear-selection', onClearSelection);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      cancelAnimationFrame(animId);
      sphereGeom.dispose();
      cylGeom.dispose();
      floorPlane.geometry.dispose();
      floorMat.dispose();
      bondMat.dispose();
      selectedBondMat.dispose();
      selectedAtomMat.dispose();
      atomMats.forEach(m => m.dispose());
      renderer.dispose();
      container.removeChild(renderer.domElement);
      ctxRef.current = null;
    };
  }, [
    moleculeData,
    onAngleSelected,
    onBondSelected,
    onDihedralSelected,
    onError,
    onPersistentLabelCreate,
    onSelectionSummaryChange,
    onToast,
    previewMode,
    renderCurrentViewDataUrl,
  ]);

  useEffect(() => {
    if (!previewMode || !previewCaptureToken || !previewPose) return;
    let cancelled = false;

    const waitFrame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const capture = async () => {
      try {
        await waitFrame();
        await waitFrame();
        if (cancelled) return;
        const ctx = ctxRef.current;
        if (!ctx) throw new Error('Preview renderer is not ready.');
        applySavedPoseToContext(ctx, previewPose);
        await waitFrame();
        await waitFrame();
        if (cancelled) return;
        onPreviewCaptured?.(previewCaptureToken, renderCurrentViewDataUrl(400));
      } catch (error) {
        if (cancelled) return;
        onPreviewError?.(
          previewCaptureToken,
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    void capture();

    return () => {
      cancelled = true;
    };
  }, [
    onPreviewCaptured,
    onPreviewError,
    previewCaptureToken,
    previewMode,
    previewPose,
    renderCurrentViewDataUrl,
  ]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    applyMaterialPreset(ctx.bondMat, materialPreset);
    ctx.molGroup.traverse((object) => {
      if (object instanceof InstancedMesh && object.material instanceof MeshPhongMaterial) {
        const bonds = object.userData.bonds as BondSelectionData[] | undefined;
        if (bonds && object.material === ctx.bondMat) {
          applyMaterialPreset(object.material, materialPreset);
        }
      }
    });
  }, [materialPreset]);

  // ------------------------------------------------------------------
  // Rebuild molecule meshes when topology or visibility changes.
  // ------------------------------------------------------------------
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const perfStart = performance.now();

    const {
      molGroup, perspectiveCamera, camera, controls, sphereGeom, cylGeom, atomMats, bondMat,
      selectedBondMat, selectedAtomMat,
    } = ctx;
    const shouldFitCamera = moleculeData !== previousMoleculeDataRef.current;

    // Clear previous molecule batches while keeping shared base materials alive.
    const sharedAtomMaterials = new Set(atomMats.values());
    molGroup.traverse(obj => {
      if (
        (obj instanceof Mesh || obj instanceof InstancedMesh) &&
        obj.material !== bondMat &&
        obj.material !== selectedBondMat &&
        obj.material !== selectedAtomMat &&
        !sharedAtomMaterials.has(obj.material as MeshPhongMaterial)
      ) {
        (obj.material as Material).dispose();
      }
    });
    molGroup.clear();
    ctx.bondPickObjects = [];
    ctx.atomPickObjects = [];
    ctx.selectedBondOverlay = null;
    ctx.selectedBondData = null;
    ctx.selectedAtomOverlays = [];
    ctx.modeSelectedAtomOverlays = [];
    ctx.modeSelectedBondOverlays = [];
    ctx.modeSelectedAtoms = [];
    ctx.modeSelectedBonds = [];
    ctx.angleSelection = [];
    ctx.angleLabelPosition = null;
    ctx.angleDegrees = null;
    ctx.dihedralLabelPosition = null;
    ctx.dihedralDegrees = null;
    onBondSelected(null);
    onAngleSelected(null);
    onDihedralSelected(null);
    onSelectionSummaryChange({ atomCount: 0, bondCount: 0, atomIndices: [], bondKeys: [] });

    if (!moleculeData || moleculeData.atoms.length === 0) {
      ctx.lastMoleculeBox = null;
      updateFloorPlacement(ctx);
      previousMoleculeDataRef.current = moleculeData;
      return;
    }

    const activeVisibilityIndex = visibilityIndex?.moleculeData === moleculeData ? visibilityIndex : null;
    const hiddenAtomSet = new Set(hiddenAtomIndices);
    let visibleBondCount = 0;
    let visibleAtomCount = 0;
    const atomBuckets = new Map<string, { material: MeshPhongMaterial; atoms: AtomSelectionData[] }>();
    const bondBuckets = new Map<BondStyleType, { material: MeshPhongMaterial; bonds: BondSelectionData[] }>();

    const addBondToBucket = (styleType: BondStyleType, bondData: BondSelectionData) => {
      let bucket = bondBuckets.get(styleType);
      if (!bucket) {
        bucket = {
          material: styleType === 'full' ? bondMat : bondMaterialForType(styleType, bondMat),
          bonds: [],
        };
        bondBuckets.set(styleType, bucket);
      }
      bucket.bonds.push(bondData);
    };

    // --- Bonds first (atoms rendered on top) ---
    for (const bond of moleculeData.bonds) {
      const a1 = moleculeData.atoms[bond.atom1];
      const a2 = moleculeData.atoms[bond.atom2];
      if (!a1 || !a2) continue;
      if (
        !isAtomVisible(bond.atom1, moleculeData, hydrogenVisibility, hiddenAtomSet, activeVisibilityIndex) ||
        !isAtomVisible(bond.atom2, moleculeData, hydrogenVisibility, hiddenAtomSet, activeVisibilityIndex)
      ) {
        continue;
      }

      const start   = new Vector3(a1.x, a1.y, a1.z);
      const end     = new Vector3(a2.x, a2.y, a2.z);
      const dir     = new Vector3().subVectors(end, start);
      const len     = dir.length();
      if (len < 0.01) continue;

      const styleType = bondStyleOverrides[bondKey(bond.atom1, bond.atom2)]?.type ?? bondKindToStyleType(bond.kind);
      const displayRadius = styleType === 'thin'
        ? Math.max(0.026, bond.radius * 0.38)
        : Math.max(0.055, bond.radius * 0.82);
      const bondData = {
        atom1Element: a1.element,
        atom2Element: a2.element,
        distance: len,
        midpoint: new Vector3().addVectors(start, end).multiplyScalar(0.5),
        atom1Index: bond.atom1,
        atom2Index: bond.atom2,
        displayRadius,
        matrix: bondTransform(start, end, displayRadius),
      } satisfies BondSelectionData;

      addBondToBucket(styleType, bondData);

      visibleBondCount += 1;
    }

    for (const bucket of bondBuckets.values()) {
      const bondBatch = new InstancedMesh(cylGeom, bucket.material, bucket.bonds.length);
      bucket.bonds.forEach((bond, index) => {
        bondBatch.setMatrixAt(index, bond.matrix);
      });
      bondBatch.instanceMatrix.needsUpdate = true;
      bondBatch.userData.bonds = bucket.bonds;
      molGroup.add(bondBatch);
      ctx.bondPickObjects.push(bondBatch);
    }

    // --- Atoms on top ---
    for (const [atomIndex, atom] of moleculeData.atoms.entries()) {
      if (!isAtomVisible(atomIndex, moleculeData, hydrogenVisibility, hiddenAtomSet, activeVisibilityIndex)) continue;

      const atomStyle = atomStyleOverrides[String(atomIndex)];
      const color = atomStyle?.color ?? elementColorOverrides[atom.element] ?? atomColorHex(atom.element);
      const r = atomDisplayRadius(atom.element) * (atomStyle?.sizeScale ?? 1) * atomSizeScale;
      const bucketKey = `${atom.element}|${color}|${r.toFixed(4)}`;
      let bucket = atomBuckets.get(bucketKey);
      if (!bucket) {
        const material = atomStyle?.color || elementColorOverrides[atom.element]
          ? atomMaterial(color)
          : (atomMats.get(atom.element) ?? atomMaterial(color));
        if (!atomStyle?.color && !elementColorOverrides[atom.element] && !atomMats.has(atom.element)) {
          atomMats.set(atom.element, material);
        }
        bucket = { material, atoms: [] };
        atomBuckets.set(bucketKey, bucket);
      }
      bucket.atoms.push({
        element: atom.element,
        atomIndex,
        position: new Vector3(atom.x, atom.y, atom.z),
        baseRadius: r,
      });
      visibleAtomCount += 1;
    }

    const atomMatrix = new Matrix4();
    for (const bucket of atomBuckets.values()) {
      const atomBatch = new InstancedMesh(sphereGeom, bucket.material, bucket.atoms.length);
      bucket.atoms.forEach((atom, index) => {
        atomMatrix.makeScale(atom.baseRadius, atom.baseRadius, atom.baseRadius);
        atomMatrix.setPosition(atom.position);
        atomBatch.setMatrixAt(index, atomMatrix);
      });
      atomBatch.instanceMatrix.needsUpdate = true;
      atomBatch.userData.atoms = bucket.atoms;
      molGroup.add(atomBatch);
      ctx.atomPickObjects.push(atomBatch);
    }

    // --- Fit camera ---
    const box = activeVisibilityIndex?.bounds?.clone() ?? new Box3().setFromObject(molGroup);
    ctx.lastMoleculeBox = box.isEmpty() ? null : box.clone();
    updateFloorPlacement(ctx);
    const currentViewOptions = viewOptionsRef.current;
    ctx.floorGroup.visible = Boolean(
      ctx.lastMoleculeBox && (currentViewOptions.showFloor || currentViewOptions.showGrid),
    );
    ctx.floorPlane.visible = currentViewOptions.showFloor;
    ctx.floorGrid.visible = currentViewOptions.showGrid;

    if (shouldFitCamera && ctx.lastMoleculeBox) {
      const size   = box.getSize(new Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fovRad = perspectiveCamera.fov * (Math.PI / 180);
      const dist   = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.9;

      perspectiveCamera.near = dist / 100;
      perspectiveCamera.far  = dist * 100;
      perspectiveCamera.updateProjectionMatrix();
      camera.near = dist / 100;
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
      camera.position.set(0.15, 0.1, dist);
      controls.target.set(0, 0, 0);
      controls.update();
      controls.saveState();
      ctx.lastCameraDistance = dist;
      if (camera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
    }

    previousMoleculeDataRef.current = moleculeData;
    const rebuildSceneMs = performance.now() - perfStart;
    ctx.renderer.render(ctx.scene, ctx.camera);
    const renderStats = sceneRenderStats(ctx);
    if (perfLoggingEnabled()) {
      console.info(
        '[Cylform perf] rebuild_scene',
        {
          ms: Math.round(rebuildSceneMs),
          atoms: visibleAtomCount,
          bonds: visibleBondCount,
          totalAtoms: moleculeData.atoms.length,
          totalBonds: moleculeData.bonds.length,
          renderCalls: renderStats.renderCalls,
          triangles: renderStats.triangles,
          geometries: renderStats.geometries,
          textures: renderStats.textures,
          sceneObjects: renderStats.sceneObjects,
        },
      );
    }

    if (benchmarkConfig?.enabled && onBenchmarkRender && shouldFitCamera) {
      const sampleMs = benchmarkConfig.sampleMs || 3000;
      const targetFrameMs = 1000 / (benchmarkConfig.targetFps || 30);
      void sampleFrameTimes(sampleMs).then((frameTimes) => {
        const debugInfo = webglDebugInfo(ctx.renderer);
        const pickMetrics = benchmarkPickMetrics(ctx);
        const averageFrameMs = frameTimes.length > 0
          ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
          : null;
        const p95FrameMs = percentile(frameTimes, 95);
        const worstFrameMs = frameTimes.length > 0 ? Math.max(...frameTimes) : null;
        onBenchmarkRender({
          rebuildSceneMs,
          visibleAtoms: visibleAtomCount,
          visibleBonds: visibleBondCount,
          totalAtoms: moleculeData.atoms.length,
          totalBonds: moleculeData.bonds.length,
          renderCalls: renderStats.renderCalls,
          triangles: renderStats.triangles,
          geometries: renderStats.geometries,
          textures: renderStats.textures,
          sceneObjects: renderStats.sceneObjects,
          pickAtomMs: pickMetrics.pickAtomMs,
          pickBondMs: pickMetrics.pickBondMs,
          pickTotalMs: pickMetrics.pickTotalMs,
          pickHitType: pickMetrics.pickHitType,
          pickAtomCandidates: pickMetrics.pickAtomCandidates,
          pickBondCandidates: pickMetrics.pickBondCandidates,
          frameSampleMs: sampleMs,
          sampledFrames: frameTimes.length,
          averageFrameMs,
          p95FrameMs,
          minFps: worstFrameMs ? 1000 / worstFrameMs : null,
          averageFps: averageFrameMs ? 1000 / averageFrameMs : null,
          webglRenderer: debugInfo.webglRenderer,
          webglVendor: debugInfo.webglVendor,
          responsive: Boolean(
            frameTimes.length > 0 &&
            p95FrameMs !== null &&
            p95FrameMs <= targetFrameMs * 1.5 &&
            rebuildSceneMs <= 15_000
          ),
        });
      });
    }

  }, [
    moleculeData,
    visibilityIndex,
    hydrogenVisibility,
    hiddenAtomIndices,
    elementColorOverrides,
    atomStyleOverrides,
    atomSizeScale,
    bondStyleOverrides,
    onBondSelected,
    onAngleSelected,
    onDihedralSelected,
    onSelectionSummaryChange,
    benchmarkConfig,
    onBenchmarkRender,
  ]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    ctx.controls.mouseButtons = mouseMode === 'one-button'
      ? {
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.PAN,
          RIGHT: MOUSE.PAN,
        }
      : {
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.PAN,
        };
    ctx.controls.zoomSpeed = invertScrollZoom ? -1 : 1;
  }, [invertScrollZoom, mouseMode]);

  // Apply scene/view options in place so rendering controls do not rebuild meshes.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    setActiveCamera(ctx, viewOptions.projection);

    const bg = backdropColor(viewOptions.backdropTone, viewOptions.customBackdropHex);
    ctx.scene.background = new Color(bg);

    const distance = Math.max(
      ctx.camera.position.distanceTo(ctx.controls.target),
      ctx.lastCameraDistance,
      12,
    );
    if (viewOptions.fogEnabled) {
      const intensity = clamp(viewOptions.fogIntensity, 0.1, 1);
      ctx.scene.fog = new Fog(
        bg,
        distance * (1.42 - intensity * 0.32),
        distance * (4.8 - intensity * 1.55),
      );
    } else {
      ctx.scene.fog = null;
    }

    const moods = {
      publication: { ambient: 0.52, key: 1.65, fill: 0.72, rim: 0.24, topLight: 0.35 },
      'soft-studio': { ambient: 0.72, key: 1.12, fill: 0.92, rim: 0.2, topLight: 0.46 },
      'high-contrast': { ambient: 0.32, key: 2.08, fill: 0.32, rim: 0.58, topLight: 0.22 },
    }[viewOptions.lightingMood];

    ctx.lights.ambient.intensity = moods.ambient;
    ctx.lights.key.intensity = moods.key;
    ctx.lights.fill.intensity = moods.fill;
    ctx.lights.rim.intensity = moods.rim;
    ctx.lights.topLight.intensity = moods.topLight;

    ctx.controls.autoRotate = viewOptions.autoRotate;
    ctx.controls.autoRotateSpeed = viewOptions.autoRotateSpeed;
    ctx.floorGroup.visible = Boolean(ctx.lastMoleculeBox && (viewOptions.showFloor || viewOptions.showGrid));
    ctx.floorPlane.visible = viewOptions.showFloor;
    ctx.floorGrid.visible = viewOptions.showGrid;
  }, [viewOptions]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    for (const [element, material] of ctx.atomMats.entries()) {
      material.color.set(elementColorOverrides[element] ?? atomColorHex(element));
    }
  }, [elementColorOverrides, moleculeData, hydrogenVisibility, hiddenAtomIndices]);

  const measureHelpText = selectedDihedral?.stage === 1
    ? 'Select atom 2'
    : selectedDihedral?.stage === 2
      ? 'Select atom 3'
      : selectedDihedral?.stage === 3
        ? 'Select atom 4'
        : selectedDihedral?.stage === 4
          ? `Dihedral ${formatAngle(selectedDihedral.dihedralDegrees, anglePrecision)}`
          : selectedAngle
        ? `Angle ${formatAngle(selectedAngle.angleDegrees, anglePrecision)}`
        : selectedBond
          ? `Distance ${formatDistance(selectedBond.distance, distancePrecision)}`
          : 'Click a bond for distance, or atoms for angle/dihedral';

  const helpText = !moleculeData
    ? 'Open XYZ or PDB'
    : selectionMode === 'view'
      ? 'View mode: orbit, pan, and zoom'
      : selectionMode === 'atom'
        ? 'Atom mode: click atoms to select'
        : selectionMode === 'bond'
          ? 'Bond mode: click bonds to select'
          : selectionMode === 'atom-bond'
            ? 'Atom+Bond mode: click atoms or bonds to select'
            : selectionMode === 'label'
              ? 'Label mode: click atoms to add persistent labels'
              : measureHelpText;

  const patchViewOptions = (patch: Partial<ViewOptions>) => {
    onViewOptionsChange((current) => ({ ...current, ...patch }));
  };

  const handleCameraPreset = (preset: 'front' | 'top' | 'right' | 'iso') => {
    const ctx = ctxRef.current;
    if (!ctx || !moleculeData) return;
    applyCameraPreset(ctx, preset);
  };

  return (
    <div ref={containerRef} className={previewMode ? 'molecule-canvas preview-render-canvas' : 'molecule-canvas'}>
      {!previewMode && (
        <aside
          className="view-options-panel"
          aria-label="View options"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
        <div className="view-panel-header">
          <span>View</span>
          <span className="view-panel-status">Session</span>
        </div>

        <div className="view-toggle-row">
          <button
            type="button"
            className={viewOptions.showFloor ? 'view-toggle active' : 'view-toggle'}
            onClick={() => patchViewOptions({ showFloor: !viewOptions.showFloor })}
          >
            Floor
          </button>
          <button
            type="button"
            className={viewOptions.showGrid ? 'view-toggle active' : 'view-toggle'}
            onClick={() => patchViewOptions({ showGrid: !viewOptions.showGrid })}
          >
            Grid
          </button>
        </div>

        <label className="view-control">
          <span>Backdrop</span>
          <select
            value={viewOptions.backdropTone}
            onChange={(event) => patchViewOptions({ backdropTone: event.target.value as ViewOptions['backdropTone'] })}
          >
            <option value="clean">Clean white</option>
            <option value="warm">Warm grey</option>
            <option value="slate">Slate</option>
            <option value="black">Black</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <label className="view-control">
          <span>Projection</span>
          <select
            value={viewOptions.projection}
            onChange={(event) => patchViewOptions({ projection: event.target.value as ViewOptions['projection'] })}
          >
            <option value="perspective">Perspective</option>
            <option value="orthographic">Orthographic</option>
          </select>
        </label>

        <label className="view-control">
          <span>Lighting</span>
          <select
            value={viewOptions.lightingMood}
            onChange={(event) => patchViewOptions({ lightingMood: event.target.value as ViewOptions['lightingMood'] })}
          >
            <option value="publication">Publication</option>
            <option value="soft-studio">Soft studio</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </label>

        <label className="view-control">
          <span>Material</span>
          <select
            value={materialPreset}
            onChange={(event) => onMaterialPresetChange(event.target.value as MaterialPresetId)}
          >
            <option value="CYLview">CYLview</option>
            <option value="Houkmol">Houkmol</option>
          </select>
        </label>

        <div className="view-split-row">
          <button
            type="button"
            className={viewOptions.fogEnabled ? 'view-toggle active' : 'view-toggle'}
            onClick={() => patchViewOptions({ fogEnabled: !viewOptions.fogEnabled })}
          >
            Depth cue
          </button>
          <span>{Math.round(viewOptions.fogIntensity * 100)}%</span>
        </div>
        <input
          className="view-range"
          type="range"
          min="0.15"
          max="1"
          step="0.05"
          value={viewOptions.fogIntensity}
          disabled={!viewOptions.fogEnabled}
          aria-label="Depth cue intensity"
          onChange={(event) => patchViewOptions({ fogIntensity: Number(event.target.value) })}
        />

        <div className="view-split-row">
          <button
            type="button"
            className={viewOptions.autoRotate ? 'view-toggle active' : 'view-toggle'}
            onClick={() => patchViewOptions({ autoRotate: !viewOptions.autoRotate })}
          >
            Auto-rotate
          </button>
          <span>{viewOptions.autoRotateSpeed.toFixed(2)}x</span>
        </div>
        <input
          className="view-range"
          type="range"
          min="0.15"
          max="0.8"
          step="0.05"
          value={viewOptions.autoRotateSpeed}
          disabled={!viewOptions.autoRotate}
          aria-label="Auto-rotate speed"
          onChange={(event) => patchViewOptions({ autoRotateSpeed: Number(event.target.value) })}
        />

        <div className="camera-preset-grid" aria-label="Camera presets">
          <button type="button" disabled={!moleculeData} onClick={() => handleCameraPreset('front')}>Front</button>
          <button type="button" disabled={!moleculeData} onClick={() => handleCameraPreset('top')}>Top</button>
          <button type="button" disabled={!moleculeData} onClick={() => handleCameraPreset('right')}>Right</button>
          <button type="button" disabled={!moleculeData} onClick={() => handleCameraPreset('iso')}>Iso</button>
        </div>
        </aside>
      )}
      {!previewMode && <div className="canvas-help-strip">{helpText}</div>}
      <div ref={bondLabelRef} className="bond-distance-label" />
      <div ref={angleLabelRef} className="angle-measure-label" />
      <div ref={dihedralLabelRef} className="dihedral-measure-label" />
      {persistentLabels.map((label) => (
        <div
          key={label.id}
          ref={(element) => {
            if (element) {
              persistentLabelRefs.current.set(label.id, element);
            } else {
              persistentLabelRefs.current.delete(label.id);
            }
          }}
          className={`persistent-label persistent-label-${label.type}`}
          title={label.type}
        >
          {label.text}
        </div>
      ))}
      {!previewMode && !moleculeData && (
        <div className="canvas-placeholder">
          <div className="placeholder-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="placeholder-kicker">Publication-minded molecular viewing</p>
          <h3>Open XYZ or PDB</h3>
          <p>
            Load a structure to inspect bonds, measure distances, angles, and dihedrals,
            then export a clean PNG view.
          </p>
          <button
            type="button"
            className="placeholder-action"
            disabled={isLoading}
            onClick={onOpenFile}
          >
            {isLoading ? 'Loading...' : 'Open File'}
          </button>
          <div className="placeholder-shortcuts">
            <span>Left drag rotate</span>
            <span>Right drag pan</span>
            <span>Scroll zoom</span>
          </div>
        </div>
      )}
      {!previewMode && isLoading && (
        <LoadingSpinner title={loadingLabel} subtitle="Parsing atoms, perceiving bonds, and preparing the 3-D workspace." />
      )}
    </div>
  );
}

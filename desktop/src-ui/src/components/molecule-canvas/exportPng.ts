import {
  ACESFilmicToneMapping,
  Box3,
  Camera,
  CineonToneMapping,
  Color,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  PCFSoftShadowMap,
  ReinhardToneMapping,
  Scene,
  Vector2,
  Vector3,
  type Material,
  type ToneMapping,
} from 'three';
import type { SceneCtx } from './types';
import type {
  Annotation,
  AtomStyleOverride,
  BondStyleOverride,
  ElementColorOverrides,
  HydrogenVisibility,
  MoleculeData,
  RenderProfileId,
  SavedPose,
  ViewOptions,
} from '../../App';
import { drawRichLabelText } from './labels';
import { renderScene } from './depthCue';

export type ExportMode = 'viewport' | 'publication-raster' | 'path-traced';
export type ExportScalePreset = 1 | 2 | 4 | 'custom';
export type ExportSizePreset = 'viewport' | 'manuscript' | 'slide' | 'poster' | 'custom';
export type ExportBackgroundMode = 'current' | 'white' | 'transparent';
export type ExportToneMapping = 'none' | 'aces' | 'reinhard' | 'cineon';
export type PathTraceQuality = 'draft' | 'standard' | 'final';

export interface PublicationExportSettings {
  mode: ExportMode;
  scalePreset: ExportScalePreset;
  customScale: number;
  sizePreset: ExportSizePreset;
  customWidth: number;
  customHeight: number;
  background: ExportBackgroundMode;
  cropToMolecule: boolean;
  cropPaddingPx: number;
  absoluteScaleEnabled: boolean;
  pixelsPerAngstrom: number;
  printSafeAnnotationScale: number;
  includeMetadataSidecar: boolean;
  supersampling: 1 | 2 | 3 | 4;
  tiledExport: boolean;
  tileSize: number;
  improvedShadows: boolean;
  ambientOcclusion: boolean;
  depthAwareOutline: boolean;
  toneMapping: ExportToneMapping;
  pathTraceQuality: PathTraceQuality;
}

export interface PublicationRenderState {
  version: 1;
  capturedAt: string;
  molecule: {
    name: string;
    path: string;
    atomCount: number;
    bondCount: number;
    bounds: {
      min: [number, number, number];
      max: [number, number, number];
      diagonal: number;
    } | null;
    sourceFormat?: string;
  };
  geometry: {
    atoms: MoleculeData['atoms'];
    bonds: MoleculeData['bonds'];
    groups: MoleculeData['groups'];
  };
  styles: {
    hydrogenVisibility: HydrogenVisibility;
    elementColorOverrides: ElementColorOverrides;
    atomSizeScale: number;
    atomStyleOverrides: Record<string, AtomStyleOverride>;
    bondStyleOverrides: Record<string, BondStyleOverride>;
  };
  renderProfile: RenderProfileId;
  camera: {
    projection: ViewOptions['projection'];
    position: [number, number, number];
    target: [number, number, number];
    near: number;
    far: number;
    fov?: number;
    zoom?: number;
  };
  lighting: {
    mood: ViewOptions['lightingMood'];
    ambient: number;
    key: number;
    fill: number;
    rim: number;
    top: number;
  };
  background: {
    mode: ViewOptions['backdropTone'];
    color: string;
  };
  depthCue: {
    fogEnabled: boolean;
    fogIntensity: number;
    fogDepth: number;
    focalBlurEnabled: boolean;
    focalBlurAmount: number;
    focalDepth: number;
  };
  labels: Annotation[];
  linkLines: {
    enabled: boolean;
    count: number;
  };
  angleArcs: {
    active: boolean;
  };
  residueHighlights: MoleculeData['groups'];
  hiddenAtoms: number[];
  savedPoses: SavedPose[];
}

export interface PublicationExportResult {
  dataUrl: string;
  previewDataUrl: string;
  metadataJson: string | null;
  width: number;
  height: number;
  state: PublicationRenderState;
}

interface RenderDimensions {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  outputScale: number;
}

interface LabelSnapshot {
  text: string;
  html: string;
  rect: DOMRect;
  styles: CSSStyleDeclaration;
  className: string;
}

interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SIZE_PRESETS: Record<Exclude<ExportSizePreset, 'viewport' | 'custom'>, { width: number; height: number }> = {
  manuscript: { width: 1800, height: 1350 },
  slide: { width: 1920, height: 1080 },
  poster: { width: 4800, height: 3600 },
};

const PATH_TRACE_SAMPLES: Record<PathTraceQuality, number> = {
  draft: 24,
  standard: 96,
  final: 256,
};

export const DEFAULT_PUBLICATION_EXPORT_SETTINGS: PublicationExportSettings = {
  mode: 'publication-raster',
  scalePreset: 2,
  customScale: 3,
  sizePreset: 'viewport',
  customWidth: 2400,
  customHeight: 1800,
  background: 'white',
  cropToMolecule: false,
  cropPaddingPx: 96,
  absoluteScaleEnabled: false,
  pixelsPerAngstrom: 180,
  printSafeAnnotationScale: 1.15,
  includeMetadataSidecar: true,
  supersampling: 2,
  tiledExport: true,
  tileSize: 2048,
  improvedShadows: true,
  ambientOcclusion: true,
  depthAwareOutline: false,
  toneMapping: 'aces',
  pathTraceQuality: 'draft',
};

function colorHex(color: Color): string {
  return `#${color.getHexString()}`;
}

function toneMappingFor(value: ExportToneMapping): ToneMapping {
  if (value === 'aces') return ACESFilmicToneMapping;
  if (value === 'reinhard') return ReinhardToneMapping;
  if (value === 'cineon') return CineonToneMapping;
  return NoToneMapping;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scaleValue(settings: PublicationExportSettings): number {
  if (settings.scalePreset === 'custom') return clampNumber(settings.customScale, 0.25, 12);
  return settings.scalePreset;
}

function viewportSize(ctx: SceneCtx): { width: number; height: number } {
  const size = new Vector2();
  ctx.renderer.getSize(size);
  return {
    width: ctx.renderer.domElement.clientWidth || size.x || 800,
    height: ctx.renderer.domElement.clientHeight || size.y || 600,
  };
}

function moleculeDiagonal(ctx: SceneCtx): number {
  return Math.max(ctx.lastMoleculeBox?.getSize(new Vector3()).length() ?? 1, 0.1);
}

function resolveDimensions(ctx: SceneCtx, settings: PublicationExportSettings): RenderDimensions {
  const viewport = viewportSize(ctx);
  const scale = settings.mode === 'viewport' ? scaleValue(settings) : 1;
  let width = Math.max(1, Math.round(viewport.width * scale));
  let height = Math.max(1, Math.round(viewport.height * scale));

  if (settings.mode !== 'viewport') {
    if (settings.sizePreset === 'custom') {
      width = Math.max(16, Math.round(settings.customWidth));
      height = Math.max(16, Math.round(settings.customHeight));
    } else if (settings.sizePreset !== 'viewport') {
      width = SIZE_PRESETS[settings.sizePreset].width;
      height = SIZE_PRESETS[settings.sizePreset].height;
    }
    const presetScale = scaleValue(settings);
    width = Math.max(1, Math.round(width * presetScale));
    height = Math.max(1, Math.round(height * presetScale));
  }

  if (settings.absoluteScaleEnabled && ctx.lastMoleculeBox) {
    const diagonal = moleculeDiagonal(ctx);
    const side = Math.max(64, Math.round(diagonal * clampNumber(settings.pixelsPerAngstrom, 12, 1200)));
    const aspect = width / height;
    if (aspect >= 1) {
      height = side;
      width = Math.round(side * aspect);
    } else {
      width = side;
      height = Math.round(side / aspect);
    }
  }

  const supersample = settings.mode === 'publication-raster'
    ? settings.supersampling
    : 1;

  return {
    width,
    height,
    sourceWidth: Math.max(1, Math.round(width * supersample)),
    sourceHeight: Math.max(1, Math.round(height * supersample)),
    outputScale: supersample,
  };
}

function boxCorners(box: Box3): Vector3[] {
  const { min, max } = box;
  return [
    new Vector3(min.x, min.y, min.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(min.x, max.y, max.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z),
  ];
}

function moleculeCropRect(
  box: Box3 | null,
  camera: Camera,
  width: number,
  height: number,
  paddingPx: number,
): { x: number; y: number; width: number; height: number } | null {
  if (!box || box.isEmpty()) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const corner of boxCorners(box)) {
    const projected = corner.project(camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const x = ((projected.x + 1) / 2) * width;
    const y = ((-projected.y + 1) / 2) * height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  const x = Math.floor(clampNumber(minX - paddingPx, 0, width - 1));
  const y = Math.floor(clampNumber(minY - paddingPx, 0, height - 1));
  const right = Math.ceil(clampNumber(maxX + paddingPx, x + 1, width));
  const bottom = Math.ceil(clampNumber(maxY + paddingPx, y + 1, height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function collectLabels(host: HTMLDivElement | null): { hostRect: DOMRect | null; labels: LabelSnapshot[] } {
  if (!host) return { hostRect: null, labels: [] };
  const hostRect = host.getBoundingClientRect();
  const elements = host.querySelectorAll<HTMLElement>(
    '.bond-distance-label, .angle-measure-label, .dihedral-measure-label, .persistent-label',
  );
  const labels: LabelSnapshot[] = [];
  for (const label of elements) {
    const text = label.textContent?.trim();
    if (!text || label.style.display === 'none') continue;
    const rect = label.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    labels.push({
      text,
      html: label.innerHTML ?? text,
      rect,
      styles: window.getComputedStyle(label),
      className: label.className,
    });
  }
  return { hostRect, labels };
}

function drawLabels(
  exportCtx: CanvasRenderingContext2D,
  hostRect: DOMRect | null,
  labels: LabelSnapshot[],
  cssWidth: number,
  cssHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  sourceRect: CanvasRect,
  outputWidth: number,
  outputHeight: number,
  printScale: number,
): void {
  if (!hostRect) return;
  const cssToSourceX = sourceWidth / cssWidth;
  const cssToSourceY = sourceHeight / cssHeight;
  const sourceToOutputX = outputWidth / sourceRect.width;
  const sourceToOutputY = outputHeight / sourceRect.height;
  const scaleX = cssToSourceX * sourceToOutputX;
  const scaleY = cssToSourceY * sourceToOutputY;
  const labelScale = Math.max(scaleX, scaleY) * printScale;

  for (const label of labels) {
    const sourceX = (label.rect.left - hostRect.left) * cssToSourceX;
    const sourceY = (label.rect.top - hostRect.top) * cssToSourceY;
    const x = (sourceX - sourceRect.x) * sourceToOutputX;
    const y = (sourceY - sourceRect.y) * sourceToOutputY;
    const width = label.rect.width * scaleX * printScale;
    const height = label.rect.height * scaleY * printScale;
    const radius = label.className.includes('render-profile-houkmol')
      ? 0
      : Math.min(12 * labelScale, height / 2);

    exportCtx.save();
    exportCtx.fillStyle = label.styles.backgroundColor || 'rgba(255, 255, 255, 0.92)';
    exportCtx.strokeStyle = label.styles.borderColor || 'rgba(160, 175, 190, 0.85)';
    exportCtx.lineWidth = Math.max(1, labelScale);
    exportCtx.beginPath();
    exportCtx.roundRect(x, y, width, height, radius);
    exportCtx.fill();
    exportCtx.stroke();
    exportCtx.fillStyle = label.styles.color || '#1f2933';
    const baseFontSize = Number.parseFloat(label.styles.fontSize || '12') * labelScale;
    exportCtx.font = `${label.styles.fontWeight || '700'} ${baseFontSize}px ${label.styles.fontFamily || 'sans-serif'}`;
    exportCtx.textAlign = 'center';
    exportCtx.textBaseline = 'middle';
    if (/<sub>|<sup>/.test(label.html)) {
      drawRichLabelText(
        exportCtx,
        label.html,
        x + width / 2,
        y + height / 2,
        baseFontSize,
        label.styles.fontWeight || '700',
        label.styles.fontFamily || 'sans-serif',
      );
    } else {
      exportCtx.fillText(label.text, x + width / 2, y + height / 2, width - 8 * labelScale);
    }
    exportCtx.restore();
  }
}

function drawLinkLines(
  exportCtx: CanvasRenderingContext2D,
  host: HTMLDivElement | null,
  cssWidth: number,
  cssHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  sourceRect: CanvasRect,
  outputWidth: number,
  outputHeight: number,
  printScale: number,
): void {
  const linkCanvasEl = host?.querySelector<HTMLCanvasElement>('.label-link-overlay');
  if (!linkCanvasEl || linkCanvasEl.style.display === 'none') return;
  const linkSourceRect = {
    x: sourceRect.x * (cssWidth / sourceWidth),
    y: sourceRect.y * (cssHeight / sourceHeight),
    width: sourceRect.width * (cssWidth / sourceWidth),
    height: sourceRect.height * (cssHeight / sourceHeight),
  };

  if (printScale === 1) {
    exportCtx.drawImage(
      linkCanvasEl,
      linkSourceRect.x,
      linkSourceRect.y,
      linkSourceRect.width,
      linkSourceRect.height,
      0,
      0,
      outputWidth,
      outputHeight,
    );
    return;
  }

  exportCtx.save();
  exportCtx.globalAlpha = 0.9;
  exportCtx.drawImage(
    linkCanvasEl,
    linkSourceRect.x,
    linkSourceRect.y,
    linkSourceRect.width,
    linkSourceRect.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );
  exportCtx.restore();
}

function applyScreenSpaceOutline(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const source = image.data;
  const outline = ctx.createImageData(width, height);
  const target = outline.data;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      const center = source[offset] + source[offset + 1] + source[offset + 2];
      const right = source[offset + 4] + source[offset + 5] + source[offset + 6];
      const down = source[offset + width * 4] + source[offset + width * 4 + 1] + source[offset + width * 4 + 2];
      const edge = Math.abs(center - right) + Math.abs(center - down);
      if (edge > 96 && source[offset + 3] > 12) {
        target[offset] = 22;
        target[offset + 1] = 31;
        target[offset + 2] = 43;
        target[offset + 3] = 96;
      }
    }
  }

  ctx.save();
  ctx.putImageData(image, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  const outlineCanvas = imageDataToCanvas(outline);
  ctx.drawImage(outlineCanvas, 0, 0);
  ctx.restore();
}

function imageDataToCanvas(image: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx?.putImageData(image, 0, 0);
  return canvas;
}

function applyAmbientDepthEnhancement(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.12;
  ctx.filter = 'blur(1.2px) contrast(1.18)';
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
  ctx.filter = 'none';
}

function drawTiled(
  targetCtx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  sourceRect: { x: number; y: number; width: number; height: number },
  targetWidth: number,
  targetHeight: number,
  tileSize: number,
): void {
  const tile = Math.max(256, Math.round(tileSize));
  for (let y = 0; y < targetHeight; y += tile) {
    for (let x = 0; x < targetWidth; x += tile) {
      const w = Math.min(tile, targetWidth - x);
      const h = Math.min(tile, targetHeight - y);
      const sx = sourceRect.x + (x / targetWidth) * sourceRect.width;
      const sy = sourceRect.y + (y / targetHeight) * sourceRect.height;
      const sw = (w / targetWidth) * sourceRect.width;
      const sh = (h / targetHeight) * sourceRect.height;
      targetCtx.drawImage(sourceCanvas, sx, sy, sw, sh, x, y, w, h);
    }
  }
}

function materialToStandard(material: Material | Material[]): MeshStandardMaterial | MeshStandardMaterial[] {
  if (Array.isArray(material)) return material.map((entry) => materialToStandard(entry) as MeshStandardMaterial);
  const source = material as MeshPhongMaterial | MeshBasicMaterial;
  const standard = new MeshStandardMaterial({
    color: source.color ? source.color.clone() : new Color(0xffffff),
    transparent: source.transparent,
    opacity: source.opacity,
    roughness: 0.42,
    metalness: 0,
  });
  standard.side = source.side;
  return standard;
}

function buildPathTraceScene(ctx: SceneCtx): Scene {
  const scene = new Scene();
  scene.background = ctx.scene.background;
  scene.environment = ctx.scene.environment;
  ctx.scene.updateMatrixWorld(true);

  ctx.scene.traverse((object) => {
    if (!object.visible) return;
    if (object instanceof DirectionalLight) {
      const light = object.clone();
      light.position.setFromMatrixPosition(object.matrixWorld);
      scene.add(light);
      return;
    }
    if (object instanceof InstancedMesh) {
      const geometry = object.geometry.clone();
      const material = materialToStandard(object.material);
      const matrix = new Matrix4();
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, matrix);
        const mesh = new Mesh(geometry, Array.isArray(material) ? material.map((m) => m.clone()) : material.clone());
        mesh.applyMatrix4(new Matrix4().multiplyMatrices(object.matrixWorld, matrix));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
      return;
    }
    if (object instanceof Mesh && object.geometry) {
      const mesh = new Mesh(object.geometry.clone(), materialToStandard(object.material));
      mesh.applyMatrix4(object.matrixWorld);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  });

  return scene;
}

function captureCanvas(rendererCanvas: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not capture export canvas.');
  ctx.drawImage(rendererCanvas, 0, 0, width, height);
  return canvas;
}

async function renderPathTracedCanvas(
  ctx: SceneCtx,
  dimensions: RenderDimensions,
  settings: PublicationExportSettings,
  onProgress?: (progress: number, label: string) => void,
  shouldCancel?: () => boolean,
): Promise<HTMLCanvasElement> {
  const { WebGLPathTracer } = await import('three-gpu-pathtracer');
  const pathScene = buildPathTraceScene(ctx);
  const pathTracer = new WebGLPathTracer(ctx.renderer);
  const samples = PATH_TRACE_SAMPLES[settings.pathTraceQuality];

  pathTracer.renderScale = 1;
  pathTracer.tiles.set(settings.tiledExport ? 3 : 1, settings.tiledExport ? 3 : 1);
  pathTracer.bounces = settings.pathTraceQuality === 'final' ? 8 : settings.pathTraceQuality === 'standard' ? 6 : 4;
  pathTracer.minSamples = 1;
  pathTracer.renderDelay = 0;
  pathTracer.rasterizeScene = false;
  pathTracer.setScene(pathScene, ctx.camera, {
    onProgress: (progress) => onProgress?.(progress * 0.2, 'Preparing path-traced scene'),
  });

  try {
    pathTracer.reset();
    for (let sample = 0; sample < samples; sample += 1) {
      if (shouldCancel?.()) throw new Error('Path-traced export cancelled.');
      pathTracer.renderSample();
      onProgress?.(0.2 + ((sample + 1) / samples) * 0.72, `Accumulating sample ${sample + 1} of ${samples}`);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return captureCanvas(ctx.renderer.domElement, dimensions.sourceWidth, dimensions.sourceHeight);
  } finally {
    pathTracer.dispose();
    pathScene.traverse((object: Object3D) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
}

async function previewFromDataUrl(dataUrl: string, maxWidth = 360): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = image.width > maxWidth ? maxWidth / image.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not prepare export preview.'));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Could not load export preview image.'));
    image.src = dataUrl;
  });
}

export function capturePublicationRenderState(options: {
  ctx: SceneCtx;
  moleculeData: MoleculeData;
  renderProfile: RenderProfileId;
  viewOptions: ViewOptions;
  hydrogenVisibility: HydrogenVisibility;
  hiddenAtomIndices: number[];
  elementColorOverrides: ElementColorOverrides;
  atomStyleOverrides: Record<string, AtomStyleOverride>;
  bondStyleOverrides: Record<string, BondStyleOverride>;
  atomSizeScale: number;
  persistentLabels: Annotation[];
  savedPoses: SavedPose[];
}): PublicationRenderState {
  const {
    ctx,
    moleculeData,
    renderProfile,
    viewOptions,
    hydrogenVisibility,
    hiddenAtomIndices,
    elementColorOverrides,
    atomStyleOverrides,
    bondStyleOverrides,
    atomSizeScale,
    persistentLabels,
    savedPoses,
  } = options;
  const box = ctx.lastMoleculeBox;
  const size = box?.getSize(new Vector3());
  const backgroundColor = ctx.scene.background instanceof Color
    ? ctx.scene.background
    : new Color(ctx.depthCue.backgroundColor);

  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    molecule: {
      name: moleculeData.name,
      path: moleculeData.path,
      atomCount: moleculeData.atoms.length,
      bondCount: moleculeData.bonds.length,
      sourceFormat: moleculeData.metadata.sourceFormat,
      bounds: box && size
        ? {
            min: [box.min.x, box.min.y, box.min.z],
            max: [box.max.x, box.max.y, box.max.z],
            diagonal: size.length(),
          }
        : null,
    },
    geometry: {
      atoms: moleculeData.atoms,
      bonds: moleculeData.bonds,
      groups: moleculeData.groups,
    },
    styles: {
      hydrogenVisibility,
      elementColorOverrides,
      atomSizeScale,
      atomStyleOverrides,
      bondStyleOverrides,
    },
    renderProfile,
    camera: {
      projection: viewOptions.projection,
      position: [ctx.camera.position.x, ctx.camera.position.y, ctx.camera.position.z],
      target: [ctx.controls.target.x, ctx.controls.target.y, ctx.controls.target.z],
      near: ctx.camera.near,
      far: ctx.camera.far,
      fov: 'fov' in ctx.camera ? ctx.camera.fov : undefined,
      zoom: ctx.camera.zoom,
    },
    lighting: {
      mood: viewOptions.lightingMood,
      ambient: ctx.lights.ambient.intensity,
      key: ctx.lights.key.intensity,
      fill: ctx.lights.fill.intensity,
      rim: ctx.lights.rim.intensity,
      top: ctx.lights.topLight.intensity,
    },
    background: {
      mode: viewOptions.backdropTone,
      color: colorHex(backgroundColor),
    },
    depthCue: {
      fogEnabled: viewOptions.fogEnabled,
      fogIntensity: viewOptions.fogIntensity,
      fogDepth: viewOptions.fogDepth,
      focalBlurEnabled: viewOptions.focalBlurEnabled,
      focalBlurAmount: viewOptions.focalBlurAmount,
      focalDepth: viewOptions.focalDepth,
    },
    labels: persistentLabels,
    linkLines: {
      enabled: viewOptions.showLabelLinkLines,
      count: persistentLabels.filter((label) => label.visible).length,
    },
    angleArcs: {
      active: Boolean(ctx.angleArcMesh),
    },
    residueHighlights: moleculeData.groups,
    hiddenAtoms: hiddenAtomIndices,
    savedPoses,
  };
}

export async function renderPublicationExport(options: {
  ctx: SceneCtx;
  host: HTMLDivElement | null;
  settings: PublicationExportSettings;
  renderState: PublicationRenderState;
  onProgress?: (progress: number, label: string) => void;
  shouldCancel?: () => boolean;
}): Promise<PublicationExportResult> {
  const { ctx, host, settings, renderState, onProgress, shouldCancel } = options;
  const renderer = ctx.renderer;
  const sourceCanvas = renderer.domElement;
  const originalPixelRatio = renderer.getPixelRatio();
  const originalSize = new Vector2();
  renderer.getSize(originalSize);
  const originalToneMapping = renderer.toneMapping;
  const originalShadowEnabled = renderer.shadowMap.enabled;
  const originalShadowType = renderer.shadowMap.type;
  const originalBackground = ctx.scene.background;
  const originalClearAlpha = renderer.getClearAlpha();
  const originalAspect = ctx.perspectiveCamera.aspect;
  const objectShadowStates: Array<{ object: Object3D; castShadow: boolean; receiveShadow: boolean }> = [];
  const cssWidth = sourceCanvas.clientWidth || originalSize.x || 800;
  const cssHeight = sourceCanvas.clientHeight || originalSize.y || 600;
  const dimensions = resolveDimensions(ctx, settings);
  const { hostRect, labels } = collectLabels(host);

  onProgress?.(0.04, 'Preparing export renderer');
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(dimensions.sourceWidth, dimensions.sourceHeight, false);
    renderer.toneMapping = toneMappingFor(settings.toneMapping);
    renderer.shadowMap.enabled = settings.improvedShadows;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.setClearAlpha(settings.background === 'transparent' ? 0 : 1);
    ctx.depthCue.composer?.setPixelRatio(1);
    ctx.depthCue.composer?.setSize(dimensions.sourceWidth, dimensions.sourceHeight);
    ctx.perspectiveCamera.aspect = dimensions.sourceWidth / dimensions.sourceHeight;
    ctx.perspectiveCamera.updateProjectionMatrix();

    if (settings.background === 'transparent') {
      ctx.scene.background = null;
    } else if (settings.background === 'white') {
      ctx.scene.background = new Color(0xffffff);
    }

    ctx.scene.traverse((object) => {
      if (object instanceof Mesh || object instanceof InstancedMesh) {
        objectShadowStates.push({
          object,
          castShadow: object.castShadow,
          receiveShadow: object.receiveShadow,
        });
        object.castShadow = settings.improvedShadows;
        object.receiveShadow = settings.improvedShadows;
      }
    });

    let source: HTMLCanvasElement;
    if (settings.mode === 'path-traced') {
      source = await renderPathTracedCanvas(ctx, dimensions, settings, onProgress, shouldCancel);
    } else {
      renderScene(ctx);
      source = captureCanvas(sourceCanvas, dimensions.sourceWidth, dimensions.sourceHeight);
    }

    if (settings.ambientOcclusion && settings.mode === 'publication-raster') {
      applyAmbientDepthEnhancement(source);
    }
    if (settings.depthAwareOutline && settings.mode === 'publication-raster') {
      applyScreenSpaceOutline(source);
    }

    const sourceCrop = settings.cropToMolecule
      ? moleculeCropRect(
          ctx.lastMoleculeBox,
          ctx.camera,
          dimensions.sourceWidth,
          dimensions.sourceHeight,
          settings.cropPaddingPx * dimensions.outputScale,
        )
      : null;
    const sourceRect = sourceCrop ?? {
      x: 0,
      y: 0,
      width: dimensions.sourceWidth,
      height: dimensions.sourceHeight,
    };
    const targetWidth = Math.max(1, Math.round(sourceRect.width / dimensions.outputScale));
    const targetHeight = Math.max(1, Math.round(sourceRect.height / dimensions.outputScale));

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) throw new Error('Could not prepare publication export canvas.');
    if (settings.background === 'white') {
      exportCtx.fillStyle = '#ffffff';
      exportCtx.fillRect(0, 0, targetWidth, targetHeight);
    }

    if (settings.tiledExport || targetWidth * targetHeight > 24_000_000) {
      drawTiled(exportCtx, source, sourceRect, targetWidth, targetHeight, settings.tileSize);
    } else {
      exportCtx.drawImage(
        source,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        targetWidth,
        targetHeight,
      );
    }

    drawLinkLines(
      exportCtx,
      host,
      cssWidth,
      cssHeight,
      dimensions.sourceWidth,
      dimensions.sourceHeight,
      sourceRect,
      targetWidth,
      targetHeight,
      settings.printSafeAnnotationScale,
    );
    drawLabels(
      exportCtx,
      hostRect,
      labels,
      cssWidth,
      cssHeight,
      dimensions.sourceWidth,
      dimensions.sourceHeight,
      sourceRect,
      targetWidth,
      targetHeight,
      settings.printSafeAnnotationScale,
    );

    onProgress?.(0.98, 'Encoding PNG');
    const dataUrl = exportCanvas.toDataURL('image/png');
    const previewDataUrl = await previewFromDataUrl(dataUrl);
    const metadataJson = settings.includeMetadataSidecar
      ? JSON.stringify({
          kind: 'cylform-publication-render',
          version: 1,
          settings,
          output: {
            width: targetWidth,
            height: targetHeight,
            mode: settings.mode,
          },
          renderState,
        }, null, 2)
      : null;

    onProgress?.(1, 'Export ready');
    return {
      dataUrl,
      previewDataUrl,
      metadataJson,
      width: targetWidth,
      height: targetHeight,
      state: renderState,
    };
  } finally {
    renderer.setPixelRatio(originalPixelRatio);
    renderer.setSize(originalSize.x, originalSize.y, false);
    renderer.toneMapping = originalToneMapping;
    renderer.shadowMap.enabled = originalShadowEnabled;
    renderer.shadowMap.type = originalShadowType;
    for (const { object, castShadow, receiveShadow } of objectShadowStates) {
      object.castShadow = castShadow;
      object.receiveShadow = receiveShadow;
    }
    renderer.setClearAlpha(originalClearAlpha);
    ctx.scene.background = originalBackground;
    ctx.depthCue.composer?.setPixelRatio(originalPixelRatio);
    ctx.depthCue.composer?.setSize(originalSize.x, originalSize.y);
    ctx.perspectiveCamera.aspect = originalAspect;
    ctx.perspectiveCamera.updateProjectionMatrix();
    renderScene(ctx);
  }
}

export function renderCurrentViewDataUrl(
  ctx: SceneCtx,
  host: HTMLDivElement | null,
  options: {
    moleculeData: MoleculeData | null;
    pngExportScale: 1 | 2 | 4;
    maxWidth?: number;
  },
): string {
  const { moleculeData, pngExportScale, maxWidth } = options;
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
      ctx.depthCue.composer?.setPixelRatio(1);
      ctx.depthCue.composer?.setSize(renderWidth, renderHeight);
      ctx.perspectiveCamera.aspect = renderWidth / renderHeight;
      ctx.perspectiveCamera.updateProjectionMatrix();
    }

    renderScene(ctx);

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
    const sourceRect = {
      x: 0,
      y: 0,
      width: sourceCanvas.width,
      height: sourceCanvas.height,
    };
    drawLinkLines(
      exportCtx,
      host,
      cssWidth,
      cssHeight,
      sourceCanvas.width,
      sourceCanvas.height,
      sourceRect,
      exportCanvas.width,
      exportCanvas.height,
      1,
    );
    const { hostRect, labels } = collectLabels(host);
    drawLabels(
      exportCtx,
      hostRect,
      labels,
      cssWidth,
      cssHeight,
      sourceCanvas.width,
      sourceCanvas.height,
      sourceRect,
      exportCanvas.width,
      exportCanvas.height,
      1,
    );

    return exportCanvas.toDataURL('image/png');
  } finally {
    if (shouldRenderScaled) {
      renderer.setPixelRatio(originalPixelRatio);
      renderer.setSize(originalSize.x, originalSize.y, false);
      ctx.depthCue.composer?.setPixelRatio(originalPixelRatio);
      ctx.depthCue.composer?.setSize(originalSize.x, originalSize.y);
      ctx.perspectiveCamera.aspect = cssWidth / cssHeight;
      ctx.perspectiveCamera.updateProjectionMatrix();
      renderScene(ctx);
    }
  }
}

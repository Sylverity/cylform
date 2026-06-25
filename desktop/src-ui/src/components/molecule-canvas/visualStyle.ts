import {
  MeshPhongMaterial,
  Vector3,
  Matrix4,
  Quaternion,
  SphereGeometry,
  CylinderGeometry,
  OrthographicCamera,
} from 'three';
import { syncOrthographicCamera } from './camera';
import type {
  RenderProfileId,
  BondStyleType,
  BondKind,
  AtomStyleOverride,
  BondStyleOverride,
  ElementColorOverrides,
  ViewOptions,
} from '../../App';
import type { SceneCtx, AtomSelectionData, RenderQualityProfile } from './types';
export {
  ATOM_COLORS,
  LEGACY_ELEMENT_COLORS,
  MATERIAL_PRESETS,
  atomColor,
  atomColorHex,
  legacyElementColorHex,
} from './materialPresets';
import {
  MATERIAL_PRESETS,
  legacyElementColorHex,
} from './materialPresets';

// Keep spheres understated so the render reads as a CYLview-style tube drawing.
export const ATOM_DISPLAY_RADIUS: Record<string, number> = {
  H: 0.075,
  C: 0.078,
  N: 0.095,
  O: 0.118,
  F: 0.09,
  P: 0.118,
  S: 0.118,
  Cl: 0.108,
  Br: 0.13,
  I: 0.145,
};

export function bondKey(atom1: number, atom2: number): string {
  return atom1 < atom2 ? `${atom1}-${atom2}` : `${atom2}-${atom1}`;
}

export function atomDisplayRadius(element: string): number {
  return ATOM_DISPLAY_RADIUS[element] ?? 0.12;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hexColorNumber(hex: string | undefined, fallback: number): number {
  if (!hex) return fallback;
  const normalized = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  return Number.parseInt(normalized.slice(1), 16);
}

export function backdropColor(tone: ViewOptions['backdropTone'], customHex?: string): number {
  if (tone === 'warm') return 0xf2eee7;
  if (tone === 'slate') return 0xdce3ea;
  if (tone === 'black') return 0x05070a;
  if (tone === 'custom') return hexColorNumber(customHex, 0xffffff);
  return 0xffffff;
}

const QUALITY_RAMP_START = 180_000;
const QUALITY_RAMP_END = 1_800_000;
const MIN_SPHERE_WIDTH_SEGMENTS = 8;
const MAX_SPHERE_WIDTH_SEGMENTS = 20;
const MIN_SPHERE_HEIGHT_SEGMENTS = 4;
const MAX_SPHERE_HEIGHT_SEGMENTS = 16;
const MIN_CYLINDER_RADIAL_SEGMENTS = 8;
const MAX_CYLINDER_RADIAL_SEGMENTS = 24;

export function applyMaterialPreset(material: MeshPhongMaterial, renderProfile: RenderProfileId, isAtom = false) {
  const preset = MATERIAL_PRESETS[renderProfile];
  if (!isAtom) {
    material.color.set(preset.bondColor);
  }
  material.specular.copy(preset.specular);
  material.shininess = preset.shininess;

  if (isAtom && renderProfile === 'houkmol') {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        // Houkmol-style view-space quadrant markings drawn on the atom surface.
        float quadrantWidth = 0.055;
        float quadrantSoftness = 0.018;
        float verticalMark = 1.0 - smoothstep(quadrantWidth, quadrantWidth + quadrantSoftness, abs(normal.x));
        float horizontalMark = 1.0 - smoothstep(quadrantWidth, quadrantWidth + quadrantSoftness, abs(normal.y));
        float quadrantMark = clamp(max(verticalMark, horizontalMark) * 0.92, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0), quadrantMark);
        `
      );
    };
    material.customProgramCacheKey = () => 'houkmol-quadrants';
  } else if (isAtom) {
    material.onBeforeCompile = () => {};
    material.customProgramCacheKey = () => '';
  }
  material.needsUpdate = true;
}

export function applyMaterialFinish(material: MeshPhongMaterial, renderProfile: RenderProfileId): void {
  const preset = MATERIAL_PRESETS[renderProfile];
  material.specular.copy(preset.specular);
  material.shininess = preset.shininess;
  material.needsUpdate = true;
}

export function bondStyleMaterial(style: BondStyleOverride | undefined, fallback: MeshPhongMaterial): MeshPhongMaterial {
  if (!style) return fallback;
  const material = fallback.clone();
  material.userData = { ...material.userData, bondStyleType: style.type };
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

export function bondMaterialForType(type: BondStyleType, fallback: MeshPhongMaterial): MeshPhongMaterial {
  return bondStyleMaterial(type === 'full' ? undefined : { type }, fallback);
}

export function bondKindToStyleType(kind: BondKind | undefined): BondStyleType {
  if (kind === 'Ts') return 'ts';
  if (kind === 'Dative') return 'dative';
  if (kind === 'Interaction') return 'interaction';
  if (kind === 'Thin') return 'thin';
  return 'full';
}

export function renderProfileShowsAtomSpheres(renderProfile: RenderProfileId): boolean {
  return renderProfile !== 'cylview';
}

export function renderProfileUsesSplitCylinderBonds(renderProfile: RenderProfileId): boolean {
  return renderProfile === 'cylview';
}

export function updateAngleSelection(
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

export function atomMaterial(color: string, renderProfile: RenderProfileId = 'ball-stick'): MeshPhongMaterial {
  const preset = MATERIAL_PRESETS[renderProfile];
  const mat = new MeshPhongMaterial({
    color,
    shininess: preset.shininess,
    specular: preset.specular.clone(),
  });
  if (renderProfile === 'houkmol') {
    applyMaterialPreset(mat, renderProfile, true);
  }
  return mat;
}

export function legacyBondMaterial(color: string, styleType: BondStyleType): MeshPhongMaterial {
  const material = new MeshPhongMaterial({
    color,
    shininess: MATERIAL_PRESETS.cylview.shininess,
    specular: MATERIAL_PRESETS.cylview.specular.clone(),
  });
  material.userData = { ...material.userData, legacyBondStyleType: styleType };
  if (styleType === 'ts') {
    material.transparent = true;
    material.opacity = 0.52;
  } else if (styleType === 'dative') {
    material.transparent = true;
    material.opacity = 0.64;
  } else if (styleType === 'interaction') {
    material.transparent = true;
    material.opacity = 0.42;
  }
  return material;
}

export function legacyAtomColorHex(
  atomIndex: number,
  element: string,
  elementColorOverrides: ElementColorOverrides,
  atomStyleOverrides: Record<string, AtomStyleOverride>,
): string {
  return atomStyleOverrides[String(atomIndex)]?.color
    ?? elementColorOverrides[element]
    ?? legacyElementColorHex(element);
}

export function legacyBondSplit(startElement: string, endElement: string): number {
  if (startElement === 'H' && endElement !== 'H') return 0.28;
  if (endElement === 'H' && startElement !== 'H') return 0.72;
  if (startElement !== 'C' && endElement === 'C') return 0.34;
  if (startElement === 'C' && endElement !== 'C') return 0.66;
  return 0.5;
}

export interface BondOverlapOptions {
  overlapStart?: boolean;
  overlapEnd?: boolean;
}

export function segmentTransform(
  start: Vector3,
  end: Vector3,
  from: number,
  to: number,
  radius: number,
  overlap?: BondOverlapOptions,
): Matrix4 | null {
  const segmentStart = start.clone().lerp(end, from);
  const segmentEnd = start.clone().lerp(end, to);
  if (segmentStart.distanceTo(segmentEnd) < 0.01) return null;
  return bondTransform(segmentStart, segmentEnd, radius, overlap);
}

export function bondTransform(
  start: Vector3,
  end: Vector3,
  radius: number,
  { overlapStart = false, overlapEnd = false }: BondOverlapOptions = {},
): Matrix4 {
  const UP = new Vector3(0, 1, 0);
  const axis = new Vector3().subVectors(end, start);
  const len = axis.length();
  if (len < 1e-6) {
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    return matrix.compose(start, quaternion, new Vector3(radius, 0.001, radius));
  }

  const dir = axis.clone().normalize();

  // Overlap at junction ends to eliminate rasterization gaps.
  // Tuned so tight junctions don't look swollen.
  const overlap = Math.min(radius * 0.35, len * 0.06);
  const startOver = overlapStart ? overlap : 0;
  const endOver = overlapEnd ? overlap : 0;
  const renderLength = len + startOver + endOver;

  const center = new Vector3()
    .addVectors(start, end)
    .multiplyScalar(0.5)
    .addScaledVector(dir, (endOver - startOver) * 0.5);

  const matrix = new Matrix4();
  const quaternion = new Quaternion();

  if (Math.abs(dir.dot(UP)) > 0.9999) {
    quaternion.setFromAxisAngle(new Vector3(1, 0, 0), dir.y < 0 ? Math.PI : 0);
  } else {
    quaternion.setFromUnitVectors(UP, dir);
  }

  return matrix.compose(center, quaternion, new Vector3(radius, renderLength, radius));
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function evenSegmentCount(value: number, min: number, max: number): number {
  const rounded = Math.round(value / 2) * 2;
  return clamp(rounded, min, max);
}

export function renderQualityProfileForScene(atomCount: number, bondCount: number): RenderQualityProfile {
  const primitiveLoad = atomCount + bondCount;
  const qualityT = smoothstep((primitiveLoad - QUALITY_RAMP_START) / (QUALITY_RAMP_END - QUALITY_RAMP_START));
  const nativePixelRatio = Math.min(window.devicePixelRatio, 2);
  const pixelRatio = Math.max(1, nativePixelRatio - (nativePixelRatio - 1) * qualityT);

  return {
    primitiveLoad,
    qualityT,
    pixelRatio,
    sphereWidthSegments: evenSegmentCount(
      MAX_SPHERE_WIDTH_SEGMENTS - (MAX_SPHERE_WIDTH_SEGMENTS - MIN_SPHERE_WIDTH_SEGMENTS) * qualityT,
      MIN_SPHERE_WIDTH_SEGMENTS,
      MAX_SPHERE_WIDTH_SEGMENTS,
    ),
    sphereHeightSegments: evenSegmentCount(
      MAX_SPHERE_HEIGHT_SEGMENTS - (MAX_SPHERE_HEIGHT_SEGMENTS - MIN_SPHERE_HEIGHT_SEGMENTS) * qualityT,
      MIN_SPHERE_HEIGHT_SEGMENTS,
      MAX_SPHERE_HEIGHT_SEGMENTS,
    ),
    cylinderRadialSegments: evenSegmentCount(
      MAX_CYLINDER_RADIAL_SEGMENTS - (MAX_CYLINDER_RADIAL_SEGMENTS - MIN_CYLINDER_RADIAL_SEGMENTS) * qualityT,
      MIN_CYLINDER_RADIAL_SEGMENTS,
      MAX_CYLINDER_RADIAL_SEGMENTS,
    ),
  };
}

export function applyRenderPixelRatio(ctx: SceneCtx, atomCount: number, bondCount: number): void {
  const nextPixelRatio = renderQualityProfileForScene(atomCount, bondCount).pixelRatio;
  if (Math.abs(ctx.renderer.getPixelRatio() - nextPixelRatio) < 0.01) return;

  const canvas = ctx.renderer.domElement;
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 600;
  ctx.renderer.setPixelRatio(nextPixelRatio);
  ctx.renderer.setSize(width, height, false);
  ctx.depthCue.composer?.setPixelRatio(nextPixelRatio);
  ctx.depthCue.composer?.setSize(width, height);
  ctx.perspectiveCamera.aspect = width / height;
  ctx.perspectiveCamera.updateProjectionMatrix();
  if (ctx.camera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
}

export function moleculeBatchGeometries(
  ctx: SceneCtx,
  atomCount: number,
  bondCount: number,
): { sphereGeom: SphereGeometry; cylGeom: CylinderGeometry; qualityProfile: RenderQualityProfile } {
  const qualityProfile = renderQualityProfileForScene(atomCount, bondCount);
  const sphereKey = `${qualityProfile.sphereWidthSegments}x${qualityProfile.sphereHeightSegments}`;
  const cylinderKey = String(qualityProfile.cylinderRadialSegments);

  let sphereGeom = ctx.sphereGeometryCache.get(sphereKey);
  if (!sphereGeom) {
    sphereGeom = new SphereGeometry(
      1,
      qualityProfile.sphereWidthSegments,
      qualityProfile.sphereHeightSegments,
    );
    ctx.sphereGeometryCache.set(sphereKey, sphereGeom);
  }

  let cylGeom = ctx.cylinderGeometryCache.get(cylinderKey);
  if (!cylGeom) {
    cylGeom = new CylinderGeometry(1, 1, 1, qualityProfile.cylinderRadialSegments, 1, true);
    ctx.cylinderGeometryCache.set(cylinderKey, cylGeom);
  }

  return { sphereGeom, cylGeom, qualityProfile };
}

import {
  Color,
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
  MaterialPresetId,
  BondStyleType,
  BondKind,
  AtomStyleOverride,
  BondStyleOverride,
  ElementColorOverrides,
  ViewOptions,
} from '../../App';
import type { SceneCtx, AtomSelectionData } from './types';

// Atom colours: keep the palette restrained so the cylindrical bonds dominate.
export const ATOM_COLORS: Record<string, number> = {
  H: 0xcfd3d7,
  C: 0x8d949c,
  N: 0x4b84d8,
  O: 0xea6a1a,
  F: 0x33CC55,
  P: 0xFF8800,
  S: 0xDDAA00,
  Cl: 0x22BB44,
  Br: 0xAA2200,
  I: 0x770088,
};

export const LEGACY_ELEMENT_COLORS: Record<string, number> = {
  H: 0xc8ccd0,
  C: 0x129bdd,
  N: 0x3f7fd6,
  O: 0xe86a1a,
  F: 0x6fcf80,
  P: 0xf6a23a,
  S: 0xd8a21e,
  Cl: 0x45b86b,
  Br: 0xa9492e,
  I: 0x7f4a96,
};

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

export function atomColor(element: string): number {
  return ATOM_COLORS[element] ?? 0x888888;
}

export function atomColorHex(element: string): string {
  return `#${atomColor(element).toString(16).padStart(6, '0')}`;
}

export function legacyElementColorHex(element: string): string {
  return `#${(LEGACY_ELEMENT_COLORS[element] ?? 0x8d949c).toString(16).padStart(6, '0')}`;
}

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

export const MATERIAL_PRESETS = {
  CYLviewLegacy: {
    specular: new Color(0.28, 0.32, 0.36),
    shininess: 68,
    bondColor: 0x129bdd,
  },
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

const LARGE_SCENE_ATOM_THRESHOLD = 150_000;
const LARGE_SCENE_PRIMITIVE_THRESHOLD = 600_000;

export function applyMaterialPreset(material: MeshPhongMaterial, presetId: MaterialPresetId, isAtom = false) {
  const preset = MATERIAL_PRESETS[presetId];
  if (!isAtom) {
    material.color.set(preset.bondColor);
  }
  material.specular.copy(preset.specular);
  material.shininess = preset.shininess;

  if (isAtom && presetId === 'Houkmol') {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        // Houkmol quadrant shading
        float qx = step(0.0, normal.x);
        float qy = step(0.0, normal.y);
        float quadrantShade = 0.86 + 0.14 * (qx * 0.6 + qy * 0.4);
        diffuseColor.rgb *= quadrantShade;
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

export function bondStyleMaterial(style: BondStyleOverride | undefined, fallback: MeshPhongMaterial): MeshPhongMaterial {
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

export function atomMaterial(color: string, presetId: MaterialPresetId = 'Houkmol'): MeshPhongMaterial {
  const preset = MATERIAL_PRESETS[presetId];
  const mat = new MeshPhongMaterial({
    color,
    shininess: preset.shininess,
    specular: preset.specular.clone(),
  });
  if (presetId === 'Houkmol') {
    applyMaterialPreset(mat, presetId, true);
  }
  return mat;
}

export function legacyBondMaterial(color: string, styleType: BondStyleType): MeshPhongMaterial {
  const material = new MeshPhongMaterial({
    color,
    shininess: MATERIAL_PRESETS.CYLviewLegacy.shininess,
    specular: MATERIAL_PRESETS.CYLviewLegacy.specular.clone(),
  });
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

export function segmentTransform(start: Vector3, end: Vector3, from: number, to: number, radius: number): Matrix4 | null {
  const segmentStart = start.clone().lerp(end, from);
  const segmentEnd = start.clone().lerp(end, to);
  if (segmentStart.distanceTo(segmentEnd) < 0.01) return null;
  return bondTransform(segmentStart, segmentEnd, radius);
}

export function bondTransform(start: Vector3, end: Vector3, radius: number): Matrix4 {
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

export function isLargeScene(atomCount: number, bondCount: number): boolean {
  return (
    atomCount >= LARGE_SCENE_ATOM_THRESHOLD ||
    atomCount + bondCount >= LARGE_SCENE_PRIMITIVE_THRESHOLD
  );
}

export function renderPixelRatioForScene(atomCount: number, bondCount: number): number {
  if (isLargeScene(atomCount, bondCount)) return 1;
  return Math.min(window.devicePixelRatio, 2);
}

export function applyRenderPixelRatio(ctx: SceneCtx, atomCount: number, bondCount: number): void {
  const nextPixelRatio = renderPixelRatioForScene(atomCount, bondCount);
  if (Math.abs(ctx.renderer.getPixelRatio() - nextPixelRatio) < 0.01) return;

  const canvas = ctx.renderer.domElement;
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 600;
  ctx.renderer.setPixelRatio(nextPixelRatio);
  ctx.renderer.setSize(width, height, false);
  ctx.perspectiveCamera.aspect = width / height;
  ctx.perspectiveCamera.updateProjectionMatrix();
  if (ctx.camera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
}

export function moleculeBatchGeometries(
  ctx: SceneCtx,
  atomCount: number,
  bondCount: number,
): { sphereGeom: SphereGeometry; cylGeom: CylinderGeometry } {
  if (isLargeScene(atomCount, bondCount)) {
    return {
      sphereGeom: ctx.lowDetailSphereGeom,
      cylGeom: ctx.lowDetailCylGeom,
    };
  }

  return {
    sphereGeom: ctx.sphereGeom,
    cylGeom: ctx.cylGeom,
  };
}

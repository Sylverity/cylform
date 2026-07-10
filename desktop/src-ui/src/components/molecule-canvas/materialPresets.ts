import { Color } from 'three';
import type { RenderProfileId } from '../../types';

export const ATOM_COLORS: Record<string, number> = {
  H: 0xcfd3d7,
  C: 0x8d949c,
  N: 0x4b84d8,
  O: 0xea6a1a,
  F: 0x33cc55,
  P: 0xff8800,
  S: 0xddaa00,
  Cl: 0x22bb44,
  Br: 0xaa2200,
  I: 0x770088,
  B: 0xd89a65,
  Si: 0xb19cd9,
  Se: 0xc77c22,
  Li: 0x8fa7ff,
  Na: 0x9aa8ff,
  K: 0xb98cff,
  Mg: 0x76c893,
  Ca: 0x77d08a,
  Fe: 0xc96d43,
  Cu: 0xb87333,
  Zn: 0x8ea4c9,
  Pd: 0x7f99a8,
  Pt: 0x8f9fb6,
  Au: 0xd4af37,
  Ag: 0xb9c3cc,
  Hg: 0x9fb0c8,
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

export const MATERIAL_PRESETS = {
  cylview: {
    specular: new Color(0.28, 0.32, 0.36),
    shininess: 68,
    bondColor: 0x129bdd,
  },
  'ball-stick': {
    specular: new Color(0.86, 0.9, 0.96),
    shininess: 175,
    bondColor: 0x2f9df4,
  },
  houkmol: {
    specular: new Color(0.4, 0.4, 0.4),
    shininess: 32,
    bondColor: 0x000000,
  },
} satisfies Record<RenderProfileId, { specular: Color; shininess: number; bondColor: number }>;

export function colorNumberToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function atomColor(element: string): number {
  return ATOM_COLORS[element] ?? 0x888888;
}

export function atomColorHex(element: string): string {
  return colorNumberToHex(atomColor(element));
}

export function legacyElementColorHex(element: string): string {
  return colorNumberToHex(LEGACY_ELEMENT_COLORS[element] ?? atomColor(element));
}

export function defaultElementColorHex(element: string, renderProfile: RenderProfileId): string {
  return renderProfile === 'cylview'
    ? legacyElementColorHex(element)
    : atomColorHex(element);
}

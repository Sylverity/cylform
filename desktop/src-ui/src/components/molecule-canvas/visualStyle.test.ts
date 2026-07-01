import { describe, expect, it } from 'vitest';
import { MeshPhongMaterial } from 'three';
import {
  applyMaterialFinish,
  applyMaterialPreset,
  atomMaterial,
  atomDisplayRadius,
  atomColorHex,
  legacyElementColorHex,
  moleculeBatchGeometries,
  renderProfileShowsAtomSpheres,
  renderProfileUsesSplitCylinderBonds,
} from './visualStyle';
import type { SceneCtx } from './types';
import { defaultElementColorHex, MATERIAL_PRESETS } from './materialPresets';

describe('render profiles', () => {
  it('preserves CYLview element colors and adds fallback colors for extended elements', () => {
    expect(legacyElementColorHex('C')).toBe('#129bdd');
    expect(legacyElementColorHex('O')).toBe('#e86a1a');
    expect(atomColorHex('Fe')).toBe('#c96d43');
    expect(defaultElementColorHex('C', 'cylview')).toBe('#129bdd');
    expect(defaultElementColorHex('C', 'ball-stick')).toBe('#8d949c');
  });

  it('toggles Houkmol shader patch keys on atom materials', () => {
    const material = new MeshPhongMaterial({ color: 0xffffff });
    applyMaterialPreset(material, 'houkmol', true);
    expect(material.customProgramCacheKey()).toBe('houkmol-quadrants');

    applyMaterialPreset(material, 'ball-stick', true);
    expect(material.customProgramCacheKey()).toBe('');
  });

  it('uses ball-and-stick glossy finish for default atom materials', () => {
    const material = atomMaterial('#ffffff');

    expect(material.shininess).toBe(175);
    expect(material.customProgramCacheKey()).not.toBe('houkmol-quadrants');
  });

  it('updates material finish without replacing styled bond colors', () => {
    const material = new MeshPhongMaterial({ color: 0x123456 });
    applyMaterialFinish(material, 'houkmol');

    expect(material.color.getHex()).toBe(0x123456);
    expect(material.shininess).toBe(32);
  });

  it('keeps Houkmol normal bonds black without changing the other profiles', () => {
    expect(MATERIAL_PRESETS.houkmol.bondColor).toBe(0x000000);
    expect(MATERIAL_PRESETS.cylview.bondColor).toBe(0x129bdd);
    expect(MATERIAL_PRESETS['ball-stick'].bondColor).toBe(0x2f9df4);
  });

  it('keeps CYLview geometry-forward while ball-and-stick renders atom spheres', () => {
    expect(renderProfileUsesSplitCylinderBonds('cylview')).toBe(true);
    expect(renderProfileShowsAtomSpheres('cylview')).toBe(false);
    expect(renderProfileUsesSplitCylinderBonds('ball-stick')).toBe(false);
    expect(renderProfileShowsAtomSpheres('ball-stick')).toBe(true);
    expect(renderProfileUsesSplitCylinderBonds('houkmol')).toBe(false);
    expect(renderProfileShowsAtomSpheres('houkmol')).toBe(true);
  });

  it('uses capped cylinders so straight-on tube ends are not hollow', () => {
    const ctx = {
      sphereGeometryCache: new Map(),
      cylinderGeometryCache: new Map(),
    } as unknown as SceneCtx;
    const { cylGeom } = moleculeBatchGeometries(ctx, 20, 20);

    expect(cylGeom.parameters.openEnded).toBe(false);
  });

  it('keeps default carbon atoms large enough to cover normal bond ends', () => {
    const normalBondRadius = 0.08 * 0.82;

    expect(atomDisplayRadius('C')).toBeGreaterThan(normalBondRadius * 2);
  });
});

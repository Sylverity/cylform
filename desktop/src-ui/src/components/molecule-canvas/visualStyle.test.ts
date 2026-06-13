import { describe, expect, it } from 'vitest';
import { MeshPhongMaterial } from 'three';
import {
  applyMaterialFinish,
  applyMaterialPreset,
  atomColorHex,
  legacyElementColorHex,
} from './visualStyle';
import { defaultElementColorHex } from './materialPresets';

describe('material presets', () => {
  it('preserves CYLView Legacy element colors and adds fallback colors for extended elements', () => {
    expect(legacyElementColorHex('C')).toBe('#129bdd');
    expect(legacyElementColorHex('O')).toBe('#e86a1a');
    expect(atomColorHex('Fe')).toBe('#c96d43');
    expect(defaultElementColorHex('C', 'CYLviewLegacy')).toBe('#129bdd');
    expect(defaultElementColorHex('C', 'CYLview')).toBe('#8d949c');
  });

  it('toggles Houkmol shader patch keys on atom materials', () => {
    const material = new MeshPhongMaterial({ color: 0xffffff });
    applyMaterialPreset(material, 'Houkmol', true);
    expect(material.customProgramCacheKey()).toBe('houkmol-quadrants');

    applyMaterialPreset(material, 'CYLview', true);
    expect(material.customProgramCacheKey()).toBe('');
  });

  it('updates material finish without replacing styled bond colors', () => {
    const material = new MeshPhongMaterial({ color: 0x123456 });
    applyMaterialFinish(material, 'Houkmol');

    expect(material.color.getHex()).toBe(0x123456);
    expect(material.shininess).toBe(36);
  });
});

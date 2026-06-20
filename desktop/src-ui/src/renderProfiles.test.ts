import { describe, expect, it } from 'vitest';
import {
  legacyMaterialPresetToRenderProfile,
  normalizeRenderProfile,
  renderProfileToLegacyMaterialPreset,
} from './renderProfiles';

describe('render profile compatibility', () => {
  it('maps legacy material names to first-class render profiles', () => {
    expect(legacyMaterialPresetToRenderProfile('CYLviewLegacy')).toBe('cylview');
    expect(legacyMaterialPresetToRenderProfile('CYLview')).toBe('ball-stick');
    expect(legacyMaterialPresetToRenderProfile('Houkmol')).toBe('houkmol');
  });

  it('normalizes explicit profiles before falling back to legacy aliases', () => {
    expect(normalizeRenderProfile('cylview')).toBe('cylview');
    expect(normalizeRenderProfile('CYLviewLegacy')).toBe('cylview');
    expect(normalizeRenderProfile('Mystery', 'ball-stick')).toBe('ball-stick');
  });

  it('writes compatibility material aliases for transitional saved state', () => {
    expect(renderProfileToLegacyMaterialPreset('cylview')).toBe('CYLviewLegacy');
    expect(renderProfileToLegacyMaterialPreset('ball-stick')).toBe('CYLview');
    expect(renderProfileToLegacyMaterialPreset('houkmol')).toBe('Houkmol');
  });
});

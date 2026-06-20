import type { LegacyMaterialPresetId, RenderProfileId } from './App';

export const RENDER_PROFILE_IDS = ['cylview', 'ball-stick', 'houkmol'] as const;

const RENDER_PROFILE_ID_SET = new Set<string>(RENDER_PROFILE_IDS);

export function legacyMaterialPresetToRenderProfile(value: unknown): RenderProfileId | null {
  if (value === 'CYLviewLegacy') return 'cylview';
  if (value === 'CYLview') return 'ball-stick';
  if (value === 'Houkmol') return 'houkmol';
  return null;
}

export function normalizeRenderProfile(value: unknown, fallback: RenderProfileId = 'cylview'): RenderProfileId {
  if (typeof value === 'string') {
    if (RENDER_PROFILE_ID_SET.has(value)) return value as RenderProfileId;
    const legacyProfile = legacyMaterialPresetToRenderProfile(value);
    if (legacyProfile) return legacyProfile;
  }
  return fallback;
}

export function renderProfileToLegacyMaterialPreset(profile: RenderProfileId): LegacyMaterialPresetId {
  if (profile === 'ball-stick') return 'CYLview';
  if (profile === 'houkmol') return 'Houkmol';
  return 'CYLviewLegacy';
}

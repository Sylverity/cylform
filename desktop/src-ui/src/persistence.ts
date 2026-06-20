import type {
  Annotation,
  AppSettings,
  AtomStyleOverride,
  BondStyleOverride,
  ElementColorOverrides,
  HydrogenVisibility,
  PresentationState,
  RenderProfileId,
  SavedPose,
  SessionTabsEnvelope,
  ViewOptions,
} from './App';
import { normalizeRenderProfile, renderProfileToLegacyMaterialPreset } from './renderProfiles';

export interface PresentationStateParts {
  poses: SavedPose[];
  annotations: Annotation[];
  hiddenAtomIndices: number[];
  hydrogenVisibility: HydrogenVisibility;
  elementColorOverrides: ElementColorOverrides;
  atomSizeScale: number;
  atomStyleOverrides: Record<string, AtomStyleOverride>;
  bondStyleOverrides: Record<string, BondStyleOverride>;
  renderProfile: RenderProfileId;
  viewOptions: ViewOptions;
}

export type NormalizedPresentationState = PresentationState & {
  camera: ViewOptions;
};

export function createDefaultPresentationState(
  settings: AppSettings,
): NormalizedPresentationState {
  const defaultRenderProfile = normalizeRenderProfile(
    settings.rendering.defaultRenderProfile ?? settings.rendering.defaultMaterialPreset,
  );
  const defaultFogEnabled = defaultRenderProfile === 'cylview';
  const showFloorGrid = settings.rendering.showFloorGridByDefault;
  const backdropTone =
    settings.rendering.defaultBackground === 'black'
      ? 'black'
      : settings.rendering.defaultBackground === 'custom'
        ? 'custom'
        : 'clean';

  return {
    version: 1,
    annotations: [],
    hidden_atoms: [],
    styles: {
      hydrogen_visibility: settings.chemistry.defaultHydrogenVisibility,
      element_color_overrides: {},
      atom_size_scale: 1,
      atom_style_overrides: {},
      bond_style_overrides: {},
      render_profile: defaultRenderProfile,
      material_preset: renderProfileToLegacyMaterialPreset(defaultRenderProfile),
    },
    poses: [],
    camera: {
      showFloor: showFloorGrid,
      showGrid: showFloorGrid,
      backdropTone,
      customBackdropHex: settings.rendering.customBackgroundHex,
      projection: settings.rendering.defaultProjection,
      lightingMood: settings.rendering.defaultLighting,
      fogEnabled: defaultFogEnabled,
      fogIntensity: defaultFogEnabled ? 0.55 : 0.45,
      fogDepth: defaultFogEnabled ? 0.58 : 0.5,
      focalBlurEnabled: false,
      focalBlurAmount: 0.32,
      focalDepth: 0.5,
      autoRotate: false,
      autoRotateSpeed: 0.35,
      labelFontScale: 1.0,
      bondSizeScale: 1.0,
      showLabelLinkLines: false,
    },
  };
}

export function normalizePresentationState(
  state: PresentationState | null | undefined,
  settings: AppSettings,
): NormalizedPresentationState {
  const defaults = createDefaultPresentationState(settings);
  const styles = state?.styles ?? {};
  const renderProfile = normalizeRenderProfile(
    styles.render_profile ?? styles.material_preset,
    defaults.styles.render_profile ?? 'cylview',
  );
  const cameraDefaults = createDefaultPresentationState({
    ...settings,
    rendering: {
      ...settings.rendering,
      defaultRenderProfile: renderProfile,
    },
  }).camera;
  const camera = state?.camera
    ? {
        ...cameraDefaults,
        ...state.camera,
      }
    : cameraDefaults;

  return {
    version: 1,
    annotations: Array.isArray(state?.annotations) ? state.annotations : defaults.annotations,
    hidden_atoms: Array.isArray(state?.hidden_atoms) ? state.hidden_atoms : defaults.hidden_atoms,
    poses: Array.isArray(state?.poses) ? state.poses : defaults.poses,
    styles: {
      hydrogen_visibility: styles.hydrogen_visibility ?? defaults.styles.hydrogen_visibility,
      element_color_overrides:
        styles.element_color_overrides ?? defaults.styles.element_color_overrides,
      atom_size_scale: styles.atom_size_scale ?? defaults.styles.atom_size_scale,
      atom_style_overrides: styles.atom_style_overrides ?? defaults.styles.atom_style_overrides,
      bond_style_overrides: styles.bond_style_overrides ?? defaults.styles.bond_style_overrides,
      render_profile: renderProfile,
      material_preset: renderProfileToLegacyMaterialPreset(renderProfile),
    },
    camera,
  };
}

export function serializePresentationState(parts: PresentationStateParts): PresentationState {
  return {
    version: 1,
    poses: parts.poses,
    annotations: parts.annotations,
    hidden_atoms: parts.hiddenAtomIndices,
    styles: {
      hydrogen_visibility: parts.hydrogenVisibility,
      element_color_overrides: parts.elementColorOverrides,
      atom_size_scale: parts.atomSizeScale,
      atom_style_overrides: parts.atomStyleOverrides,
      bond_style_overrides: parts.bondStyleOverrides,
      render_profile: parts.renderProfile,
      material_preset: renderProfileToLegacyMaterialPreset(parts.renderProfile),
    },
    camera: parts.viewOptions,
  };
}

export function normalizeSessionTabs(
  session: SessionTabsEnvelope | null | undefined,
): SessionTabsEnvelope {
  const tabs = (session?.tabs ?? [])
    .filter((tab) => tab.id.trim() && tab.path.trim() && tab.displayName.trim())
    .map((tab) => ({ ...tab }));
  const activeTabId = tabs.some((tab) => tab.id === session?.activeTabId)
    ? session?.activeTabId ?? null
    : tabs[0]?.id ?? null;

  return {
    version: 1,
    activeTabId,
    tabs,
  };
}

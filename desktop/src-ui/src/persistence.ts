import type {
  Annotation,
  AppSettings,
  AtomStyleOverride,
  BondStyleOverride,
  ElementColorOverrides,
  HydrogenVisibility,
  MaterialPresetId,
  PresentationState,
  SavedPose,
  SessionTabsEnvelope,
  ViewOptions,
} from './App';

export interface PresentationStateParts {
  poses: SavedPose[];
  annotations: Annotation[];
  hiddenAtomIndices: number[];
  hydrogenVisibility: HydrogenVisibility;
  elementColorOverrides: ElementColorOverrides;
  atomSizeScale: number;
  atomStyleOverrides: Record<string, AtomStyleOverride>;
  bondStyleOverrides: Record<string, BondStyleOverride>;
  materialPreset: MaterialPresetId;
  viewOptions: ViewOptions;
}

export type NormalizedPresentationState = PresentationState & {
  camera: ViewOptions;
};

const DEFAULT_MATERIAL_PRESET: MaterialPresetId = 'CYLview';
const MATERIAL_PRESET_IDS = new Set<MaterialPresetId>(['CYLviewLegacy', 'CYLview', 'Houkmol']);

function normalizeMaterialPreset(value: unknown, fallback = DEFAULT_MATERIAL_PRESET): MaterialPresetId {
  return typeof value === 'string' && MATERIAL_PRESET_IDS.has(value as MaterialPresetId)
    ? value as MaterialPresetId
    : fallback;
}

export function createDefaultPresentationState(
  settings: AppSettings,
): NormalizedPresentationState {
  const defaultMaterial = normalizeMaterialPreset(settings.rendering.defaultMaterialPreset);
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
      material_preset: defaultMaterial,
    },
    poses: [],
    camera: {
      showFloor: showFloorGrid,
      showGrid: showFloorGrid,
      backdropTone,
      customBackdropHex: settings.rendering.customBackgroundHex,
      projection: settings.rendering.defaultProjection,
      lightingMood: settings.rendering.defaultLighting,
      fogEnabled: false,
      fogIntensity: 0.45,
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
  const camera = state?.camera
    ? {
        ...defaults.camera,
        ...state.camera,
      }
    : defaults.camera;

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
      material_preset: normalizeMaterialPreset(styles.material_preset, defaults.styles.material_preset),
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
      material_preset: parts.materialPreset,
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

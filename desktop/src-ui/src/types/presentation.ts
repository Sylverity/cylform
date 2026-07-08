import type { LabelAnchor } from './molecule';

export interface SelectedBondMeasurement {
  atom1Element: string;
  atom2Element: string;
  distance: number;
  anchor: LabelAnchor;
  atomIndices?: [number, number];
}

export interface SelectedAngleMeasurement {
  atomElements: [string, string, string];
  angleDegrees: number;
  stage: 1 | 2 | 3;
  anchor?: LabelAnchor;
  atomIndices?: [number, number, number];
}

export interface SelectedDihedralMeasurement {
  atomElements: [string, string, string, string];
  dihedralDegrees: number;
  stage: 1 | 2 | 3 | 4;
  anchor?: LabelAnchor;
  atomIndices?: [number, number, number, number];
}

export type SelectionMode = 'view' | 'measure' | 'atom' | 'bond' | 'atom-bond' | 'label';
export type HydrogenVisibility = 'shown' | 'hidden' | 'hide-c-h';

export interface SelectionSummary {
  atomCount: number;
  bondCount: number;
  atomIndices: number[];
  bondKeys: string[];
}

export type ElementColorOverrides = Record<string, string>;
export type AnnotationType = 'AtomLabel' | 'Distance' | 'Angle' | 'Dihedral';
export type BondStyleType = 'full' | 'ts' | 'dative' | 'interaction' | 'thin';
export type LegacyMaterialPresetId = 'CYLviewLegacy' | 'CYLview' | 'Houkmol';
export type MaterialPresetId = LegacyMaterialPresetId;
export type RenderProfileId = 'cylview' | 'ball-stick' | 'houkmol';

export interface Annotation {
  id: string;
  type: AnnotationType;
  text: string;
  anchor: LabelAnchor;
  visible: boolean;
  atom_id?: number;
  atoms?: number[];
  value?: number;
  source?: {
    atomIndex?: number;
    atomIndices?: number[];
    bond?: [number, number];
  };
}

export type PersistentLabel = Annotation;

export type BackdropTone = 'clean' | 'warm' | 'slate' | 'black' | 'custom';
export type ProjectionMode = 'perspective' | 'orthographic';
export type LightingMood = 'publication' | 'soft-studio' | 'high-contrast';

export interface ViewOptions {
  showFloor: boolean;
  showGrid: boolean;
  backdropTone: BackdropTone;
  customBackdropHex?: string;
  projection: ProjectionMode;
  lightingMood: LightingMood;
  fogEnabled: boolean;
  fogIntensity: number;
  fogDepth: number;
  focalBlurEnabled: boolean;
  focalBlurAmount: number;
  focalDepth: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
  labelFontScale: number;
  bondSizeScale: number;
  showLabelLinkLines: boolean;
}

export interface SavedPose {
  id: string;
  name: string;
  cameraPosition: LabelAnchor;
  target: LabelAnchor;
  projection: ProjectionMode;
  viewOptions: ViewOptions;
}

export interface AtomStyleOverride {
  color?: string;
  sizeScale?: number;
}

export interface BondStyleOverride {
  type: BondStyleType;
}

export interface PresentationState {
  version: 1;
  poses: SavedPose[];
  annotations: Annotation[];
  hidden_atoms: number[];
  styles: {
    hydrogen_visibility?: HydrogenVisibility;
    element_color_overrides?: ElementColorOverrides;
    atom_size_scale?: number;
    atom_style_overrides?: Record<string, AtomStyleOverride>;
    bond_style_overrides?: Record<string, BondStyleOverride>;
    render_profile?: RenderProfileId;
    material_preset?: MaterialPresetId;
  };
  camera?: ViewOptions;
}

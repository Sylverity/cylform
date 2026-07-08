import type {
  HydrogenVisibility,
  LightingMood,
  MaterialPresetId,
  ProjectionMode,
  RenderProfileId,
} from './presentation';

export interface AppSettings {
  version: 1;
  rendering: {
    pngExportScale: 1 | 2 | 4;
    defaultBackground: 'white' | 'black' | 'custom';
    customBackgroundHex: string;
    defaultRenderProfile: RenderProfileId;
    defaultMaterialPreset?: MaterialPresetId;
    defaultProjection: ProjectionMode;
    defaultLighting: LightingMood;
    showFloorGridByDefault: boolean;
  };
  chemistry: {
    defaultHydrogenVisibility: HydrogenVisibility;
    distancePrecision: number;
    anglePrecision: number;
    bondPerceptionTolerance: number;
    useSymbolUnits: boolean;
  };
  interaction: {
    mouseMode: 'standard' | 'one-button';
    invertScrollZoom: boolean;
    keyboardShortcuts: Record<string, string>;
  };
  files: {
    autosavePresentationState: boolean;
    restorePreviousSessionOnStartup: boolean;
    droppedFilesOpenInBackground: boolean;
    recentFilesLimit: number;
  };
  app: {
    autoCheckForUpdates: boolean;
    devtoolsMenuEnabled: boolean;
    theme: 'auto' | 'light' | 'dark';
  };
}

export interface AppDataPaths {
  root: string;
  settings: string;
  session_tabs: string;
  recent_files: string;
  saved_info: string;
  pose_library: string;
  pose_previews: string;
}

export function defaultAppSettings(): AppSettings {
  return {
    version: 1,
    rendering: {
      pngExportScale: 2,
      defaultBackground: 'white',
      customBackgroundHex: '#ffffff',
      defaultRenderProfile: 'cylview',
      defaultMaterialPreset: 'CYLviewLegacy',
      defaultProjection: 'perspective',
      defaultLighting: 'publication',
      showFloorGridByDefault: false,
    },
    chemistry: {
      defaultHydrogenVisibility: 'shown',
      distancePrecision: 2,
      anglePrecision: 1,
      bondPerceptionTolerance: 1.3,
      useSymbolUnits: true,
    },
    interaction: {
      mouseMode: 'standard',
      invertScrollZoom: false,
      keyboardShortcuts: {},
    },
    files: {
      autosavePresentationState: true,
      restorePreviousSessionOnStartup: true,
      droppedFilesOpenInBackground: true,
      recentFilesLimit: 12,
    },
    app: {
      autoCheckForUpdates: false,
      devtoolsMenuEnabled: true,
      theme: 'dark',
    },
  };
}

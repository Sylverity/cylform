import { describe, expect, it } from 'vitest';
import {
  createDefaultPresentationState,
  normalizePresentationState,
  normalizeSessionTabs,
  serializePresentationState,
} from './persistence';
import type { Annotation, AppSettings, ViewOptions } from './App';

function testSettings(): AppSettings {
  return {
    version: 1,
    rendering: {
      pngExportScale: 2,
      defaultBackground: 'white',
      customBackgroundHex: '#ffffff',
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
      theme: 'auto',
    },
  };
}

function testViewOptions(): ViewOptions {
  return {
    showFloor: false,
    showGrid: false,
    backdropTone: 'clean',
    customBackdropHex: '#ffffff',
    projection: 'perspective',
    lightingMood: 'publication',
    fogEnabled: false,
    fogIntensity: 0.45,
    autoRotate: false,
    autoRotateSpeed: 0.35,
    labelFontScale: 1.0,
    bondSizeScale: 1.0,
    showLabelLinkLines: false,
  };
}

describe('presentation persistence', () => {
  it('serializes and normalizes annotations through the app persistence shape', () => {
    const annotation: Annotation = {
      id: 'label-7',
      type: 'Distance',
      text: 'C-O 1.23 A',
      anchor: { x: 1, y: 2, z: 3 },
      visible: true,
      atoms: [0, 1],
      value: 1.23,
      source: { bond: [0, 1], atomIndices: [0, 1] },
    };

    const state = serializePresentationState({
      poses: [],
      annotations: [annotation],
      hiddenAtomIndices: [4],
      hydrogenVisibility: 'hide-c-h',
      elementColorOverrides: { O: '#ff0000' },
      atomSizeScale: 1.2,
      atomStyleOverrides: { '0': { color: '#222222', sizeScale: 1.1 } },
      bondStyleOverrides: { '0-1': { type: 'thin' } },
      materialPreset: 'Houkmol',
      viewOptions: testViewOptions(),
    });

    const normalized = normalizePresentationState(
      JSON.parse(JSON.stringify(state)),
      testSettings(),
      'CYLviewLegacy',
    );

    expect(normalized.annotations).toEqual([annotation]);
    expect(normalized.hidden_atoms).toEqual([4]);
    expect(normalized.styles.hydrogen_visibility).toBe('hide-c-h');
    expect(normalized.styles.bond_style_overrides?.['0-1']).toEqual({ type: 'thin' });
  });

  it('fills missing presentation fields from current app defaults', () => {
    const defaults = createDefaultPresentationState(testSettings(), 'CYLviewLegacy');
    const normalized = normalizePresentationState(
      { version: 1, annotations: [], hidden_atoms: [], poses: [], styles: {} },
      testSettings(),
      'CYLviewLegacy',
    );

    expect(normalized.camera).toEqual(defaults.camera);
    expect(normalized.styles.hydrogen_visibility).toBe('shown');
    expect(normalized.styles.material_preset).toBe('CYLviewLegacy');
    expect(normalized.camera.fogEnabled).toBe(false);
  });

  it('preserves explicit glossy CYLview state but falls back from unknown presets', () => {
    const settings = testSettings();
    settings.rendering.defaultMaterialPreset = 'CYLview';
    const glossy = normalizePresentationState(
      { version: 1, annotations: [], hidden_atoms: [], poses: [], styles: { material_preset: 'CYLview' } },
      settings,
      'CYLviewLegacy',
    );
    const unknown = normalizePresentationState(
      { version: 1, annotations: [], hidden_atoms: [], poses: [], styles: { material_preset: 'Mystery' as never } },
      settings,
      'CYLviewLegacy',
    );

    expect(glossy.styles.material_preset).toBe('CYLview');
    expect(unknown.styles.material_preset).toBe('CYLview');
  });
});

describe('session tab persistence', () => {
  it('drops invalid restored tabs and falls back to the first available active tab', () => {
    const normalized = normalizeSessionTabs({
      version: 1,
      activeTabId: 'missing',
      tabs: [
        { id: 'blank-path', path: '', displayName: 'Blank', lastOpenedAt: '2026-05-28T00:00:00Z' },
        { id: 'tab-a', path: '/tmp/a.xyz', displayName: 'a.xyz', lastOpenedAt: '2026-05-28T00:01:00Z' },
        { id: 'tab-b', path: '/tmp/b.pdb', displayName: 'b.pdb', lastOpenedAt: '2026-05-28T00:02:00Z' },
      ],
    });

    expect(normalized.tabs.map((tab) => tab.id)).toEqual(['tab-a', 'tab-b']);
    expect(normalized.activeTabId).toBe('tab-a');
  });
});

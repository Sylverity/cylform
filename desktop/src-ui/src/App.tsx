import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import './App.css'
import { Toolbar } from './components/Toolbar'
import { InfoPanel } from './components/InfoPanel'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { ToastContainer, type ToastMessage } from './components/Toast'
import { LoadingSpinner } from './components/LoadingSpinner'

const MoleculeCanvas = lazy(() =>
  import('./components/MoleculeCanvas').then((module) => ({
    default: module.MoleculeCanvas,
  })),
);

export interface AtomData {
  x: number;
  y: number;
  z: number;
  element: string;
  radius: number;
  metadata?: AtomMetadata;
}

export interface BondData {
  atom1: number;
  atom2: number;
  radius: number;
  kind: BondKind;
}

export interface LabelAnchor {
  x: number;
  y: number;
  z: number;
}

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
export type BondKind = 'Normal' | 'Ts' | 'Dative' | 'Interaction' | 'Thin';
export type MaterialPresetId = 'CYLview' | 'Houkmol';

export interface MaterialPreset {
  id: MaterialPresetId;
  ambient: number;
  diffuse: number;
  specular: number;
  shininess: number;
  outline: boolean;
  outline_size: number;
  quadrants: boolean;
  quadrant_size: number;
}

export const MATERIAL_PRESETS: Record<MaterialPresetId, MaterialPreset> = {
  CYLview: {
    id: 'CYLview',
    ambient: 0.52,
    diffuse: 1.65,
    specular: 0.9,
    shininess: 175,
    outline: false,
    outline_size: 0,
    quadrants: false,
    quadrant_size: 0,
  },
  Houkmol: {
    id: 'Houkmol',
    ambient: 0.7,
    diffuse: 0.95,
    specular: 0.18,
    shininess: 36,
    outline: false,
    outline_size: 0,
    quadrants: true,
    quadrant_size: 0.5,
  },
};

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
  autoRotate: boolean;
  autoRotateSpeed: number;
}

export interface AppSettings {
  version: 1;
  rendering: {
    pngExportScale: 1 | 2 | 4;
    defaultBackground: 'white' | 'black' | 'custom';
    customBackgroundHex: string;
    defaultMaterialPreset: MaterialPresetId | 'last-used';
    defaultProjection: ProjectionMode;
    defaultLighting: LightingMood;
    showFloorGridByDefault: boolean;
  };
  chemistry: {
    defaultHydrogenVisibility: HydrogenVisibility;
    distancePrecision: number;
    anglePrecision: number;
    bondPerceptionTolerance: number;
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
  };
}

type ShortcutActionId =
  | 'openFile'
  | 'exportPng'
  | 'resetView'
  | 'toggleHydrogen'
  | 'viewMode'
  | 'measureMode'
  | 'atomMode'
  | 'bondMode'
  | 'atomBondMode'
  | 'labelMode'
  | 'openSettings';

const DEFAULT_KEYBOARD_SHORTCUTS: Record<ShortcutActionId, string> = {
  openFile: 'Ctrl+O',
  exportPng: 'Ctrl+E',
  resetView: 'R',
  toggleHydrogen: 'H',
  viewMode: 'V',
  measureMode: 'M',
  atomMode: 'A',
  bondMode: 'B',
  atomBondMode: 'Z',
  labelMode: 'L',
  openSettings: 'Ctrl+,',
};

const SHORTCUT_ACTION_LABELS: Record<ShortcutActionId, string> = {
  openFile: 'Open File',
  exportPng: 'Export PNG',
  resetView: 'Reset View',
  toggleHydrogen: 'Toggle Hydrogen Mode',
  viewMode: 'View Mode',
  measureMode: 'Measure Mode',
  atomMode: 'Atom Selection',
  bondMode: 'Bond Selection',
  atomBondMode: 'Atom+Bond Selection',
  labelMode: 'Label Mode',
  openSettings: 'Settings',
};

export interface AppDataPaths {
  root: string;
  settings: string;
  session_tabs: string;
  recent_files: string;
  saved_info: string;
  pose_library: string;
  pose_previews: string;
}

export interface AtomMetadata {
  recordType?: string;
  serial?: number;
  atomName?: string;
  altLoc?: string;
  residueName?: string;
  chainId?: string;
  residueSequence?: number;
  insertionCode?: string;
  occupancy?: number;
  bFactor?: number;
  formalCharge?: string;
}

export interface MoleculeMetadata {
  sourceFormat?: string;
  title?: string;
  frameCount?: number;
  loadedFrameIndex?: number;
  energy?: number;
  energyUnit?: string;
  warnings: string[];
}

export interface MoleculeGroup {
  id: string;
  label: string;
  residueName?: string;
  chainId?: string;
  residueSequence?: number;
  insertionCode?: string;
  atomIndices: number[];
  centroid: LabelAnchor;
}

export interface MoleculeData {
  path: string;
  name: string;
  atoms: AtomData[];
  bonds: BondData[];
  groups: MoleculeGroup[];
  metadata: MoleculeMetadata;
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
    material_preset?: MaterialPresetId;
  };
  camera?: ViewOptions;
}

export interface RecentFileEntry {
  path: string;
  name: string;
}

export interface SessionTabRecord {
  id: string;
  path: string;
  displayName: string;
  lastOpenedAt: string;
}

export interface SessionTabsEnvelope {
  version: 1;
  activeTabId: string | null;
  tabs: SessionTabRecord[];
}

export interface MoleculeTab extends SessionTabRecord {
  molecule?: MoleculeData;
  presentationState?: PresentationState | null;
}

export interface PoseLibraryEntry {
  id: string;
  name: string;
  moleculePath: string;
  moleculeDisplayName: string;
  moleculeHash: string;
  pose: SavedPose;
  previewImagePath: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  notes: string;
  atomCount?: number | null;
  formula?: string | null;
  sourceFormat?: string | null;
}

interface PosePreviewJob {
  jobId: string;
  entryId: string;
  moleculePath: string;
  pose: SavedPose;
}

export interface BenchmarkConfig {
  enabled: boolean;
  outputPath?: string;
  sampleMs: number;
  targetFps: number;
  maxAtoms: number;
}

interface BenchmarkLoadMetrics {
  path: string;
  loadMs: number;
  atoms: number;
  bonds: number;
  name: string;
  startedAt: string;
}

export interface BenchmarkRenderMetrics {
  rebuildSceneMs: number;
  visibleAtoms: number;
  visibleBonds: number;
  totalAtoms: number;
  totalBonds: number;
  renderCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  sceneObjects: number;
  pickAtomMs: number | null;
  pickBondMs: number | null;
  pickTotalMs: number;
  pickHitType: 'atom' | 'bond' | 'none';
  pickAtomCandidates: number;
  pickBondCandidates: number;
  frameSampleMs: number;
  sampledFrames: number;
  averageFrameMs: number | null;
  p95FrameMs: number | null;
  minFps: number | null;
  averageFps: number | null;
  responsive: boolean;
  webglRenderer: string | null;
  webglVendor: string | null;
}

function perfLoggingEnabled(): boolean {
  try {
    return window.localStorage.getItem('cylformPerf') === '1';
  } catch {
    return false;
  }
}

function displayNameForPath(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function extensionForPath(path: string): string {
  const fileName = displayNameForPath(path);
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return '';
  return fileName.slice(dotIndex + 1).toLowerCase();
}

function isSupportedMoleculePath(path: string, extensions: string[]): boolean {
  const extension = extensionForPath(path);
  if (!extension) return false;
  return extensions.some((candidate) => candidate.toLowerCase() === extension);
}

function normalizeShortcutText(shortcut: string): string | null {
  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const modifiers = new Set<string>();
  let key: string | null = null;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (['ctrl', 'control'].includes(lower)) modifiers.add('Ctrl');
    else if (['cmd', 'command', 'meta'].includes(lower)) modifiers.add('Meta');
    else if (lower === 'alt' || lower === 'option') modifiers.add('Alt');
    else if (lower === 'shift') modifiers.add('Shift');
    else if (!key) key = part.length === 1 ? part.toUpperCase() : part;
    else return null;
  }

  if (!key) return null;
  return [...modifiers, key].join('+');
}

function effectiveKeyboardShortcuts(settings: AppSettings): Record<ShortcutActionId, string> {
  const shortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };
  for (const action of Object.keys(DEFAULT_KEYBOARD_SHORTCUTS) as ShortcutActionId[]) {
    const normalized = normalizeShortcutText(settings.interaction.keyboardShortcuts[action] ?? '');
    if (normalized) shortcuts[action] = normalized;
  }
  return shortcuts;
}

function shortcutMatchesEvent(shortcut: string, event: KeyboardEvent): boolean {
  const normalized = normalizeShortcutText(shortcut);
  if (!normalized) return false;
  const parts = normalized.split('+');
  const key = parts[parts.length - 1]?.toLowerCase();
  const wantsCtrl = parts.includes('Ctrl');
  const wantsMeta = parts.includes('Meta');
  const wantsAlt = parts.includes('Alt');
  const wantsShift = parts.includes('Shift');
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  const commandOrControlMatches = wantsMeta
    ? event.metaKey && event.ctrlKey === wantsCtrl
    : wantsCtrl
      ? event.ctrlKey || event.metaKey
      : !event.ctrlKey && !event.metaKey;

  return (
    key === eventKey &&
    commandOrControlMatches &&
    event.altKey === wantsAlt &&
    event.shiftKey === wantsShift
  );
}

function hasShortcutConflict(
  action: ShortcutActionId,
  shortcut: string,
  settings: AppSettings,
): boolean {
  const normalized = normalizeShortcutText(shortcut);
  if (!normalized) return true;
  const shortcuts = effectiveKeyboardShortcuts(settings);
  return (Object.keys(shortcuts) as ShortcutActionId[]).some((candidate) => (
    candidate !== action && normalizeShortcutText(shortcuts[candidate]) === normalized
  ));
}

function defaultAppSettings(): AppSettings {
  return {
    version: 1,
    rendering: {
      pngExportScale: 2,
      defaultBackground: 'white',
      customBackgroundHex: '#ffffff',
      defaultMaterialPreset: 'CYLview',
      defaultProjection: 'perspective',
      defaultLighting: 'publication',
      showFloorGridByDefault: false,
    },
    chemistry: {
      defaultHydrogenVisibility: 'shown',
      distancePrecision: 2,
      anglePrecision: 1,
      bondPerceptionTolerance: 1.3,
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
    },
  };
}

function clampPrecision(precision: number): number {
  return Math.min(4, Math.max(1, Math.round(precision)));
}

function formatDistance(value: number, precision: number): string {
  return `${value.toFixed(clampPrecision(precision))} A`;
}

function formatAngle(value: number, precision: number): string {
  return `${value.toFixed(clampPrecision(precision))} deg`;
}

function backdropToneFromSettings(settings: AppSettings): Pick<ViewOptions, 'backdropTone' | 'customBackdropHex'> {
  if (settings.rendering.defaultBackground === 'black') {
    return { backdropTone: 'black', customBackdropHex: settings.rendering.customBackgroundHex };
  }
  if (settings.rendering.defaultBackground === 'custom') {
    return { backdropTone: 'custom', customBackdropHex: settings.rendering.customBackgroundHex };
  }
  return { backdropTone: 'clean', customBackdropHex: settings.rendering.customBackgroundHex };
}

function createTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createPreviewJob(entry: PoseLibraryEntry): PosePreviewJob {
  return {
    jobId: `preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    entryId: entry.id,
    moleculePath: entry.moleculePath,
    pose: entry.pose,
  };
}

function PosePreviewRenderer({
  job,
  appSettings,
  onCaptured,
  onFailed,
}: {
  job: PosePreviewJob | null;
  appSettings: AppSettings;
  onCaptured: (job: PosePreviewJob, dataUrl: string) => void;
  onFailed: (job: PosePreviewJob, error: string) => void;
}) {
  const [moleculeData, setMoleculeData] = useState<MoleculeData | null>(null);
  const [presentationState, setPresentationState] = useState<PresentationState | null>(null);
  const [captureToken, setCaptureToken] = useState<string | null>(null);

  useEffect(() => {
    if (!job) {
      setMoleculeData(null);
      setPresentationState(null);
      setCaptureToken(null);
      return;
    }
    let cancelled = false;
    setMoleculeData(null);
    setPresentationState(null);
    setCaptureToken(null);

    const loadPreviewDocument = async () => {
      try {
        const [data, state] = await Promise.all([
          invoke<MoleculeData>('load_molecule', {
            path: job.moleculePath,
            frameIndex: 0,
            bondPerceptionTolerance: appSettings.chemistry.bondPerceptionTolerance,
          }),
          invoke<PresentationState | null>('load_presentation_state', { path: job.moleculePath }),
        ]);
        if (cancelled) return;
        setMoleculeData(data);
        setPresentationState(state);
        window.setTimeout(() => {
          if (!cancelled) setCaptureToken(job.jobId);
        }, 0);
      } catch (error) {
        if (cancelled) return;
        onFailed(job, error instanceof Error ? error.message : String(error));
      }
    };

    void loadPreviewDocument();

    return () => {
      cancelled = true;
    };
  }, [appSettings.chemistry.bondPerceptionTolerance, job, onFailed]);

  if (!job || !moleculeData) return null;

  const styles = presentationState?.styles;
  const handlePreviewCaptured = (token: string, dataUrl: string) => {
    if (token === job.jobId) onCaptured(job, dataUrl);
  };
  const handlePreviewError = (token: string, error: string) => {
    if (token === job.jobId) onFailed(job, error);
  };

  return (
    <div className="pose-preview-render-host" aria-hidden="true">
      <Suspense fallback={null}>
        <MoleculeCanvas
          moleculeData={moleculeData}
          hydrogenVisibility={styles?.hydrogen_visibility ?? 'shown'}
          hiddenAtomIndices={presentationState?.hidden_atoms ?? []}
          elementColorOverrides={styles?.element_color_overrides ?? {}}
          atomStyleOverrides={styles?.atom_style_overrides ?? {}}
          bondStyleOverrides={styles?.bond_style_overrides ?? {}}
          atomSizeScale={styles?.atom_size_scale ?? 1}
          materialPreset={styles?.material_preset ?? 'CYLview'}
          viewOptions={job.pose.viewOptions}
          distancePrecision={appSettings.chemistry.distancePrecision}
          anglePrecision={appSettings.chemistry.anglePrecision}
          pngExportScale={appSettings.rendering.pngExportScale}
          mouseMode={appSettings.interaction.mouseMode}
          invertScrollZoom={appSettings.interaction.invertScrollZoom}
          onViewOptionsChange={() => undefined}
          onMaterialPresetChange={() => undefined}
          selectedBond={null}
          selectedAngle={null}
          selectedDihedral={null}
          persistentLabels={presentationState?.annotations ?? []}
          selectionMode="view"
          onBondSelected={() => undefined}
          onAngleSelected={() => undefined}
          onDihedralSelected={() => undefined}
          onPersistentLabelCreate={() => undefined}
          onSelectionSummaryChange={() => undefined}
          isLoading={false}
          loadingLabel=""
          onOpenFile={() => undefined}
          onError={(message) => onFailed(job, message)}
          onToast={() => undefined}
          previewMode
          previewPose={job.pose}
          previewCaptureToken={captureToken}
          onPreviewCaptured={handlePreviewCaptured}
          onPreviewError={handlePreviewError}
        />
      </Suspense>
    </div>
  );
}

function WorkspaceTabs({
  tabs,
  activeTabId,
  recentFiles,
  isLoading,
  onOpenFile,
  onOpenRecentFile,
  onSelectTab,
  onCloseTab,
}: {
  tabs: MoleculeTab[];
  activeTabId: string | null;
  recentFiles: RecentFileEntry[];
  isLoading: boolean;
  onOpenFile: () => void;
  onOpenRecentFile: (path: string) => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}) {
  return (
    <div className="workspace-tabs" aria-label="Open molecules">
      <div className="workspace-tab-list" role="tablist">
        {tabs.length === 0 ? (
          <span className="workspace-tabs-empty">No molecules open</span>
        ) : (
          tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTabId}
              className={tab.id === activeTabId ? 'workspace-tab active' : 'workspace-tab'}
              title={tab.path}
              onClick={() => onSelectTab(tab.id)}
              disabled={isLoading}
            >
              <span className="workspace-tab-name">{tab.displayName}</span>
              <span
                role="button"
                tabIndex={0}
                className="workspace-tab-close"
                aria-label={`Close ${tab.displayName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }
                }}
              >
                ×
              </span>
            </button>
          ))
        )}
      </div>
      <div className="workspace-tab-actions">
        <button type="button" className="workspace-open-button" onClick={onOpenFile} disabled={isLoading}>
          Open
        </button>
        <select
          className="workspace-recent-select"
          value=""
          disabled={isLoading || recentFiles.length === 0}
          onChange={(event) => {
            const path = event.target.value;
            if (path) onOpenRecentFile(path);
          }}
          aria-label="Open recent molecule"
        >
          <option value="">Open Recent</option>
          {recentFiles.map((file) => (
            <option key={file.path} value={file.path}>
              {file.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function OpenRecentDialog({
  open,
  recentFiles,
  onOpenFile,
  onClose,
}: {
  open: boolean;
  recentFiles: RecentFileEntry[];
  onOpenFile: (path: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="menu-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Open recent molecule"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="menu-dialog">
        <div className="menu-dialog-header">
          <h3>Open Recent</h3>
          <button type="button" className="menu-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {recentFiles.length === 0 ? (
          <div className="menu-dialog-empty">
            <h4>No recent molecules yet</h4>
            <p>Opened molecule files will appear here.</p>
          </div>
        ) : (
          <div className="recent-dialog-list">
            {recentFiles.map((file) => (
              <button
                type="button"
                key={file.path}
                className="recent-dialog-item"
                onClick={() => onOpenFile(file.path)}
                title={file.path}
              >
                <span>{file.name}</span>
                <small>{file.path}</small>
              </button>
            ))}
          </div>
        )}
        <div className="menu-dialog-footer">
          <button type="button" className="panel-action" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsDialog({
  open,
  settings,
  appDataPaths,
  status,
  onChange,
  onReset,
  onOpenAppData,
  onClearRecentFiles,
  onClearSessionTabs,
  onClose,
}: {
  open: boolean;
  settings: AppSettings;
  appDataPaths: AppDataPaths | null;
  status: string | null;
  onChange: (settings: AppSettings) => void;
  onReset: () => void;
  onOpenAppData: () => void;
  onClearRecentFiles: () => void;
  onClearSessionTabs: () => void;
  onClose: () => void;
}) {
  const [shortcutWarning, setShortcutWarning] = useState<string | null>(null);
  if (!open) return null;

  const update = <Section extends keyof AppSettings>(
    section: Section,
    patch: Partial<AppSettings[Section]>,
  ) => {
    onChange({
      ...settings,
      [section]: {
        ...(settings[section] as object),
        ...patch,
      },
    } as AppSettings);
  };

  const shortcutRows = Object.keys(DEFAULT_KEYBOARD_SHORTCUTS) as ShortcutActionId[];
  const shortcuts = effectiveKeyboardShortcuts(settings);
  const updateShortcut = (action: ShortcutActionId, value: string) => {
    const normalized = normalizeShortcutText(value);
    if (!normalized) {
      setShortcutWarning('Use a shortcut like Ctrl+O, Shift+R, or M.');
      return;
    }
    if (hasShortcutConflict(action, normalized, settings)) {
      setShortcutWarning(`${normalized} is already assigned.`);
      return;
    }
    setShortcutWarning(null);
    update('interaction', {
      keyboardShortcuts: {
        ...settings.interaction.keyboardShortcuts,
        [action]: normalized,
      },
    });
  };
  const resetShortcuts = () => {
    setShortcutWarning(null);
    update('interaction', { keyboardShortcuts: {} });
  };

  return (
    <div
      className="menu-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="menu-dialog settings-dialog">
        <div className="menu-dialog-header">
          <h3>Settings</h3>
          <button type="button" className="menu-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="settings-body">
          <section className="settings-section">
            <h4>Rendering & Export</h4>
            <label className="settings-row">
              <span>PNG export scale</span>
              <select
                value={settings.rendering.pngExportScale}
                onChange={(event) => update('rendering', { pngExportScale: Number(event.target.value) as 1 | 2 | 4 })}
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </label>
            <label className="settings-row">
              <span>Default background</span>
              <select
                value={settings.rendering.defaultBackground}
                onChange={(event) => update('rendering', { defaultBackground: event.target.value as AppSettings['rendering']['defaultBackground'] })}
              >
                <option value="white">White</option>
                <option value="black">Black</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="settings-row">
              <span>Custom background</span>
              <input
                type="color"
                value={settings.rendering.customBackgroundHex}
                onChange={(event) => update('rendering', { customBackgroundHex: event.target.value })}
                disabled={settings.rendering.defaultBackground !== 'custom'}
              />
            </label>
            <label className="settings-row">
              <span>Default material</span>
              <select
                value={settings.rendering.defaultMaterialPreset}
                onChange={(event) => update('rendering', { defaultMaterialPreset: event.target.value as AppSettings['rendering']['defaultMaterialPreset'] })}
              >
                <option value="CYLview">CYLview</option>
                <option value="Houkmol">Houkmol</option>
                <option value="last-used">Last used</option>
              </select>
            </label>
            <label className="settings-row">
              <span>Default projection</span>
              <select
                value={settings.rendering.defaultProjection}
                onChange={(event) => update('rendering', { defaultProjection: event.target.value as ProjectionMode })}
              >
                <option value="perspective">Perspective</option>
                <option value="orthographic">Orthographic</option>
              </select>
            </label>
            <label className="settings-row">
              <span>Default lighting</span>
              <select
                value={settings.rendering.defaultLighting}
                onChange={(event) => update('rendering', { defaultLighting: event.target.value as LightingMood })}
              >
                <option value="publication">Publication</option>
                <option value="soft-studio">Soft studio</option>
                <option value="high-contrast">High contrast</option>
              </select>
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.rendering.showFloorGridByDefault}
                onChange={(event) => update('rendering', { showFloorGridByDefault: event.target.checked })}
              />
              Show floor/grid for new molecules
            </label>
          </section>

          <section className="settings-section">
            <h4>Chemistry & Measurements</h4>
            <label className="settings-row">
              <span>Default hydrogens</span>
              <select
                value={settings.chemistry.defaultHydrogenVisibility}
                onChange={(event) => update('chemistry', { defaultHydrogenVisibility: event.target.value as HydrogenVisibility })}
              >
                <option value="shown">Show all</option>
                <option value="hidden">Hide H</option>
                <option value="hide-c-h">Hide C-H</option>
              </select>
            </label>
            <label className="settings-row">
              <span>Distance decimals</span>
              <input
                type="number"
                min={1}
                max={4}
                value={settings.chemistry.distancePrecision}
                onChange={(event) => update('chemistry', { distancePrecision: Number(event.target.value) })}
              />
            </label>
            <label className="settings-row">
              <span>Angle decimals</span>
              <input
                type="number"
                min={1}
                max={4}
                value={settings.chemistry.anglePrecision}
                onChange={(event) => update('chemistry', { anglePrecision: Number(event.target.value) })}
              />
            </label>
            <label className="settings-row">
              <span>Bond tolerance</span>
              <select
                value={settings.chemistry.bondPerceptionTolerance}
                onChange={(event) => update('chemistry', { bondPerceptionTolerance: Number(event.target.value) })}
              >
                <option value={1.1}>1.1x</option>
                <option value={1.3}>1.3x</option>
                <option value={1.5}>1.5x</option>
              </select>
            </label>
            <p className="settings-note">Bond tolerance applies to newly loaded or reloaded molecules.</p>
          </section>

          <section className="settings-section">
            <h4>Interaction & Accessibility</h4>
            <label className="settings-row">
              <span>Mouse mode</span>
              <select
                value={settings.interaction.mouseMode}
                onChange={(event) => update('interaction', { mouseMode: event.target.value as AppSettings['interaction']['mouseMode'] })}
              >
                <option value="standard">Standard</option>
                <option value="one-button">One-button / trackpad</option>
              </select>
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.interaction.invertScrollZoom}
                onChange={(event) => update('interaction', { invertScrollZoom: event.target.checked })}
              />
              Invert scroll zoom
            </label>
            <div className="shortcut-settings-table">
              {shortcutRows.map((action) => (
                <div key={action}>
                  <span>{SHORTCUT_ACTION_LABELS[action]}</span>
                  <input
                    value={shortcuts[action]}
                    onChange={(event) => updateShortcut(action, event.target.value)}
                    aria-label={`${SHORTCUT_ACTION_LABELS[action]} shortcut`}
                  />
                </div>
              ))}
            </div>
            {shortcutWarning && <p className="settings-warning">{shortcutWarning}</p>}
            <button type="button" className="panel-action secondary compact" onClick={resetShortcuts}>
              Reset Shortcuts
            </button>
          </section>

          <section className="settings-section">
            <h4>Files & Session</h4>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.files.autosavePresentationState}
                onChange={(event) => update('files', { autosavePresentationState: event.target.checked })}
              />
              Auto-save presentation state
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.files.restorePreviousSessionOnStartup}
                onChange={(event) => update('files', { restorePreviousSessionOnStartup: event.target.checked })}
              />
              Restore previous session on startup
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.files.droppedFilesOpenInBackground}
                onChange={(event) => update('files', { droppedFilesOpenInBackground: event.target.checked })}
              />
              Dropped files open in background
            </label>
            <label className="settings-row">
              <span>Recent files limit</span>
              <input
                type="number"
                min={5}
                max={50}
                value={settings.files.recentFilesLimit}
                onChange={(event) => update('files', { recentFilesLimit: Number(event.target.value) })}
              />
            </label>
            <div className="settings-button-row">
              <button type="button" className="panel-action secondary compact" onClick={onClearRecentFiles}>
                Clear Recent Files
              </button>
              <button type="button" className="panel-action secondary compact" onClick={onClearSessionTabs}>
                Clear Session Tabs
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h4>App & Diagnostics</h4>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.app.devtoolsMenuEnabled}
                onChange={(event) => update('app', { devtoolsMenuEnabled: event.target.checked })}
              />
              DevTools menu action enabled
            </label>
            <label className="settings-check disabled">
              <input type="checkbox" checked={false} disabled />
              Auto-check for updates <span>Coming later</span>
            </label>
            <p className="settings-note">DevTools open from View - Open DevTools in development builds.</p>
            <div className="settings-button-row">
              <button type="button" className="panel-action secondary compact" onClick={onOpenAppData}>
                Open App Data Folder
              </button>
            </div>
            {appDataPaths && (
              <div className="settings-path-list">
                <div><span>Settings</span><code>{appDataPaths.settings}</code></div>
                <div><span>Session</span><code>{appDataPaths.session_tabs}</code></div>
                <div><span>SavedInfo</span><code>{appDataPaths.saved_info}</code></div>
                <div><span>Pose Library</span><code>{appDataPaths.pose_library}</code></div>
                <div><span>Previews</span><code>{appDataPaths.pose_previews}</code></div>
              </div>
            )}
          </section>
        </div>
        <div className="menu-dialog-footer">
          {status && <span className="settings-status">{status}</span>}
          <button type="button" className="panel-action secondary" onClick={onReset}>
            Reset Settings
          </button>
          <button type="button" className="panel-action" onClick={onClose}>
            Back to Workspace
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [moleculeData, setMoleculeData] = useState<MoleculeData | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string>('Preparing molecular workspace');
  const [error, setError] = useState<string | null>(null);
  const [hydrogenVisibility, setHydrogenVisibility] = useState<HydrogenVisibility>('shown');
  const [hiddenAtomIndices, setHiddenAtomIndices] = useState<number[]>([]);
  const [selectedBond, setSelectedBond] = useState<SelectedBondMeasurement | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<SelectedAngleMeasurement | null>(null);
  const [selectedDihedral, setSelectedDihedral] = useState<SelectedDihedralMeasurement | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('measure');
  const [selectionSummary, setSelectionSummary] = useState<SelectionSummary>({
    atomCount: 0,
    bondCount: 0,
    atomIndices: [],
    bondKeys: [],
  });
  const [persistentLabels, setPersistentLabels] = useState<PersistentLabel[]>([]);
  const nextLabelId = useRef(1);
  const [elementColorOverrides, setElementColorOverrides] = useState<ElementColorOverrides>({});
  const [atomStyleOverrides, setAtomStyleOverrides] = useState<Record<string, AtomStyleOverride>>({});
  const [bondStyleOverrides, setBondStyleOverrides] = useState<Record<string, BondStyleOverride>>({});
  const [atomSizeScale, setAtomSizeScale] = useState(1);
  const [materialPreset, setMaterialPreset] = useState<MaterialPresetId>('CYLview');
  const [savedPoses, setSavedPoses] = useState<SavedPose[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [moleculeTabs, setMoleculeTabs] = useState<MoleculeTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hasLoadedSessionTabs, setHasLoadedSessionTabs] = useState(false);
  const [poseLibrary, setPoseLibrary] = useState<PoseLibraryEntry[]>([]);
  const [previewQueue, setPreviewQueue] = useState<PosePreviewJob[]>([]);
  const [activePreviewJob, setActivePreviewJob] = useState<PosePreviewJob | null>(null);
  const [nearbyFiles, setNearbyFiles] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentDialogOpen, setRecentDialogOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [appDataPaths, setAppDataPaths] = useState<AppDataPaths | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const appSettingsRef = useRef<AppSettings>(defaultAppSettings());
  const nextPoseId = useRef(1);
  const saveStateTimer = useRef<number | null>(null);
  const skipNextSessionSave = useRef(false);
  const benchmarkConfig = useRef<BenchmarkConfig | null>(null);
  const benchmarkLoadMetrics = useRef<BenchmarkLoadMetrics | null>(null);
  const benchmarkFinished = useRef(false);
  const isApplyingPresentationState = useRef(false);
  const hasLoadedPresentationState = useRef(false);
  const hasStartedInitialLoad = useRef(false);
  const [viewOptions, setViewOptions] = useState<ViewOptions>({
    showFloor: true,
    showGrid: true,
    backdropTone: 'clean',
    customBackdropHex: '#ffffff',
    projection: 'perspective',
    lightingMood: 'publication',
    fogEnabled: true,
    fogIntensity: 0.45,
    autoRotate: false,
    autoRotateSpeed: 0.35,
  });

  useEffect(() => {
    appSettingsRef.current = appSettings;
  }, [appSettings]);

  const defaultPresentationState = useCallback(() => {
    const settings = appSettingsRef.current;
    const defaultMaterial = settings.rendering.defaultMaterialPreset === 'last-used'
      ? materialPreset
      : settings.rendering.defaultMaterialPreset;
    const showFloorGrid = settings.rendering.showFloorGridByDefault;
    const backdrop = backdropToneFromSettings(settings);

    return {
      annotations: [] as Annotation[],
      hidden_atoms: [] as number[],
      styles: {
        hydrogen_visibility: settings.chemistry.defaultHydrogenVisibility,
        element_color_overrides: {} as ElementColorOverrides,
        atom_size_scale: 1,
        atom_style_overrides: {} as Record<string, AtomStyleOverride>,
        bond_style_overrides: {} as Record<string, BondStyleOverride>,
        material_preset: defaultMaterial,
      },
      poses: [] as SavedPose[],
      camera: {
        showFloor: showFloorGrid,
        showGrid: showFloorGrid,
        backdropTone: backdrop.backdropTone,
        customBackdropHex: backdrop.customBackdropHex,
        projection: settings.rendering.defaultProjection,
        lightingMood: settings.rendering.defaultLighting,
        fogEnabled: true,
        fogIntensity: 0.45,
        autoRotate: false,
        autoRotateSpeed: 0.35,
      } as ViewOptions,
    };
  }, [materialPreset]);

  const refreshRecentFiles = useCallback(async () => {
    try {
      setRecentFiles(await invoke<RecentFileEntry[]>('get_recent_files', {
        limit: appSettingsRef.current.files.recentFilesLimit,
      }));
    } catch (err) {
      console.warn('Could not load recent files', err);
    }
  }, []);

  const refreshPoseLibrary = useCallback(async () => {
    try {
      const library = await invoke<{ version: 1; entries: PoseLibraryEntry[] }>('get_pose_library');
      setPoseLibrary(library.entries);
    } catch (err) {
      console.warn('Could not load pose library', err);
    }
  }, []);

  const refreshAppSettings = useCallback(async () => {
    try {
      const settings = await invoke<AppSettings>('get_app_settings');
      appSettingsRef.current = settings;
      setAppSettings(settings);
    } catch (err) {
      console.warn('Could not load app settings', err);
    }
  }, []);

  const refreshAppDataPaths = useCallback(async () => {
    try {
      setAppDataPaths(await invoke<AppDataPaths>('get_app_data_paths'));
    } catch (err) {
      console.warn('Could not load app data paths', err);
    }
  }, []);

  const saveAppSettings = useCallback(async (nextSettings: AppSettings) => {
    appSettingsRef.current = nextSettings;
    setAppSettings(nextSettings);
    setSettingsStatus('Saving...');
    try {
      const saved = await invoke<AppSettings>('save_app_settings', { settings: nextSettings });
      appSettingsRef.current = saved;
      setAppSettings(saved);
      await refreshRecentFiles();
      setSettingsStatus('Saved');
      window.setTimeout(() => setSettingsStatus(null), 1400);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSettingsStatus('Could not save settings');
      setError(message);
    }
  }, [refreshRecentFiles]);

  const resetAppSettings = useCallback(async () => {
    setSettingsStatus('Resetting...');
    try {
      const reset = await invoke<AppSettings>('reset_app_settings');
      appSettingsRef.current = reset;
      setAppSettings(reset);
      await refreshRecentFiles();
      setSettingsStatus('Defaults restored');
      window.setTimeout(() => setSettingsStatus(null), 1400);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSettingsStatus('Could not reset settings');
      setError(message);
    }
  }, [refreshRecentFiles]);

  const refreshNearbyFiles = useCallback(async (path: string) => {
    try {
      setNearbyFiles(await invoke<string[]>('list_supported_files_near', { path }));
    } catch {
      setNearbyFiles([]);
    }
  }, []);

  const buildPresentationState = useCallback((): PresentationState => ({
    version: 1,
    poses: savedPoses,
    annotations: persistentLabels,
    hidden_atoms: hiddenAtomIndices,
    styles: {
      hydrogen_visibility: hydrogenVisibility,
      element_color_overrides: elementColorOverrides,
      atom_size_scale: atomSizeScale,
      atom_style_overrides: atomStyleOverrides,
      bond_style_overrides: bondStyleOverrides,
      material_preset: materialPreset,
    },
    camera: viewOptions,
  }), [
    atomSizeScale,
    atomStyleOverrides,
    bondStyleOverrides,
    elementColorOverrides,
    hiddenAtomIndices,
    hydrogenVisibility,
    materialPreset,
    persistentLabels,
    savedPoses,
    viewOptions,
  ]);

  const applyPresentationState = useCallback((state: PresentationState | null, activatePersistence = true) => {
    isApplyingPresentationState.current = true;
    const defaults = defaultPresentationState();
    setPersistentLabels(state?.annotations ?? defaults.annotations);
    setHiddenAtomIndices(state?.hidden_atoms ?? defaults.hidden_atoms);
    setHydrogenVisibility(state?.styles?.hydrogen_visibility ?? defaults.styles.hydrogen_visibility);
    setElementColorOverrides(state?.styles?.element_color_overrides ?? defaults.styles.element_color_overrides);
    setAtomSizeScale(state?.styles?.atom_size_scale ?? defaults.styles.atom_size_scale);
    setAtomStyleOverrides(state?.styles?.atom_style_overrides ?? defaults.styles.atom_style_overrides);
    setBondStyleOverrides(state?.styles?.bond_style_overrides ?? defaults.styles.bond_style_overrides);
    setMaterialPreset(state?.styles?.material_preset ?? defaults.styles.material_preset);
    setSavedPoses(state?.poses ?? defaults.poses);
    setViewOptions(state?.camera ?? defaults.camera);
    nextLabelId.current = Math.max(
      1,
      ...(state?.annotations ?? []).map((label) => Number(label.id.replace(/^label-/, '')) + 1 || 1),
    );
    nextPoseId.current = Math.max(
      1,
      ...(state?.poses ?? []).map((pose) => Number(pose.id.replace(/^pose-/, '')) + 1 || 1),
    );
    window.setTimeout(() => {
      isApplyingPresentationState.current = false;
      hasLoadedPresentationState.current = activatePersistence;
    }, 0);
  }, [defaultPresentationState]);

  const handleFileLoaded = useCallback((data: MoleculeData) => {
    setMoleculeData(data);
    setCurrentPath(data.path);
    setError(null);
    setSelectedBond(null);
    setSelectedAngle(null);
    setSelectedDihedral(null);
    setSelectionSummary({ atomCount: 0, bondCount: 0, atomIndices: [], bondKeys: [] });
    hasLoadedPresentationState.current = false;
    applyPresentationState(null, false);
  }, [applyPresentationState]);

  const handleError = useCallback((err: string) => {
    setError(err);
  }, []);

  const snapshotActiveTab = useCallback((persist = false) => {
    if (!activeTabId) return null;
    const state = currentPath ? buildPresentationState() : null;
    setMoleculeTabs((current) => current.map((tab) => (
      tab.id === activeTabId
        ? {
            ...tab,
            molecule: moleculeData ?? tab.molecule,
            presentationState: state ?? tab.presentationState,
          }
        : tab
    )));
    if (
      persist
      && currentPath
      && state
      && hasLoadedPresentationState.current
      && appSettingsRef.current.files.autosavePresentationState
    ) {
      if (saveStateTimer.current) {
        window.clearTimeout(saveStateTimer.current);
        saveStateTimer.current = null;
      }
      void invoke('save_presentation_state', { path: currentPath, state }).catch((err) => {
        handleError(err instanceof Error ? err.message : String(err));
      });
    }
    return state;
  }, [activeTabId, buildPresentationState, currentPath, handleError, moleculeData]);

  const clearActiveMolecule = useCallback(() => {
    setMoleculeData(null);
    setCurrentPath(null);
    setError(null);
    setSelectedBond(null);
    setSelectedAngle(null);
    setSelectedDihedral(null);
    setSelectionSummary({ atomCount: 0, bondCount: 0, atomIndices: [], bondKeys: [] });
    setNearbyFiles([]);
    hasLoadedPresentationState.current = false;
    applyPresentationState(null, false);
  }, [applyPresentationState]);

  const addToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openAppDataFolder = useCallback(async () => {
    try {
      await invoke('open_app_data_folder');
      addToast('Opened the Cylform app data folder.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast('Could not open the app data folder.', 'error');
    }
  }, [addToast]);

  const clearRecentFiles = useCallback(async () => {
    try {
      await invoke('clear_recent_files');
      await refreshRecentFiles();
      addToast('Recent files cleared.', 'success');
    } catch (err) {
      handleError(err instanceof Error ? err.message : String(err));
    }
  }, [addToast, handleError, refreshRecentFiles]);

  const clearSessionTabs = useCallback(async () => {
    try {
      await invoke('clear_session_tabs');
      addToast('Saved session tabs cleared. Open tabs stay active until you close them.', 'success');
    } catch (err) {
      handleError(err instanceof Error ? err.message : String(err));
    }
  }, [addToast, handleError]);

  const queuePosePreview = useCallback((entry: PoseLibraryEntry) => {
    setPreviewQueue((current) => [...current, createPreviewJob(entry)]);
  }, []);

  const finishActivePreviewJob = useCallback(() => {
    setActivePreviewJob(null);
  }, []);

  const activateMoleculePath = useCallback(async (
    path: string,
    label?: string,
    tabRecord?: SessionTabRecord,
    recordRecent = true,
  ) => {
    snapshotActiveTab(true);
    setIsLoading(true);
    setLoadingLabel(label ?? 'Loading molecule');
    const perfStart = performance.now();

    try {
      const data = await invoke<MoleculeData>('load_molecule', {
        path,
        frameIndex: 0,
        bondPerceptionTolerance: appSettingsRef.current.chemistry.bondPerceptionTolerance,
      });
      const loadMs = performance.now() - perfStart;
      if (benchmarkConfig.current?.enabled) {
        benchmarkLoadMetrics.current = {
          path,
          loadMs,
          atoms: data.atoms.length,
          bonds: data.bonds.length,
          name: data.name,
          startedAt: new Date().toISOString(),
        };
      }
      if (perfLoggingEnabled()) {
        console.info(
          '[Cylform perf] load_molecule',
          {
            ms: Math.round(loadMs),
            atoms: data.atoms.length,
            bonds: data.bonds.length,
            file: data.name,
          },
        );
      }
      handleFileLoaded(data);
      if (benchmarkConfig.current?.enabled) {
        return true;
      }
      if (recordRecent) {
        await invoke('record_recent_file', {
          path,
          limit: appSettingsRef.current.files.recentFilesLimit,
        });
        await refreshRecentFiles();
      }
      await refreshNearbyFiles(path);
      let loadedState: PresentationState | null = null;
      try {
        const state = await invoke<PresentationState | null>('load_presentation_state', { path });
        loadedState = state;
        applyPresentationState(state, true);
      } catch (err) {
        handleError(err instanceof Error ? err.message : String(err));
        applyPresentationState(null, true);
      }
      const tab: MoleculeTab = {
        id: tabRecord?.id ?? createTabId(),
        path,
        displayName: tabRecord?.displayName ?? data.name ?? displayNameForPath(path),
        lastOpenedAt: new Date().toISOString(),
        molecule: data,
        presentationState: loadedState,
      };
      setActiveTabId(tab.id);
      setMoleculeTabs((current) => {
        const existingIndex = current.findIndex((candidate) => candidate.id === tab.id || candidate.path === path);
        if (existingIndex < 0) return [...current, tab];
        return current.map((candidate, index) => (
          index === existingIndex ? { ...candidate, ...tab, id: candidate.id } : candidate
        ));
      });
      return true;
    } catch (err) {
      if (benchmarkConfig.current?.enabled && !benchmarkFinished.current) {
        benchmarkFinished.current = true;
        const message = err instanceof Error ? err.message : String(err);
        void invoke('write_benchmark_result', {
          outputPath: benchmarkConfig.current.outputPath,
          result: {
            status: 'error',
            error: message,
            path,
            loadMs: Math.round(performance.now() - perfStart),
            timestamp: new Date().toISOString(),
            config: benchmarkConfig.current,
          },
        });
      }
      handleError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [
    applyPresentationState,
    handleError,
    handleFileLoaded,
    refreshNearbyFiles,
    refreshRecentFiles,
    snapshotActiveTab,
  ]);

  const focusMoleculeTab = useCallback(async (id: string) => {
    const tab = moleculeTabs.find((candidate) => candidate.id === id);
    if (!tab) return false;
    if (tab.id === activeTabId) return true;
    snapshotActiveTab(true);
    setActiveTabId(tab.id);
    if (tab.molecule) {
      handleFileLoaded(tab.molecule);
      await refreshNearbyFiles(tab.path);
      applyPresentationState(tab.presentationState ?? null, true);
      return true;
    }
    return activateMoleculePath(
      tab.path,
      'Restoring molecule tab',
      {
        id: tab.id,
        path: tab.path,
        displayName: tab.displayName,
        lastOpenedAt: tab.lastOpenedAt,
      },
      false,
    );
  }, [
    activateMoleculePath,
    activeTabId,
    applyPresentationState,
    handleFileLoaded,
    moleculeTabs,
    refreshNearbyFiles,
    snapshotActiveTab,
  ]);

  const loadMoleculePath = useCallback(async (path: string, label?: string) => {
    const existing = moleculeTabs.find((tab) => tab.path === path);
    if (existing) {
      return focusMoleculeTab(existing.id);
    }
    return activateMoleculePath(path, label);
  }, [activateMoleculePath, focusMoleculeTab, moleculeTabs]);

  const addDroppedMoleculeTabs = useCallback(async (paths: string[]) => {
    const uniquePaths = Array.from(new Set(paths)).filter(Boolean);
    if (uniquePaths.length === 0) return;

    let supportedExtensions: string[] = [];
    try {
      supportedExtensions = await invoke<string[]>('get_supported_read_extensions');
    } catch (err) {
      handleError(err instanceof Error ? err.message : String(err));
      return;
    }

    const supportedPaths = uniquePaths.filter((path) => isSupportedMoleculePath(path, supportedExtensions));
    const unsupportedPaths = uniquePaths.filter((path) => !isSupportedMoleculePath(path, supportedExtensions));
    if (unsupportedPaths.length === 1) {
      addToast(`Unsupported file type: ${displayNameForPath(unsupportedPaths[0])}`, 'error');
    } else if (unsupportedPaths.length > 1) {
      addToast(`${unsupportedPaths.length} unsupported files were ignored.`, 'error');
    }

    if (supportedPaths.length === 0) return;

    const knownPaths = new Set(moleculeTabs.map((tab) => tab.path));
    const openDropsInBackground = appSettingsRef.current.files.droppedFilesOpenInBackground;
    let activeWillExist = openDropsInBackground && Boolean(activeTabId);
    let acceptedCount = 0;
    let failedCount = 0;

    for (const path of supportedPaths) {
      if (knownPaths.has(path)) continue;

      if (!activeWillExist || !appSettingsRef.current.files.droppedFilesOpenInBackground) {
        const opened = await activateMoleculePath(path, 'Opening dropped molecule');
        if (opened) {
          knownPaths.add(path);
          acceptedCount += 1;
          activeWillExist = openDropsInBackground;
        } else {
          failedCount += 1;
        }
        continue;
      }

      try {
        const data = await invoke<MoleculeData>('load_molecule', {
          path,
          frameIndex: 0,
          bondPerceptionTolerance: appSettingsRef.current.chemistry.bondPerceptionTolerance,
        });
        let loadedState: PresentationState | null = null;
        try {
          loadedState = await invoke<PresentationState | null>('load_presentation_state', { path });
        } catch (err) {
          console.warn('Could not load presentation state for dropped molecule', err);
        }
        const tab: MoleculeTab = {
          id: createTabId(),
          path,
          displayName: data.name ?? displayNameForPath(path),
          lastOpenedAt: new Date().toISOString(),
          molecule: data,
          presentationState: loadedState,
        };
        setMoleculeTabs((current) => (
          current.some((candidate) => candidate.path === path) ? current : [...current, tab]
        ));
        await invoke('record_recent_file', {
          path,
          limit: appSettingsRef.current.files.recentFilesLimit,
        });
        knownPaths.add(path);
        acceptedCount += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failedCount += 1;
        handleError(message);
        addToast(`Could not open ${displayNameForPath(path)}.`, 'error');
      }
    }

    if (acceptedCount > 0) {
      await refreshRecentFiles();
      addToast(
        acceptedCount === 1 ? 'Added 1 molecule tab.' : `Added ${acceptedCount} molecule tabs.`,
        'success',
      );
    }
    if (failedCount > 1) {
      addToast(`${failedCount} dropped molecule files could not be opened.`, 'error');
    }
  }, [
    activateMoleculePath,
    activeTabId,
    addToast,
    handleError,
    moleculeTabs,
    refreshRecentFiles,
  ]);

  const handleOpenFile = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadingLabel('Waiting for file selection');

      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Molecular Files',
            extensions: await invoke<string[]>('get_supported_read_extensions'),
          },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!selected || typeof selected !== 'string') {
        return;
      }

      await loadMoleculePath(selected, 'Parsing atoms and perceiving bonds');
    } catch (err) {
      handleError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [handleError, loadMoleculePath]);

  const handleBenchmarkRender = useCallback((renderMetrics: BenchmarkRenderMetrics) => {
    const config = benchmarkConfig.current;
    const loadMetrics = benchmarkLoadMetrics.current;
    if (!config?.enabled || !loadMetrics || benchmarkFinished.current) return;

    benchmarkFinished.current = true;
    const result = {
      status: renderMetrics.responsive ? 'ok' : 'slow',
      timestamp: new Date().toISOString(),
      path: loadMetrics.path,
      name: loadMetrics.name,
      atoms: loadMetrics.atoms,
      bonds: loadMetrics.bonds,
      loadMs: Math.round(loadMetrics.loadMs),
      rebuildSceneMs: Math.round(renderMetrics.rebuildSceneMs),
      frameSampleMs: renderMetrics.frameSampleMs,
      sampledFrames: renderMetrics.sampledFrames,
      averageFrameMs: renderMetrics.averageFrameMs,
      p95FrameMs: renderMetrics.p95FrameMs,
      averageFps: renderMetrics.averageFps,
      minFps: renderMetrics.minFps,
      responsive: renderMetrics.responsive,
      webglRenderer: renderMetrics.webglRenderer,
      webglVendor: renderMetrics.webglVendor,
      visibleAtoms: renderMetrics.visibleAtoms,
      visibleBonds: renderMetrics.visibleBonds,
      totalAtoms: renderMetrics.totalAtoms,
      totalBonds: renderMetrics.totalBonds,
      renderCalls: renderMetrics.renderCalls,
      triangles: renderMetrics.triangles,
      geometries: renderMetrics.geometries,
      textures: renderMetrics.textures,
      sceneObjects: renderMetrics.sceneObjects,
      pickAtomMs: renderMetrics.pickAtomMs,
      pickBondMs: renderMetrics.pickBondMs,
      pickTotalMs: renderMetrics.pickTotalMs,
      pickHitType: renderMetrics.pickHitType,
      pickAtomCandidates: renderMetrics.pickAtomCandidates,
      pickBondCandidates: renderMetrics.pickBondCandidates,
      targetFps: config.targetFps,
      maxAtoms: config.maxAtoms,
      startedAt: loadMetrics.startedAt,
    };

    void invoke('write_benchmark_result', {
      outputPath: config.outputPath,
      result,
    }).catch((err) => {
      handleError(err instanceof Error ? err.message : String(err));
    });
  }, [handleError]);

  const handleResetView = useCallback(() => {
    window.dispatchEvent(new CustomEvent('reset-camera'));
  }, []);

  const handleExportPng = useCallback(() => {
    if (!moleculeData) {
      const message = 'Load a molecule before exporting a PNG.';
      handleError(message);
      addToast(message, 'info');
      return;
    }
    window.dispatchEvent(new CustomEvent('export-png'));
  }, [addToast, handleError, moleculeData]);

  const handleClearSelection = useCallback(() => {
    window.dispatchEvent(new CustomEvent('clear-selection'));
  }, []);

  const cycleHydrogenVisibility = useCallback(() => {
    setHydrogenVisibility((current) => {
      if (current === 'shown') return 'hidden';
      if (current === 'hidden') return 'hide-c-h';
      return 'shown';
    });
  }, []);

  const handleHideSelectedAtoms = useCallback(() => {
    setHiddenAtomIndices((current) => {
      const next = new Set(current);
      for (const atomIndex of selectionSummary.atomIndices) {
        next.add(atomIndex);
      }
      return Array.from(next).sort((a, b) => a - b);
    });
    handleClearSelection();
  }, [handleClearSelection, selectionSummary.atomIndices]);

  const handleHideGroups = useCallback((groupIds: string[]) => {
    const selectedGroups = moleculeData?.groups.filter((candidate) => groupIds.includes(candidate.id)) ?? [];
    if (selectedGroups.length === 0) return;

    setHiddenAtomIndices((current) => {
      const next = new Set(current);
      for (const group of selectedGroups) {
        for (const atomIndex of group.atomIndices) {
          next.add(atomIndex);
        }
      }
      return Array.from(next).sort((a, b) => a - b);
    });
    handleClearSelection();
  }, [handleClearSelection, moleculeData]);

  const handleHighlightGroups = useCallback((groupIds: string[]) => {
    const selectedGroups = moleculeData?.groups.filter((candidate) => groupIds.includes(candidate.id)) ?? [];
    if (selectedGroups.length === 0) return;

    setAtomStyleOverrides((current) => {
      const next = { ...current };
      for (const group of selectedGroups) {
        for (const atomIndex of group.atomIndices) {
          next[String(atomIndex)] = {
            ...(next[String(atomIndex)] ?? {}),
            color: '#10b981',
            sizeScale: 1.08,
          };
        }
      }
      return next;
    });
    handleClearSelection();
  }, [handleClearSelection, moleculeData]);

  const handleStyleSelectedAtoms = useCallback((color: string) => {
    setAtomStyleOverrides((current) => {
      const next = { ...current };
      for (const atomIndex of selectionSummary.atomIndices) {
        next[String(atomIndex)] = { ...(next[String(atomIndex)] ?? {}), color };
      }
      return next;
    });
  }, [selectionSummary.atomIndices]);

  const handleSizeSelectedAtoms = useCallback(() => {
    setAtomStyleOverrides((current) => {
      const next = { ...current };
      for (const atomIndex of selectionSummary.atomIndices) {
        next[String(atomIndex)] = { ...(next[String(atomIndex)] ?? {}), sizeScale: atomSizeScale };
      }
      return next;
    });
  }, [atomSizeScale, selectionSummary.atomIndices]);

  const handleResetSelectedAtomStyles = useCallback(() => {
    setAtomStyleOverrides((current) => {
      const next = { ...current };
      for (const atomIndex of selectionSummary.atomIndices) {
        delete next[String(atomIndex)];
      }
      return next;
    });
  }, [selectionSummary.atomIndices]);

  const handleRestyleSelectedBonds = useCallback((type: BondStyleType) => {
    setBondStyleOverrides((current) => {
      const next = { ...current };
      for (const bondKey of selectionSummary.bondKeys) {
        next[bondKey] = { type };
      }
      return next;
    });
  }, [selectionSummary.bondKeys]);

  const handleResetSelectedBondStyles = useCallback(() => {
    setBondStyleOverrides((current) => {
      const next = { ...current };
      for (const bondKey of selectionSummary.bondKeys) {
        delete next[bondKey];
      }
      return next;
    });
  }, [selectionSummary.bondKeys]);

  const handleShowAllAtoms = useCallback(() => {
    setHiddenAtomIndices([]);
    setHydrogenVisibility('shown');
    handleClearSelection();
  }, [handleClearSelection]);

  const handleCreatePersistentLabel = useCallback((label: Omit<Annotation, 'id' | 'visible'>) => {
    setPersistentLabels((current) => [
      ...current,
      {
        ...label,
        id: `label-${nextLabelId.current++}`,
        visible: true,
      },
    ]);
  }, []);

  const handleAddMeasurementLabel = useCallback(() => {
    const { distancePrecision, anglePrecision } = appSettingsRef.current.chemistry;
    if (selectedDihedral?.stage === 4 && selectedDihedral.anchor) {
      handleCreatePersistentLabel({
        type: 'Dihedral',
        text: `${selectedDihedral.atomElements.join('-')} ${formatAngle(selectedDihedral.dihedralDegrees, anglePrecision)}`,
        anchor: selectedDihedral.anchor,
        atoms: selectedDihedral.atomIndices,
        value: selectedDihedral.dihedralDegrees,
        source: { atomIndices: selectedDihedral.atomIndices },
      });
      return;
    }

    if (selectedAngle?.stage === 3 && selectedAngle.anchor) {
      handleCreatePersistentLabel({
        type: 'Angle',
        text: `${selectedAngle.atomElements.join('-')} ${formatAngle(selectedAngle.angleDegrees, anglePrecision)}`,
        anchor: selectedAngle.anchor,
        atoms: selectedAngle.atomIndices,
        value: selectedAngle.angleDegrees,
        source: { atomIndices: selectedAngle.atomIndices },
      });
      return;
    }

    if (selectedBond) {
      handleCreatePersistentLabel({
        type: 'Distance',
        text: `${selectedBond.atom1Element}-${selectedBond.atom2Element} ${formatDistance(selectedBond.distance, distancePrecision)}`,
        anchor: selectedBond.anchor,
        atoms: selectedBond.atomIndices,
        value: selectedBond.distance,
        source: {
          bond: selectedBond.atomIndices,
          atomIndices: selectedBond.atomIndices,
        },
      });
    }
  }, [handleCreatePersistentLabel, selectedAngle, selectedBond, selectedDihedral]);

  const handleTogglePersistentLabel = useCallback((id: string) => {
    setPersistentLabels((current) => current.map((label) => (
      label.id === id ? { ...label, visible: !label.visible } : label
    )));
  }, []);

  const handleDeletePersistentLabel = useCallback((id: string) => {
    setPersistentLabels((current) => current.filter((label) => label.id !== id));
  }, []);

  const handleRenamePersistentLabel = useCallback((id: string, text: string) => {
    setPersistentLabels((current) => current.map((label) => (
      label.id === id ? { ...label, text } : label
    )));
  }, []);

  const handleSavePose = useCallback(() => {
    window.dispatchEvent(new CustomEvent('capture-camera-pose'));
  }, []);

  const handlePoseCaptured = useCallback((event: Event) => {
    const detail = (event as CustomEvent<Omit<SavedPose, 'id' | 'name'>>).detail;
    if (!detail) return;
    setSavedPoses((current) => [
      ...current,
      {
        ...detail,
        id: `pose-${nextPoseId.current++}`,
        name: `Pose ${current.length + 1}`,
      },
    ]);
  }, []);

  const handleApplyPose = useCallback((pose: SavedPose) => {
    setViewOptions(pose.viewOptions);
    window.dispatchEvent(new CustomEvent('apply-camera-pose', { detail: pose }));
  }, []);

  const handleUpdatePose = useCallback((pose: SavedPose) => {
    window.dispatchEvent(new CustomEvent('capture-camera-pose', { detail: { updatePoseId: pose.id } }));
  }, []);

  const handlePoseUpdated = useCallback((event: Event) => {
    const detail = (event as CustomEvent<{ updatePoseId?: string } & Omit<SavedPose, 'id' | 'name'>>).detail;
    if (!detail?.updatePoseId) return;
    setSavedPoses((current) => current.map((pose) => (
      pose.id === detail.updatePoseId
        ? { ...pose, ...detail, id: pose.id, name: pose.name }
        : pose
    )));
  }, []);

  const handleRenamePose = useCallback((id: string, name: string) => {
    setSavedPoses((current) => current.map((pose) => (
      pose.id === id ? { ...pose, name } : pose
    )));
  }, []);

  const handleDeletePose = useCallback((id: string) => {
    setSavedPoses((current) => current.filter((pose) => pose.id !== id));
  }, []);

  const handleAddPoseToLibrary = useCallback(async (pose: SavedPose) => {
    if (!currentPath || !moleculeData) return;
    try {
      const entry = await invoke<PoseLibraryEntry>('save_pose_to_library', {
        name: pose.name,
        moleculePath: currentPath,
        moleculeDisplayName: moleculeData.name || displayNameForPath(currentPath),
        pose,
        tags: [],
        notes: '',
        atomCount: moleculeData.atoms.length,
        formula: null,
        sourceFormat: moleculeData.metadata.sourceFormat ?? null,
        previewImagePath: null,
      });
      setPoseLibrary((current) => [entry, ...current.filter((candidate) => candidate.id !== entry.id)]);
      queuePosePreview(entry);
      addToast(`Added ${pose.name} to Pose Library`, 'success');
    } catch (err) {
      handleError(err instanceof Error ? err.message : String(err));
    }
  }, [addToast, currentPath, handleError, moleculeData, queuePosePreview]);

  const handleOpenPoseLibraryEntry = useCallback(async (entry: PoseLibraryEntry) => {
    const loaded = await loadMoleculePath(entry.moleculePath, 'Opening library molecule');
    if (!loaded) return;
    window.setTimeout(() => handleApplyPose(entry.pose), 0);
  }, [handleApplyPose, loadMoleculePath]);

  const handleRenamePoseLibraryEntry = useCallback(async (id: string, name: string) => {
    setPoseLibrary((current) => current.map((entry) => (
      entry.id === id ? { ...entry, name } : entry
    )));
    try {
      const library = await invoke<{ version: 1; entries: PoseLibraryEntry[] }>('rename_pose_library_entry', { id, name });
      setPoseLibrary(library.entries);
    } catch (err) {
      handleError(err instanceof Error ? err.message : String(err));
      void refreshPoseLibrary();
    }
  }, [handleError, refreshPoseLibrary]);

  const handleDeletePoseLibraryEntry = useCallback(async (id: string) => {
    try {
      const library = await invoke<{ version: 1; entries: PoseLibraryEntry[] }>('delete_pose_library_entry', { id });
      setPoseLibrary(library.entries);
    } catch (err) {
      handleError(err instanceof Error ? err.message : String(err));
    }
  }, [handleError]);

  const handleGeneratePosePreview = useCallback((entry: PoseLibraryEntry) => {
    queuePosePreview(entry);
  }, [queuePosePreview]);

  const handlePosePreviewCaptured = useCallback(async (job: PosePreviewJob, dataUrl: string) => {
    try {
      const updatedEntry = await invoke<PoseLibraryEntry>('save_pose_library_preview', {
        id: job.entryId,
        dataUrl,
      });
      setPoseLibrary((current) => current.map((entry) => (
        entry.id === updatedEntry.id ? updatedEntry : entry
      )));
    } catch (err) {
      console.warn('Could not save pose preview', err);
      addToast('Saved the pose, but could not generate its preview yet.', 'info');
    } finally {
      finishActivePreviewJob();
    }
  }, [addToast, finishActivePreviewJob]);

  const handlePosePreviewFailed = useCallback((job: PosePreviewJob, error: string) => {
    console.warn('Could not generate pose preview', job.entryId, error);
    addToast('Saved the pose, but could not generate its preview yet.', 'info');
    finishActivePreviewJob();
  }, [addToast, finishActivePreviewJob]);

  const handleCloseTab = useCallback((id: string) => {
    snapshotActiveTab(true);
    const tabIndex = moleculeTabs.findIndex((tab) => tab.id === id);
    if (tabIndex < 0) return;
    const nextTabs = moleculeTabs.filter((tab) => tab.id !== id);
    setMoleculeTabs(nextTabs);
    if (activeTabId !== id) return;

    const nextActive = nextTabs[tabIndex] ?? nextTabs[tabIndex - 1] ?? null;
    if (nextActive) {
      void focusMoleculeTab(nextActive.id);
      return;
    }

    setActiveTabId(null);
    clearActiveMolecule();
  }, [activeTabId, clearActiveMolecule, focusMoleculeTab, moleculeTabs, snapshotActiveTab]);

  const handleCloseCurrentTab = useCallback(() => {
    if (!activeTabId) {
      addToast('No molecule tab is open.', 'info');
      return;
    }
    handleCloseTab(activeTabId);
  }, [activeTabId, addToast, handleCloseTab]);

  const handleClearSavedState = useCallback(async () => {
    if (!currentPath) return;
    try {
      await invoke('clear_presentation_state', { path: currentPath });
      applyPresentationState(null);
      handleClearSelection();
    } catch (err) {
      handleError(err instanceof Error ? err.message : String(err));
    }
  }, [applyPresentationState, currentPath, handleClearSelection, handleError]);

  const loadAdjacentFile = useCallback(async (direction: -1 | 1) => {
    if (!currentPath || nearbyFiles.length === 0) return;
    const currentIndex = nearbyFiles.findIndex((path) => path === currentPath);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= nearbyFiles.length) return;
    await loadMoleculePath(nearbyFiles[nextIndex], 'Opening nearby molecule');
  }, [currentPath, loadMoleculePath, nearbyFiles]);

  const handleOpenRecentFile = useCallback((path: string) => {
    setRecentDialogOpen(false);
    void loadMoleculePath(path, 'Opening recent molecule');
  }, [loadMoleculePath]);

  const hasSelection = Boolean(
    selectedBond
    || selectedAngle
    || selectedDihedral
    || selectionSummary.atomCount > 0
    || selectionSummary.bondCount > 0,
  );
  const hiddenAtomCount = hiddenAtomIndices.length;
  const hasSavedPresentationState = Boolean(
    persistentLabels.length ||
    hiddenAtomIndices.length ||
    hydrogenVisibility !== 'shown' ||
    Object.keys(elementColorOverrides).length ||
    atomSizeScale !== 1 ||
    Object.keys(atomStyleOverrides).length ||
    Object.keys(bondStyleOverrides).length ||
    savedPoses.length
  );

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.isContentEditable
        || target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || isLoading) return;

      const shortcuts = effectiveKeyboardShortcuts(appSettingsRef.current);

      if (shortcutMatchesEvent(shortcuts.openFile, event)) {
        event.preventDefault();
        void handleOpenFile();
        return;
      }

      if (shortcutMatchesEvent(shortcuts.exportPng, event)) {
        event.preventDefault();
        handleExportPng();
        return;
      }

      if (shortcutMatchesEvent(shortcuts.openSettings, event)) {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const key = event.key.toLowerCase();

      if (shortcutMatchesEvent(shortcuts.resetView, event)) {
        event.preventDefault();
        handleResetView();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.toggleHydrogen, event)) {
        event.preventDefault();
        cycleHydrogenVisibility();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.viewMode, event)) {
        event.preventDefault();
        setSelectionMode('view');
        handleClearSelection();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.measureMode, event)) {
        event.preventDefault();
        setSelectionMode('measure');
        handleClearSelection();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.atomMode, event)) {
        event.preventDefault();
        setSelectionMode('atom');
        handleClearSelection();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.bondMode, event)) {
        event.preventDefault();
        setSelectionMode('bond');
        handleClearSelection();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.atomBondMode, event)) {
        event.preventDefault();
        setSelectionMode('atom-bond');
        handleClearSelection();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.labelMode, event)) {
        event.preventDefault();
        setSelectionMode('label');
        handleClearSelection();
        return;
      }

      switch (key) {
        case 'escape':
          event.preventDefault();
          handleClearSelection();
          break;
        case '?':
          event.preventDefault();
          setShortcutsOpen(true);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleClearSelection,
    handleExportPng,
    handleOpenFile,
    handleResetView,
    isLoading,
    cycleHydrogenVisibility,
  ]);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const registerMenuListeners = async () => {
      const listeners = await Promise.all([
        listen('menu:open-file', () => {
          void handleOpenFile();
        }),
        listen('menu:open-recent', () => {
          void refreshRecentFiles();
          setRecentDialogOpen(true);
        }),
        listen('menu:close-current-tab', () => {
          handleCloseCurrentTab();
        }),
        listen('menu:export-png', () => {
          handleExportPng();
        }),
        listen('menu:open-settings', () => {
          setSettingsOpen(true);
        }),
        listen('menu:reset-view', () => {
          handleResetView();
        }),
        listen('menu:devtools-unavailable', () => {
          addToast('DevTools are available in development builds.', 'info');
        }),
        listen('menu:devtools-disabled', () => {
          addToast('DevTools are disabled in Settings.', 'info');
        }),
      ]);
      if (cancelled) {
        listeners.forEach((unlisten) => unlisten());
        return;
      }
      unlisteners.push(...listeners);
    };

    void registerMenuListeners().catch((err) => {
      console.warn('Could not register native menu listeners', err);
    });

    return () => {
      cancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [
    addToast,
    handleCloseCurrentTab,
    handleExportPng,
    handleOpenFile,
    handleResetView,
    refreshRecentFiles,
  ]);

  useEffect(() => {
    const onPoseCaptured = (event: Event) => {
      const detail = (event as CustomEvent<{ updatePoseId?: string }>).detail;
      if (detail?.updatePoseId) {
        handlePoseUpdated(event);
      } else {
        handlePoseCaptured(event);
      }
    };
    window.addEventListener('camera-pose-captured', onPoseCaptured);
    return () => window.removeEventListener('camera-pose-captured', onPoseCaptured);
  }, [handlePoseCaptured, handlePoseUpdated]);

  useEffect(() => {
    void refreshAppSettings();
    void refreshAppDataPaths();
    void refreshRecentFiles();
    void refreshPoseLibrary();
  }, [refreshAppDataPaths, refreshAppSettings, refreshPoseLibrary, refreshRecentFiles]);

  useEffect(() => {
    void refreshRecentFiles();
  }, [appSettings.files.recentFilesLimit, refreshRecentFiles]);

  useEffect(() => {
    if (activePreviewJob || previewQueue.length === 0) return;
    const [nextJob, ...remainingJobs] = previewQueue;
    setActivePreviewJob(nextJob);
    setPreviewQueue(remainingJobs);
  }, [activePreviewJob, previewQueue]);

  useEffect(() => {
    if (!hasLoadedSessionTabs) return;
    if (skipNextSessionSave.current) {
      skipNextSessionSave.current = false;
      return;
    }
    const session: SessionTabsEnvelope = {
      version: 1,
      activeTabId,
      tabs: moleculeTabs.map(({ id, path, displayName, lastOpenedAt }) => ({
        id,
        path,
        displayName,
        lastOpenedAt,
      })),
    };
    void invoke('save_session_tabs', { session }).catch((err) => {
      console.warn('Could not save session tabs', err);
    });
  }, [activeTabId, hasLoadedSessionTabs, moleculeTabs]);

  useEffect(() => {
    if (!currentPath || !hasLoadedPresentationState.current || isApplyingPresentationState.current) return;
    if (!appSettings.files.autosavePresentationState) return;
    if (saveStateTimer.current) {
      window.clearTimeout(saveStateTimer.current);
    }
    const state = buildPresentationState();
    if (activeTabId) {
      setMoleculeTabs((current) => current.map((tab) => (
        tab.id === activeTabId ? { ...tab, molecule: moleculeData ?? tab.molecule, presentationState: state } : tab
      )));
    }
    saveStateTimer.current = window.setTimeout(() => {
      void invoke('save_presentation_state', { path: currentPath, state }).catch((err) => {
        handleError(err instanceof Error ? err.message : String(err));
      });
    }, 350);
    return () => {
      if (saveStateTimer.current) {
        window.clearTimeout(saveStateTimer.current);
      }
    };
  }, [
    activeTabId,
    appSettings.files.autosavePresentationState,
    buildPresentationState,
    currentPath,
    handleError,
    moleculeData,
  ]);

  useEffect(() => {
    if (hasStartedInitialLoad.current) return;
    hasStartedInitialLoad.current = true;
    let cancelled = false;

    const loadInitialWorkspace = async () => {
      try {
        const settings = await invoke<AppSettings>('get_app_settings');
        appSettingsRef.current = settings;
        if (!cancelled) setAppSettings(settings);

        benchmarkConfig.current = await invoke<BenchmarkConfig>('get_benchmark_config');
        const startupPath = await invoke<string | null>('get_startup_file');
        if (startupPath) {
          setHasLoadedSessionTabs(true);
          await activateMoleculePath(startupPath, 'Opening startup molecule');
          return;
        }

        if (!settings.files.restorePreviousSessionOnStartup) {
          if (!cancelled) {
            skipNextSessionSave.current = true;
            setHasLoadedSessionTabs(true);
          }
          return;
        }

        const session = await invoke<SessionTabsEnvelope>('get_session_tabs');
        const restoredTabs = session.tabs.map((tab) => ({ ...tab }));
        if (!cancelled) {
          setMoleculeTabs(restoredTabs);
          setActiveTabId(session.activeTabId);
          setHasLoadedSessionTabs(true);
        }
        const active = restoredTabs.find((tab) => tab.id === session.activeTabId) ?? restoredTabs[0];
        if (active) {
          await activateMoleculePath(active.path, 'Restoring molecule tab', active, false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setHasLoadedSessionTabs(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadInitialWorkspace();

    return () => {
      cancelled = true;
    };
  }, [activateMoleculePath]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === 'enter' || payload.type === 'over') {
        setIsDraggingFiles(true);
        return;
      }
      if (payload.type === 'leave') {
        setIsDraggingFiles(false);
        return;
      }
      setIsDraggingFiles(false);
      void addDroppedMoleculeTabs(payload.paths);
    }).then((listener) => {
      if (cancelled) {
        listener();
        return;
      }
      unlisten = listener;
    }).catch((err) => {
      console.warn('Could not register drag/drop listener', err);
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addDroppedMoleculeTabs]);

  return (
    <div className="app">
      <Toolbar
        onOpenFile={handleOpenFile}
        onResetView={handleResetView}
        onExportPng={handleExportPng}
        onPreviousFile={() => void loadAdjacentFile(-1)}
        onNextFile={() => void loadAdjacentFile(1)}
        canPreviousFile={Boolean(currentPath && nearbyFiles.indexOf(currentPath) > 0)}
        canNextFile={Boolean(currentPath && nearbyFiles.indexOf(currentPath) >= 0 && nearbyFiles.indexOf(currentPath) < nearbyFiles.length - 1)}
        isLoading={isLoading}
        hydrogenVisibility={hydrogenVisibility}
        onCycleHydrogenVisibility={cycleHydrogenVisibility}
        selectionMode={selectionMode}
        onSelectionModeChange={(mode) => {
          setSelectionMode(mode);
          handleClearSelection();
        }}
        onClearSelection={handleClearSelection}
        hasSelection={hasSelection}
      />

      <WorkspaceTabs
        tabs={moleculeTabs}
        activeTabId={activeTabId}
        recentFiles={recentFiles}
        isLoading={isLoading}
        onOpenFile={handleOpenFile}
        onOpenRecentFile={handleOpenRecentFile}
        onSelectTab={(id) => void focusMoleculeTab(id)}
        onCloseTab={handleCloseTab}
      />

      <div className="main-content">
        <Suspense fallback={<LoadingSpinner />}>
          <MoleculeCanvas
            moleculeData={moleculeData}
            hydrogenVisibility={hydrogenVisibility}
            hiddenAtomIndices={hiddenAtomIndices}
            elementColorOverrides={elementColorOverrides}
            atomStyleOverrides={atomStyleOverrides}
            bondStyleOverrides={bondStyleOverrides}
            atomSizeScale={atomSizeScale}
            materialPreset={materialPreset}
            viewOptions={viewOptions}
            distancePrecision={appSettings.chemistry.distancePrecision}
            anglePrecision={appSettings.chemistry.anglePrecision}
            pngExportScale={appSettings.rendering.pngExportScale}
            mouseMode={appSettings.interaction.mouseMode}
            invertScrollZoom={appSettings.interaction.invertScrollZoom}
            onViewOptionsChange={setViewOptions}
            onMaterialPresetChange={setMaterialPreset}
            selectedBond={selectedBond}
            selectedAngle={selectedAngle}
            selectedDihedral={selectedDihedral}
            persistentLabels={persistentLabels}
            selectionMode={selectionMode}
            onBondSelected={setSelectedBond}
            onAngleSelected={setSelectedAngle}
            onDihedralSelected={setSelectedDihedral}
            onPersistentLabelCreate={handleCreatePersistentLabel}
            onSelectionSummaryChange={setSelectionSummary}
            isLoading={isLoading}
            loadingLabel={loadingLabel}
            onOpenFile={handleOpenFile}
            onError={handleError}
            onToast={addToast}
            benchmarkConfig={benchmarkConfig.current ?? undefined}
            onBenchmarkRender={handleBenchmarkRender}
          />
        </Suspense>

        <InfoPanel
          moleculeData={moleculeData}
          hydrogenVisibility={hydrogenVisibility}
          hiddenAtomIndices={hiddenAtomIndices}
          selectedBond={selectedBond}
          selectedAngle={selectedAngle}
          selectedDihedral={selectedDihedral}
          persistentLabels={persistentLabels}
          selectionMode={selectionMode}
          selectionSummary={selectionSummary}
          distancePrecision={appSettings.chemistry.distancePrecision}
          anglePrecision={appSettings.chemistry.anglePrecision}
          elementColorOverrides={elementColorOverrides}
          atomStyleOverrides={atomStyleOverrides}
          bondStyleOverrides={bondStyleOverrides}
          atomSizeScale={atomSizeScale}
          savedPoses={savedPoses}
          poseLibrary={poseLibrary}
          onElementColorChange={(element, color) => {
            setElementColorOverrides((current) => ({ ...current, [element]: color }));
          }}
          onResetElementColor={(element) => {
            setElementColorOverrides((current) => {
              const next = { ...current };
              delete next[element];
              return next;
            });
          }}
          onResetAllElementColors={() => setElementColorOverrides({})}
          onAtomSizeScaleChange={setAtomSizeScale}
          onHydrogenVisibilityChange={setHydrogenVisibility}
          onHideSelectedAtoms={handleHideSelectedAtoms}
          onHideGroups={handleHideGroups}
          onHighlightGroups={handleHighlightGroups}
          onShowAllAtoms={handleShowAllAtoms}
          onStyleSelectedAtoms={handleStyleSelectedAtoms}
          onSizeSelectedAtoms={handleSizeSelectedAtoms}
          onResetSelectedAtomStyles={handleResetSelectedAtomStyles}
          onRestyleSelectedBonds={handleRestyleSelectedBonds}
          onResetSelectedBondStyles={handleResetSelectedBondStyles}
          onSavePose={handleSavePose}
          onApplyPose={handleApplyPose}
          onUpdatePose={handleUpdatePose}
          onRenamePose={handleRenamePose}
          onDeletePose={handleDeletePose}
          onAddPoseToLibrary={handleAddPoseToLibrary}
          onOpenPoseLibraryEntry={(entry) => void handleOpenPoseLibraryEntry(entry)}
          onRenamePoseLibraryEntry={handleRenamePoseLibraryEntry}
          onDeletePoseLibraryEntry={handleDeletePoseLibraryEntry}
          onGeneratePosePreview={handleGeneratePosePreview}
          onClearSavedState={handleClearSavedState}
          onAddMeasurementLabel={handleAddMeasurementLabel}
          onTogglePersistentLabel={handleTogglePersistentLabel}
          onRenamePersistentLabel={handleRenamePersistentLabel}
          onDeletePersistentLabel={handleDeletePersistentLabel}
          onClearPersistentLabels={() => setPersistentLabels([])}
          error={error}
          hiddenAtomCount={hiddenAtomCount}
          hasSavedPresentationState={hasSavedPresentationState}
        />
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <ShortcutsDialog
        open={shortcutsOpen}
        shortcuts={effectiveKeyboardShortcuts(appSettings)}
        onClose={() => setShortcutsOpen(false)}
      />
      <OpenRecentDialog
        open={recentDialogOpen}
        recentFiles={recentFiles}
        onOpenFile={handleOpenRecentFile}
        onClose={() => setRecentDialogOpen(false)}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={appSettings}
        appDataPaths={appDataPaths}
        status={settingsStatus}
        onChange={(settings) => void saveAppSettings(settings)}
        onReset={() => void resetAppSettings()}
        onOpenAppData={() => void openAppDataFolder()}
        onClearRecentFiles={() => void clearRecentFiles()}
        onClearSessionTabs={() => void clearSessionTabs()}
        onClose={() => setSettingsOpen(false)}
      />
      <PosePreviewRenderer
        job={activePreviewJob}
        appSettings={appSettings}
        onCaptured={handlePosePreviewCaptured}
        onFailed={handlePosePreviewFailed}
      />
      {isDraggingFiles && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">Drop molecule files to add tabs</div>
        </div>
      )}
    </div>
  );
}

export default App

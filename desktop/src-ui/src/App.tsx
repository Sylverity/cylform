import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
// Styles are now imported via index.css design token system
import { Toolbar } from './components/Toolbar'
import { InfoPanel } from './components/InfoPanel'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { ToastContainer, type ToastMessage } from './components/Toast'
import { LoadingSpinner } from './components/LoadingSpinner'
import {
  createDefaultPresentationState,
  normalizePresentationState,
  normalizeSessionTabs,
  serializePresentationState,
} from './persistence'
import { hideGroupAtoms, revealGroupAtoms } from './groupVisibility'
import {
  effectiveKeyboardShortcuts,
  shortcutMatchesEvent,
  type ShortcutActionId,
} from './shortcuts'

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
export type MaterialPresetId = 'CYLviewLegacy' | 'CYLview' | 'Houkmol';

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
  labelFontScale: number;
  bondSizeScale: number;
  showLabelLinkLines: boolean;
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

export type { ShortcutActionId };

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
  interactionMs: number;
  targetFps: number;
  maxAtoms: number;
}

interface BenchmarkInteractionPhase {
  phase: 'orbit' | 'pan' | 'zoom';
  frameSampleMs: number;
  sampledFrames: number;
  averageFrameMs: number | null;
  p95FrameMs: number | null;
  minFps: number | null;
  averageFps: number | null;
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
  materialPreset: MaterialPresetId;
  renderQuality: {
    primitiveLoad: number;
    qualityT: number;
    pixelRatio: number;
    sphereWidthSegments: number;
    sphereHeightSegments: number;
    cylinderRadialSegments: number;
  };
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
  interactionFrameSampleMs: number;
  interactionAverageFrameMs: number | null;
  interactionP95FrameMs: number | null;
  interactionMinFps: number | null;
  interactionAverageFps: number | null;
  interactionPhases: BenchmarkInteractionPhase[];
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

function clampPrecision(precision: number): number {
  return Math.min(4, Math.max(1, Math.round(precision)));
}

function formatDistance(value: number, precision: number, useSymbolUnits = false): string {
  const unit = useSymbolUnits ? 'Å' : 'A';
  return `${value.toFixed(clampPrecision(precision))} ${unit}`;
}

function formatAngle(value: number, precision: number, useSymbolUnits = false): string {
  const unit = useSymbolUnits ? '°' : 'deg';
  return `${value.toFixed(clampPrecision(precision))}${unit}`;
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
          useSymbolUnits={appSettings.chemistry.useSymbolUnits}
          pngExportScale={appSettings.rendering.pngExportScale}
          onPngExportScaleChange={() => undefined}
          mouseMode={appSettings.interaction.mouseMode}
          invertScrollZoom={appSettings.interaction.invertScrollZoom}
          onViewOptionsChange={() => undefined}
          onMaterialPresetChange={() => undefined}
          onElementColorChange={() => undefined}
          onResetElementColor={() => undefined}
          onResetAllElementColors={() => undefined}
          onAtomSizeScaleChange={() => undefined}

          onStyleSelectedAtoms={() => undefined}
          onSizeSelectedAtoms={() => undefined}
          onResetSelectedAtomStyles={() => undefined}
          onRestyleSelectedBonds={() => undefined}
          onResetSelectedBondStyles={() => undefined}
          selectedBond={null}
          selectedAngle={null}
          selectedDihedral={null}
          persistentLabels={presentationState?.annotations ?? []}
          selectionMode="view"
          selectionSummary={{ atomCount: 0, bondCount: 0, atomIndices: [], bondKeys: [] }}
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
  isLoading,
  onSelectTab,
  onCloseTab,
}: {
  tabs: MoleculeTab[];
  activeTabId: string | null;
  isLoading: boolean;
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

  // Theme management
  useEffect(() => {
    const theme = appSettings.app.theme;
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [appSettings.app.theme]);
  const [viewOptions, setViewOptions] = useState<ViewOptions>({
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
  });

  useEffect(() => {
    appSettingsRef.current = appSettings;
  }, [appSettings]);

  const defaultPresentationState = useCallback(() => {
    return createDefaultPresentationState(appSettingsRef.current, materialPreset);
  }, [materialPreset]);
  const activeShortcuts = effectiveKeyboardShortcuts(appSettings);

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

  const buildPresentationState = useCallback((): PresentationState => serializePresentationState({
    poses: savedPoses,
    annotations: persistentLabels,
    hiddenAtomIndices,
    hydrogenVisibility,
    elementColorOverrides,
    atomSizeScale,
    atomStyleOverrides,
    bondStyleOverrides,
    materialPreset,
    viewOptions,
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
    const normalized = normalizePresentationState(state, appSettingsRef.current, materialPreset);
    setPersistentLabels(normalized.annotations);
    setHiddenAtomIndices(normalized.hidden_atoms);
    setHydrogenVisibility(normalized.styles.hydrogen_visibility ?? 'shown');
    setElementColorOverrides(normalized.styles.element_color_overrides ?? {});
    setAtomSizeScale(normalized.styles.atom_size_scale ?? 1);
    setAtomStyleOverrides(normalized.styles.atom_style_overrides ?? {});
    setBondStyleOverrides(normalized.styles.bond_style_overrides ?? {});
    setMaterialPreset(normalized.styles.material_preset ?? 'CYLview');
    setSavedPoses(normalized.poses);
    setViewOptions(normalized.camera ?? defaultPresentationState().camera);
    nextLabelId.current = Math.max(
      1,
      ...normalized.annotations.map((label) => Number(label.id.replace(/^label-/, '')) + 1 || 1),
    );
    nextPoseId.current = Math.max(
      1,
      ...normalized.poses.map((pose) => Number(pose.id.replace(/^pose-/, '')) + 1 || 1),
    );
    window.setTimeout(() => {
      isApplyingPresentationState.current = false;
      hasLoadedPresentationState.current = activatePersistence;
    }, 0);
  }, [defaultPresentationState, materialPreset]);

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
      interactionFrameSampleMs: renderMetrics.interactionFrameSampleMs,
      interactionAverageFrameMs: renderMetrics.interactionAverageFrameMs,
      interactionP95FrameMs: renderMetrics.interactionP95FrameMs,
      interactionAverageFps: renderMetrics.interactionAverageFps,
      interactionMinFps: renderMetrics.interactionMinFps,
      interactionPhases: renderMetrics.interactionPhases,
      responsive: renderMetrics.responsive,
      webglRenderer: renderMetrics.webglRenderer,
      webglVendor: renderMetrics.webglVendor,
      visibleAtoms: renderMetrics.visibleAtoms,
      visibleBonds: renderMetrics.visibleBonds,
      totalAtoms: renderMetrics.totalAtoms,
      totalBonds: renderMetrics.totalBonds,
      materialPreset: renderMetrics.materialPreset,
      renderQuality: renderMetrics.renderQuality,
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

  const handlePngExportScaleChange = useCallback((scale: 1 | 2 | 4) => {
    setAppSettings((current) => ({ ...current, rendering: { ...current.rendering, pngExportScale: scale } }));
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
      return hideGroupAtoms(current, selectedGroups, groupIds);
    });
    handleClearSelection();
  }, [handleClearSelection, moleculeData]);

  const handleHighlightGroups = useCallback((groupIds: string[]) => {
    const selectedGroups = moleculeData?.groups.filter((candidate) => groupIds.includes(candidate.id)) ?? [];
    if (selectedGroups.length === 0) return;

    setHiddenAtomIndices((current) => {
      return revealGroupAtoms(current, selectedGroups, groupIds);
    });
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
    const { distancePrecision, anglePrecision, useSymbolUnits } = appSettingsRef.current.chemistry;
    if (selectedDihedral?.stage === 4 && selectedDihedral.anchor) {
      handleCreatePersistentLabel({
        type: 'Dihedral',
        text: `${selectedDihedral.atomElements.join('-')} ${formatAngle(selectedDihedral.dihedralDegrees, anglePrecision, useSymbolUnits)}`,
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
        text: `${selectedAngle.atomElements.join('-')} ${formatAngle(selectedAngle.angleDegrees, anglePrecision, useSymbolUnits)}`,
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
        text: `${selectedBond.atom1Element}-${selectedBond.atom2Element} ${formatDistance(selectedBond.distance, distancePrecision, useSymbolUnits)}`,
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

    const closeTopmostDialog = () => {
      if (shortcutsOpen) {
        setShortcutsOpen(false);
        return true;
      }
      if (recentDialogOpen) {
        setRecentDialogOpen(false);
        return true;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      return false;
    };

    const focusAdjacentWorkspaceTab = (direction: -1 | 1) => {
      if (!activeTabId) return;
      const currentIndex = moleculeTabs.findIndex((tab) => tab.id === activeTabId);
      const nextTab = moleculeTabs[currentIndex + direction];
      if (nextTab) void focusMoleculeTab(nextTab.id);
    };

    const dispatchCameraPreset = (preset: 'front' | 'top' | 'right' | 'iso') => {
      window.dispatchEvent(new CustomEvent('camera-preset', { detail: preset }));
    };

    const runShortcutAction = (action: ShortcutActionId) => {
      switch (action) {
        case 'openFile':
          void handleOpenFile();
          break;
        case 'openRecent':
          setRecentDialogOpen(true);
          break;
        case 'closeTab':
          if (activeTabId) handleCloseTab(activeTabId);
          break;
        case 'exportPng':
          handleExportPng();
          break;
        case 'previousTab':
          focusAdjacentWorkspaceTab(-1);
          break;
        case 'nextTab':
          focusAdjacentWorkspaceTab(1);
          break;
        case 'previousFile':
          void loadAdjacentFile(-1);
          break;
        case 'nextFile':
          void loadAdjacentFile(1);
          break;
        case 'resetView':
          handleResetView();
          break;
        case 'clearSelection':
          handleClearSelection();
          break;
        case 'toggleHydrogen':
          cycleHydrogenVisibility();
          break;
        case 'viewMode':
        case 'measureMode':
        case 'atomMode':
        case 'bondMode':
        case 'atomBondMode':
        case 'labelMode': {
          const modes = {
            viewMode: 'view',
            measureMode: 'measure',
            atomMode: 'atom',
            bondMode: 'bond',
            atomBondMode: 'atom-bond',
            labelMode: 'label',
          } satisfies Partial<Record<ShortcutActionId, SelectionMode>>;
          setSelectionMode(modes[action]);
          handleClearSelection();
          break;
        }
        case 'openSettings':
          setSettingsOpen(true);
          break;
        case 'showShortcuts':
          setShortcutsOpen(true);
          break;
        case 'cameraFront':
          dispatchCameraPreset('front');
          break;
        case 'cameraTop':
          dispatchCameraPreset('top');
          break;
        case 'cameraRight':
          dispatchCameraPreset('right');
          break;
        case 'cameraIso':
          dispatchCameraPreset('iso');
          break;
        default:
          break;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const modalOpen = settingsOpen || shortcutsOpen || recentDialogOpen;
      if (modalOpen) {
        if (event.key === 'Escape' && closeTopmostDialog()) {
          event.preventDefault();
        }
        return;
      }

      if (isEditableTarget(event.target) || isLoading) return;

      const shortcuts = effectiveKeyboardShortcuts(appSettingsRef.current);
      for (const action of Object.keys(shortcuts) as ShortcutActionId[]) {
        if (shortcutMatchesEvent(shortcuts[action], event)) {
          event.preventDefault();
          runShortcutAction(action);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleClearSelection,
    handleExportPng,
    handleCloseTab,
    handleOpenFile,
    handleResetView,
    isLoading,
    cycleHydrogenVisibility,
    activeTabId,
    focusMoleculeTab,
    loadAdjacentFile,
    moleculeTabs,
    recentDialogOpen,
    settingsOpen,
    shortcutsOpen,
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
          addToast('This build was compiled without DevTools support.', 'info');
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

        const session = normalizeSessionTabs(await invoke<SessionTabsEnvelope>('get_session_tabs'));
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
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenRecentDialog={() => setRecentDialogOpen(true)}
        shortcuts={activeShortcuts}
      />

      <WorkspaceTabs
        tabs={moleculeTabs}
        activeTabId={activeTabId}
        isLoading={isLoading}
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
            useSymbolUnits={appSettings.chemistry.useSymbolUnits}
            pngExportScale={appSettings.rendering.pngExportScale}
            onPngExportScaleChange={handlePngExportScaleChange}
            mouseMode={appSettings.interaction.mouseMode}
            invertScrollZoom={appSettings.interaction.invertScrollZoom}
            onViewOptionsChange={setViewOptions}
            onMaterialPresetChange={setMaterialPreset}
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

            onStyleSelectedAtoms={handleStyleSelectedAtoms}
            onSizeSelectedAtoms={handleSizeSelectedAtoms}
            onResetSelectedAtomStyles={handleResetSelectedAtomStyles}
            onRestyleSelectedBonds={handleRestyleSelectedBonds}
            onResetSelectedBondStyles={handleResetSelectedBondStyles}
            selectedBond={selectedBond}
            selectedAngle={selectedAngle}
            selectedDihedral={selectedDihedral}
            persistentLabels={persistentLabels}
            selectionMode={selectionMode}
            selectionSummary={selectionSummary}
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
          useSymbolUnits={appSettings.chemistry.useSymbolUnits}
          savedPoses={savedPoses}
          poseLibrary={poseLibrary}
          onHideSelectedAtoms={handleHideSelectedAtoms}
          onHideGroups={handleHideGroups}
          onHighlightGroups={handleHighlightGroups}
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
        shortcuts={activeShortcuts}
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

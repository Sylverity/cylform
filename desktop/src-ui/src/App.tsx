import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core';
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

export type BackdropTone = 'clean' | 'warm' | 'slate';
export type ProjectionMode = 'perspective' | 'orthographic';
export type LightingMood = 'publication' | 'soft-studio' | 'high-contrast';

export interface ViewOptions {
  showFloor: boolean;
  showGrid: boolean;
  backdropTone: BackdropTone;
  projection: ProjectionMode;
  lightingMood: LightingMood;
  fogEnabled: boolean;
  fogIntensity: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
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
  onCaptured,
  onFailed,
}: {
  job: PosePreviewJob | null;
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
          invoke<MoleculeData>('load_molecule', { path: job.moleculePath, frameIndex: 0 }),
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
  }, [job, onFailed]);

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
  const nextPoseId = useRef(1);
  const saveStateTimer = useRef<number | null>(null);
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
    projection: 'perspective',
    lightingMood: 'publication',
    fogEnabled: true,
    fogIntensity: 0.45,
    autoRotate: false,
    autoRotateSpeed: 0.35,
  });

  const defaultPresentationState = useCallback(() => ({
    annotations: [] as Annotation[],
    hidden_atoms: [] as number[],
    styles: {
      hydrogen_visibility: 'shown' as HydrogenVisibility,
      element_color_overrides: {} as ElementColorOverrides,
      atom_size_scale: 1,
      atom_style_overrides: {} as Record<string, AtomStyleOverride>,
      bond_style_overrides: {} as Record<string, BondStyleOverride>,
      material_preset: 'CYLview' as MaterialPresetId,
    },
    poses: [] as SavedPose[],
    camera: undefined as ViewOptions | undefined,
  }), []);

  const refreshRecentFiles = useCallback(async () => {
    try {
      setRecentFiles(await invoke<RecentFileEntry[]>('get_recent_files'));
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
    setViewOptions(state?.camera ?? {
      showFloor: true,
      showGrid: true,
      backdropTone: 'clean',
      projection: 'perspective',
      lightingMood: 'publication',
      fogEnabled: true,
      fogIntensity: 0.45,
      autoRotate: false,
      autoRotateSpeed: 0.35,
    });
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
    if (persist && currentPath && state && hasLoadedPresentationState.current) {
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
      const data = await invoke<MoleculeData>('load_molecule', { path, frameIndex: 0 });
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
        await invoke('record_recent_file', { path });
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
    let activeWillExist = Boolean(activeTabId);
    let acceptedCount = 0;
    let failedCount = 0;

    for (const path of supportedPaths) {
      if (knownPaths.has(path)) continue;

      if (!activeWillExist) {
        const opened = await activateMoleculePath(path, 'Opening dropped molecule');
        if (opened) {
          knownPaths.add(path);
          acceptedCount += 1;
          activeWillExist = true;
        } else {
          failedCount += 1;
        }
        continue;
      }

      try {
        const data = await invoke<MoleculeData>('load_molecule', { path, frameIndex: 0 });
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
        await invoke('record_recent_file', { path });
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
    window.dispatchEvent(new CustomEvent('export-png'));
  }, []);

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
    if (selectedDihedral?.stage === 4 && selectedDihedral.anchor) {
      handleCreatePersistentLabel({
        type: 'Dihedral',
        text: `${selectedDihedral.atomElements.join('-')} ${selectedDihedral.dihedralDegrees.toFixed(2)} deg`,
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
        text: `${selectedAngle.atomElements.join('-')} ${selectedAngle.angleDegrees.toFixed(2)} deg`,
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
        text: `${selectedBond.atom1Element}-${selectedBond.atom2Element} ${selectedBond.distance.toFixed(2)} A`,
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

      const key = event.key.toLowerCase();
      const commandOrControl = event.ctrlKey || event.metaKey;

      if (commandOrControl && key === 'o') {
        event.preventDefault();
        void handleOpenFile();
        return;
      }

      if (commandOrControl && key === 'e') {
        event.preventDefault();
        handleExportPng();
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) return;

      switch (key) {
        case 'escape':
          event.preventDefault();
          handleClearSelection();
          break;
        case 'r':
          event.preventDefault();
          handleResetView();
          break;
        case 'h':
          event.preventDefault();
          cycleHydrogenVisibility();
          break;
        case 'v':
          event.preventDefault();
          setSelectionMode('view');
          handleClearSelection();
          break;
        case 'm':
          event.preventDefault();
          setSelectionMode('measure');
          handleClearSelection();
          break;
        case 'a':
          event.preventDefault();
          setSelectionMode('atom');
          handleClearSelection();
          break;
        case 'b':
          event.preventDefault();
          setSelectionMode('bond');
          handleClearSelection();
          break;
        case 'z':
          event.preventDefault();
          setSelectionMode('atom-bond');
          handleClearSelection();
          break;
        case 'l':
          event.preventDefault();
          setSelectionMode('label');
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
    void refreshRecentFiles();
    void refreshPoseLibrary();
  }, [refreshPoseLibrary, refreshRecentFiles]);

  useEffect(() => {
    if (activePreviewJob || previewQueue.length === 0) return;
    const [nextJob, ...remainingJobs] = previewQueue;
    setActivePreviewJob(nextJob);
    setPreviewQueue(remainingJobs);
  }, [activePreviewJob, previewQueue]);

  useEffect(() => {
    if (!hasLoadedSessionTabs) return;
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
        benchmarkConfig.current = await invoke<BenchmarkConfig>('get_benchmark_config');
        const startupPath = await invoke<string | null>('get_startup_file');
        if (startupPath) {
          setHasLoadedSessionTabs(true);
          await activateMoleculePath(startupPath, 'Opening startup molecule');
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
        onOpenRecentFile={(path) => void loadMoleculePath(path, 'Opening recent molecule')}
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
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PosePreviewRenderer
        job={activePreviewJob}
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

import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core';
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
export type LabelType = 'atom' | 'distance' | 'angle' | 'dihedral';
export type BondStyleType = 'full' | 'ts' | 'dative' | 'interaction' | 'thin';

export interface PersistentLabel {
  id: string;
  type: LabelType;
  text: string;
  anchor: LabelAnchor;
  visible: boolean;
  source?: {
    atomIndex?: number;
    atomIndices?: number[];
    bond?: [number, number];
  };
}

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
  labels: PersistentLabel[];
  hiddenAtomIndices: number[];
  hydrogenVisibility: HydrogenVisibility;
  elementColorOverrides: ElementColorOverrides;
  atomSizeScale: number;
  atomStyleOverrides: Record<string, AtomStyleOverride>;
  bondStyleOverrides: Record<string, BondStyleOverride>;
  viewOptions: ViewOptions;
  savedPoses: SavedPose[];
}

export interface RecentFileEntry {
  path: string;
  name: string;
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
  const [savedPoses, setSavedPoses] = useState<SavedPose[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [nearbyFiles, setNearbyFiles] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const nextPoseId = useRef(1);
  const saveStateTimer = useRef<number | null>(null);
  const benchmarkConfig = useRef<BenchmarkConfig | null>(null);
  const benchmarkLoadMetrics = useRef<BenchmarkLoadMetrics | null>(null);
  const benchmarkFinished = useRef(false);
  const isApplyingPresentationState = useRef(false);
  const hasLoadedPresentationState = useRef(false);
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
    labels: [] as PersistentLabel[],
    hiddenAtomIndices: [] as number[],
    hydrogenVisibility: 'shown' as HydrogenVisibility,
    elementColorOverrides: {} as ElementColorOverrides,
    atomSizeScale: 1,
    atomStyleOverrides: {} as Record<string, AtomStyleOverride>,
    bondStyleOverrides: {} as Record<string, BondStyleOverride>,
    savedPoses: [] as SavedPose[],
  }), []);

  const refreshRecentFiles = useCallback(async () => {
    try {
      setRecentFiles(await invoke<RecentFileEntry[]>('get_recent_files'));
    } catch (err) {
      console.warn('Could not load recent files', err);
    }
  }, []);

  const refreshNearbyFiles = useCallback(async (path: string) => {
    try {
      setNearbyFiles(await invoke<string[]>('list_supported_files_near', { path }));
    } catch {
      setNearbyFiles([]);
    }
  }, []);

  const applyPresentationState = useCallback((state: PresentationState | null, activatePersistence = true) => {
    isApplyingPresentationState.current = true;
    const defaults = defaultPresentationState();
    setPersistentLabels(state?.labels ?? defaults.labels);
    setHiddenAtomIndices(state?.hiddenAtomIndices ?? defaults.hiddenAtomIndices);
    setHydrogenVisibility(state?.hydrogenVisibility ?? defaults.hydrogenVisibility);
    setElementColorOverrides(state?.elementColorOverrides ?? defaults.elementColorOverrides);
    setAtomSizeScale(state?.atomSizeScale ?? defaults.atomSizeScale);
    setAtomStyleOverrides(state?.atomStyleOverrides ?? defaults.atomStyleOverrides);
    setBondStyleOverrides(state?.bondStyleOverrides ?? defaults.bondStyleOverrides);
    setSavedPoses(state?.savedPoses ?? defaults.savedPoses);
    setViewOptions(state?.viewOptions ?? {
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
      ...(state?.labels ?? []).map((label) => Number(label.id.replace(/^label-/, '')) + 1 || 1),
    );
    nextPoseId.current = Math.max(
      1,
      ...(state?.savedPoses ?? []).map((pose) => Number(pose.id.replace(/^pose-/, '')) + 1 || 1),
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

  const addToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadMoleculePath = useCallback(async (path: string, label?: string) => {
    setIsLoading(true);
    setLoadingLabel(label ?? 'Loading molecule');
    const perfStart = performance.now();

    try {
      const data = await invoke<MoleculeData>('load_molecule', { path });
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
        return;
      }
      await invoke('record_recent_file', { path });
      await refreshRecentFiles();
      await refreshNearbyFiles(path);
      try {
        const state = await invoke<PresentationState | null>('load_presentation_state', { path });
        applyPresentationState(state, true);
      } catch (err) {
        handleError(err instanceof Error ? err.message : String(err));
        applyPresentationState(null, true);
      }
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
    } finally {
      setIsLoading(false);
    }
  }, [applyPresentationState, handleError, handleFileLoaded, refreshNearbyFiles, refreshRecentFiles]);

  const handleOpenFile = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadingLabel('Waiting for file selection');

      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Molecular Files', extensions: ['xyz', 'pdb'] },
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

  const handleCreatePersistentLabel = useCallback((label: Omit<PersistentLabel, 'id' | 'visible'>) => {
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
        type: 'dihedral',
        text: `${selectedDihedral.atomElements.join('-')} ${selectedDihedral.dihedralDegrees.toFixed(2)} deg`,
        anchor: selectedDihedral.anchor,
        source: { atomIndices: selectedDihedral.atomIndices },
      });
      return;
    }

    if (selectedAngle?.stage === 3 && selectedAngle.anchor) {
      handleCreatePersistentLabel({
        type: 'angle',
        text: `${selectedAngle.atomElements.join('-')} ${selectedAngle.angleDegrees.toFixed(2)} deg`,
        anchor: selectedAngle.anchor,
        source: { atomIndices: selectedAngle.atomIndices },
      });
      return;
    }

    if (selectedBond) {
      handleCreatePersistentLabel({
        type: 'distance',
        text: `${selectedBond.atom1Element}-${selectedBond.atom2Element} ${selectedBond.distance.toFixed(2)} A`,
        anchor: selectedBond.anchor,
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
  }, [refreshRecentFiles]);

  useEffect(() => {
    if (!currentPath || !hasLoadedPresentationState.current || isApplyingPresentationState.current) return;
    if (saveStateTimer.current) {
      window.clearTimeout(saveStateTimer.current);
    }
    const state: PresentationState = {
      version: 1,
      labels: persistentLabels,
      hiddenAtomIndices,
      hydrogenVisibility,
      elementColorOverrides,
      atomSizeScale,
      atomStyleOverrides,
      bondStyleOverrides,
      viewOptions,
      savedPoses,
    };
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
    atomSizeScale,
    atomStyleOverrides,
    bondStyleOverrides,
    currentPath,
    elementColorOverrides,
    handleError,
    hiddenAtomIndices,
    hydrogenVisibility,
    persistentLabels,
    savedPoses,
    viewOptions,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadStartupFile = async () => {
      try {
        benchmarkConfig.current = await invoke<BenchmarkConfig>('get_benchmark_config');
        const startupPath = await invoke<string | null>('get_startup_file');
        if (!startupPath) return;

        setLoadingLabel('Opening startup molecule');
        await loadMoleculePath(startupPath, 'Opening startup molecule');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadStartupFile();

    return () => {
      cancelled = true;
    };
  }, [loadMoleculePath]);

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
            viewOptions={viewOptions}
            onViewOptionsChange={setViewOptions}
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
          recentFiles={recentFiles}
          currentPath={currentPath}
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
          onOpenRecentFile={(path) => void loadMoleculePath(path, 'Opening recent molecule')}
          onSavePose={handleSavePose}
          onApplyPose={handleApplyPose}
          onUpdatePose={handleUpdatePose}
          onRenamePose={handleRenamePose}
          onDeletePose={handleDeletePose}
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
    </div>
  );
}

export default App

import { lazy, Suspense, useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import './App.css'
import { Toolbar } from './components/Toolbar'
import { InfoPanel } from './components/InfoPanel'

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
}

export interface BondData {
  atom1: number;
  atom2: number;
  radius: number;
}

export interface SelectedBondMeasurement {
  atom1Element: string;
  atom2Element: string;
  distance: number;
}

export interface SelectedAngleMeasurement {
  atomElements: [string, string, string];
  angleDegrees: number;
  stage: 1 | 2 | 3;
}

export interface SelectedDihedralMeasurement {
  atomElements: [string, string, string, string];
  dihedralDegrees: number;
  stage: 1 | 2 | 3 | 4;
}

export type SelectionMode = 'view' | 'measure' | 'atom' | 'bond' | 'atom-bond' | 'label';

export interface SelectionSummary {
  atomCount: number;
  bondCount: number;
}

export type ElementColorOverrides = Record<string, string>;

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

export interface MoleculeData {
  name: string;
  atoms: AtomData[];
  bonds: BondData[];
}

function App() {
  const [moleculeData, setMoleculeData] = useState<MoleculeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string>('Preparing molecular workspace');
  const [error, setError] = useState<string | null>(null);
  const [showHydrogens, setShowHydrogens] = useState(true);
  const [selectedBond, setSelectedBond] = useState<SelectedBondMeasurement | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<SelectedAngleMeasurement | null>(null);
  const [selectedDihedral, setSelectedDihedral] = useState<SelectedDihedralMeasurement | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('measure');
  const [selectionSummary, setSelectionSummary] = useState<SelectionSummary>({
    atomCount: 0,
    bondCount: 0,
  });
  const [elementColorOverrides, setElementColorOverrides] = useState<ElementColorOverrides>({});
  const [atomSizeScale, setAtomSizeScale] = useState(1);
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

  const handleFileLoaded = useCallback((data: MoleculeData) => {
    setMoleculeData(data);
    setError(null);
    setSelectedBond(null);
    setSelectedAngle(null);
    setSelectedDihedral(null);
    setSelectionSummary({ atomCount: 0, bondCount: 0 });
    setElementColorOverrides({});
    setAtomSizeScale(1);
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
  }, []);

  const loadMoleculePath = useCallback(async (path: string, label?: string) => {
    setIsLoading(true);
    setLoadingLabel(label ?? 'Loading molecule');

    try {
      const data = await invoke<MoleculeData>('load_molecule', { path });
      handleFileLoaded(data);
    } catch (err) {
      handleError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [handleError, handleFileLoaded]);

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

  const handleResetView = useCallback(() => {
    window.dispatchEvent(new CustomEvent('reset-camera'));
  }, []);

  const handleExportPng = useCallback(() => {
    window.dispatchEvent(new CustomEvent('export-png'));
  }, []);

  const handleClearSelection = useCallback(() => {
    window.dispatchEvent(new CustomEvent('clear-selection'));
  }, []);

  const hasSelection = Boolean(
    selectedBond
    || selectedAngle
    || selectedDihedral
    || selectionSummary.atomCount > 0
    || selectionSummary.bondCount > 0,
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
          setShowHydrogens((current) => !current);
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
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadStartupFile = async () => {
      try {
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
        isLoading={isLoading}
        showHydrogens={showHydrogens}
        onToggleHydrogens={() => setShowHydrogens((current) => !current)}
        selectionMode={selectionMode}
        onSelectionModeChange={(mode) => {
          setSelectionMode(mode);
          handleClearSelection();
        }}
        onClearSelection={handleClearSelection}
        hasSelection={hasSelection}
      />

      <div className="main-content">
        <Suspense
          fallback={(
            <div className="canvas-shell-loading" role="status" aria-live="polite">
              <div className="loading-card">
                <div className="loading-orbit" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <p className="loading-kicker">CYLview-NG</p>
                <h3>Preparing molecular workspace</h3>
                <p>Loading the 3-D renderer and desktop workspace.</p>
              </div>
            </div>
          )}
        >
          <MoleculeCanvas
            moleculeData={moleculeData}
            showHydrogens={showHydrogens}
            elementColorOverrides={elementColorOverrides}
            atomSizeScale={atomSizeScale}
            viewOptions={viewOptions}
            onViewOptionsChange={setViewOptions}
            selectedBond={selectedBond}
            selectedAngle={selectedAngle}
            selectedDihedral={selectedDihedral}
            selectionMode={selectionMode}
            onBondSelected={setSelectedBond}
            onAngleSelected={setSelectedAngle}
            onDihedralSelected={setSelectedDihedral}
            onSelectionSummaryChange={setSelectionSummary}
            isLoading={isLoading}
            loadingLabel={loadingLabel}
            onOpenFile={handleOpenFile}
            onError={handleError}
          />
        </Suspense>

        <InfoPanel
          moleculeData={moleculeData}
          showHydrogens={showHydrogens}
          selectedBond={selectedBond}
          selectedAngle={selectedAngle}
          selectedDihedral={selectedDihedral}
          selectionMode={selectionMode}
          selectionSummary={selectionSummary}
          elementColorOverrides={elementColorOverrides}
          atomSizeScale={atomSizeScale}
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
          error={error}
        />
      </div>
    </div>
  );
}

export default App

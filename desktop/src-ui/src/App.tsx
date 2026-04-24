import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core';
import './App.css'
import { Toolbar } from './components/Toolbar'
import { InfoPanel } from './components/InfoPanel'
import { MoleculeCanvas } from './components/MoleculeCanvas'

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

export interface MoleculeData {
  name: string;
  atoms: AtomData[];
  bonds: BondData[];
}

function App() {
  const [moleculeData, setMoleculeData] = useState<MoleculeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  const handleFileLoaded = useCallback((data: MoleculeData) => {
    setMoleculeData(data);
    setError(null);
    setSelectedBond(null);
    setSelectedAngle(null);
    setSelectedDihedral(null);
    setSelectionSummary({ atomCount: 0, bondCount: 0 });
    setElementColorOverrides({});
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
  }, []);

  const handleResetView = useCallback(() => {
    window.dispatchEvent(new CustomEvent('reset-camera'));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadStartupFile = async () => {
      try {
        const startupPath = await invoke<string | null>('get_startup_file');
        if (!startupPath) return;

        setIsLoading(true);
        const data = await invoke<MoleculeData>('load_molecule', { path: startupPath });
        if (!cancelled) {
          setMoleculeData(data);
          setError(null);
        }
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
  }, []);

  return (
    <div className="app">
      <Toolbar
        onFileLoaded={handleFileLoaded}
        onError={handleError}
        onResetView={handleResetView}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
        showHydrogens={showHydrogens}
        onToggleHydrogens={() => setShowHydrogens((current) => !current)}
        selectionMode={selectionMode}
        onSelectionModeChange={(mode) => {
          setSelectionMode(mode);
          window.dispatchEvent(new CustomEvent('clear-selection'));
        }}
      />

      <div className="main-content">
        <MoleculeCanvas
          moleculeData={moleculeData}
          showHydrogens={showHydrogens}
          elementColorOverrides={elementColorOverrides}
          selectedBond={selectedBond}
          selectedAngle={selectedAngle}
          selectedDihedral={selectedDihedral}
          selectionMode={selectionMode}
          onBondSelected={setSelectedBond}
          onAngleSelected={setSelectedAngle}
          onDihedralSelected={setSelectedDihedral}
          onSelectionSummaryChange={setSelectionSummary}
          onError={handleError}
        />

        <InfoPanel
          moleculeData={moleculeData}
          showHydrogens={showHydrogens}
          selectedBond={selectedBond}
          selectedAngle={selectedAngle}
          selectedDihedral={selectedDihedral}
          selectionMode={selectionMode}
          selectionSummary={selectionSummary}
          elementColorOverrides={elementColorOverrides}
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
          error={error}
        />
      </div>
    </div>
  );
}

export default App

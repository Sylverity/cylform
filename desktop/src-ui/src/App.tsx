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

export interface MoleculeData {
  name: string;
  atoms: AtomData[];
  bonds: BondData[];
}

function App() {
  const [moleculeData, setMoleculeData] = useState<MoleculeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileLoaded = useCallback((data: MoleculeData) => {
    setMoleculeData(data);
    setError(null);
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
      />

      <div className="main-content">
        <MoleculeCanvas
          moleculeData={moleculeData}
          onError={handleError}
        />

        <InfoPanel
          moleculeData={moleculeData}
          error={error}
        />
      </div>
    </div>
  );
}

export default App

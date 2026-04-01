import { useState, useCallback, useEffect } from 'react'
import './App.css'
import { Toolbar } from './components/Toolbar'
import { InfoPanel } from './components/InfoPanel'
import { MoleculeCanvas } from './components/MoleculeCanvas'

// Type for molecule info from Rust backend
export interface MoleculeInfo {
  name: string;
  atomCount: number;
  bondCount: number;
}

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__;

function App() {
  const [moleculeInfo, setMoleculeInfo] = useState<MoleculeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileLoaded = useCallback((info: MoleculeInfo) => {
    setMoleculeInfo(info);
    setError(null);
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
    setMoleculeInfo(null);
  }, []);

  const handleResetView = useCallback(() => {
    // This will be passed to the canvas to reset camera
    const event = new CustomEvent('reset-camera');
    window.dispatchEvent(event);
  }, []);

  return (
    <div className="app">
      {!isTauri && (
        <div className="browser-banner">
          <strong>⚠️ Browser Mode:</strong> File loading unavailable. 
          Use the <strong>desktop app window</strong> titled "CYLview-NG" to load molecules.
        </div>
      )}
      <Toolbar 
        onFileLoaded={handleFileLoaded}
        onError={handleError}
        onResetView={handleResetView}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
      />
      
      <div className="main-content">
        <MoleculeCanvas 
          onMoleculeLoaded={handleFileLoaded}
          onError={handleError}
          isLoading={isLoading}
        />
        
        <InfoPanel 
          moleculeInfo={moleculeInfo}
          error={error}
        />
      </div>
    </div>
  );
}

export default App

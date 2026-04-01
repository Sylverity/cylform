import { useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/api/dialog';
import type { MoleculeInfo } from '../App';

interface ToolbarProps {
  onFileLoaded: (info: MoleculeInfo) => void;
  onError: (error: string) => void;
  onResetView: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function Toolbar({ 
  onFileLoaded, 
  onError, 
  onResetView,
  isLoading,
  setIsLoading 
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenFile = async () => {
    try {
      setIsLoading(true);
      onError('');
      
      // Open file dialog
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Molecular Files', extensions: ['xyz', 'pdb', 'sdf', 'mol'] },
          { name: 'XYZ Files', extensions: ['xyz'] },
          { name: 'PDB Files', extensions: ['pdb'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (selected && typeof selected === 'string') {
        // Load the file via Tauri command
        const info = await invoke<MoleculeInfo>('load_molecule', { path: selected });
        onFileLoaded(info);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-title">CYLview-NG</div>
      
      <div className="toolbar-section">
        <button 
          onClick={handleOpenFile}
          disabled={isLoading}
          className="primary"
        >
          {isLoading ? 'Loading...' : 'Open File'}
        </button>
        
        <button onClick={onResetView} disabled={isLoading}>
          Reset View
        </button>
      </div>
      
      <div className="toolbar-section">
        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner" />
            <span>Loading molecule...</span>
          </div>
        )}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".xyz,.pdb,.sdf,.mol"
        onChange={(e) => {
          // Handle file drop
          const file = e.target.files?.[0];
          if (file) {
            // Would use web APIs for drag-drop in a real implementation
            console.log('File selected:', file.name);
          }
        }}
      />
    </div>
  );
}

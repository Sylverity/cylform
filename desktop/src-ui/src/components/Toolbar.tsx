import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { MoleculeData } from '../App';

interface ToolbarProps {
  onFileLoaded: (data: MoleculeData) => void;
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
  setIsLoading,
}: ToolbarProps) {

  const handleOpenFile = async () => {
    try {
      setIsLoading(true);

      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Molecular Files', extensions: ['xyz', 'pdb', 'sdf', 'mol'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!selected || typeof selected !== 'string') {
        return; // user cancelled
      }

      const data = await invoke<MoleculeData>('load_molecule', { path: selected });
      onFileLoaded(data);

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
        <button onClick={handleOpenFile} disabled={isLoading} className="primary">
          {isLoading ? 'Loading…' : 'Open File'}
        </button>

        <button onClick={onResetView} disabled={isLoading}>
          Reset View
        </button>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('export-png'))}
          disabled={isLoading}
        >
          Export PNG
        </button>
      </div>

      <div className="toolbar-section">
        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner" />
            <span>Loading molecule…</span>
          </div>
        )}
      </div>
    </div>
  );
}

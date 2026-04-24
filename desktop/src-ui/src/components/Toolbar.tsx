import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { MoleculeData, SelectionMode } from '../App';

const SELECTION_MODES: Array<{ mode: SelectionMode; label: string; disabled?: boolean }> = [
  { mode: 'view', label: 'View' },
  { mode: 'measure', label: 'Measure' },
  { mode: 'atom', label: 'Atom' },
  { mode: 'bond', label: 'Bond' },
  { mode: 'atom-bond', label: 'Atom+Bond' },
  { mode: 'label', label: 'Label', disabled: true },
];

interface ToolbarProps {
  onFileLoaded: (data: MoleculeData) => void;
  onError: (error: string) => void;
  onResetView: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  showHydrogens: boolean;
  onToggleHydrogens: () => void;
  selectionMode: SelectionMode;
  onSelectionModeChange: (mode: SelectionMode) => void;
}

export function Toolbar({
  onFileLoaded,
  onError,
  onResetView,
  isLoading,
  setIsLoading,
  showHydrogens,
  onToggleHydrogens,
  selectionMode,
  onSelectionModeChange,
}: ToolbarProps) {

  const handleOpenFile = async () => {
    try {
      setIsLoading(true);

      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Molecular Files', extensions: ['xyz', 'pdb'] },
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
        <div className="mode-selector" aria-label="Selection mode">
          {SELECTION_MODES.map(({ mode, label, disabled }) => (
            <button
              key={mode}
              type="button"
              className={selectionMode === mode ? 'mode-active' : ''}
              disabled={isLoading || disabled}
              title={disabled ? 'Persistent labels are planned for a later v1 milestone.' : `${label} mode`}
              onClick={() => onSelectionModeChange(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

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

        <button
          onClick={onToggleHydrogens}
          disabled={isLoading}
          className={showHydrogens ? 'toggle-active' : ''}
        >
          {showHydrogens ? 'Hide H' : 'Show H'}
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

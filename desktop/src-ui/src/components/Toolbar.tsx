import type { SelectionMode } from '../App';

const SELECTION_MODES: Array<{ mode: SelectionMode; label: string; disabled?: boolean }> = [
  { mode: 'view', label: 'View' },
  { mode: 'measure', label: 'Measure' },
  { mode: 'atom', label: 'Atom' },
  { mode: 'bond', label: 'Bond' },
  { mode: 'atom-bond', label: 'Atom+Bond' },
  { mode: 'label', label: 'Label', disabled: true },
];

interface ToolbarProps {
  onOpenFile: () => void;
  onResetView: () => void;
  isLoading: boolean;
  showHydrogens: boolean;
  onToggleHydrogens: () => void;
  selectionMode: SelectionMode;
  onSelectionModeChange: (mode: SelectionMode) => void;
}

export function Toolbar({
  onOpenFile,
  onResetView,
  isLoading,
  showHydrogens,
  onToggleHydrogens,
  selectionMode,
  onSelectionModeChange,
}: ToolbarProps) {

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
        <button onClick={onOpenFile} disabled={isLoading} className="primary">
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

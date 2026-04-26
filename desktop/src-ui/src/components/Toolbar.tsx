import type { SelectionMode } from '../App';

const SELECTION_MODES: Array<{ mode: SelectionMode; label: string; shortcut?: string; disabled?: boolean }> = [
  { mode: 'view', label: 'View', shortcut: 'V' },
  { mode: 'measure', label: 'Measure', shortcut: 'M' },
  { mode: 'atom', label: 'Atom', shortcut: 'A' },
  { mode: 'bond', label: 'Bond', shortcut: 'B' },
  { mode: 'atom-bond', label: 'Atom+Bond', shortcut: 'Z' },
  { mode: 'label', label: 'Label', shortcut: 'L' },
];

interface ToolbarProps {
  onOpenFile: () => void;
  onResetView: () => void;
  onExportPng: () => void;
  isLoading: boolean;
  showHydrogens: boolean;
  onToggleHydrogens: () => void;
  selectionMode: SelectionMode;
  onSelectionModeChange: (mode: SelectionMode) => void;
  onClearSelection: () => void;
  hasSelection: boolean;
}

export function Toolbar({
  onOpenFile,
  onResetView,
  onExportPng,
  isLoading,
  showHydrogens,
  onToggleHydrogens,
  selectionMode,
  onSelectionModeChange,
  onClearSelection,
  hasSelection,
}: ToolbarProps) {

  return (
    <div className="toolbar">
      <div className="toolbar-title">CYLview-NG</div>

      <div className="toolbar-section mode-toolbar-section">
        <div className="mode-selector" aria-label="Selection mode">
          {SELECTION_MODES.map(({ mode, label, shortcut, disabled }) => (
            <button
              key={mode}
              type="button"
              className={selectionMode === mode ? 'mode-active' : ''}
              disabled={isLoading || disabled}
              title={`${label} mode${shortcut ? ` (${shortcut})` : ''}`}
              onClick={() => onSelectionModeChange(mode)}
            >
              <span>{label}</span>
              {shortcut && <kbd>{shortcut}</kbd>}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-section action-toolbar-section">
        <button onClick={onOpenFile} disabled={isLoading} className="primary">
          <span>{isLoading ? 'Loading...' : 'Open File'}</span>
          <kbd>Ctrl O</kbd>
        </button>

        <button onClick={onResetView} disabled={isLoading}>
          <span>Reset View</span>
          <kbd>R</kbd>
        </button>

        <button
          onClick={onExportPng}
          disabled={isLoading}
        >
          <span>Export PNG</span>
          <kbd>Ctrl E</kbd>
        </button>

        <button
          onClick={onClearSelection}
          disabled={isLoading || !hasSelection}
        >
          <span>Clear Selection</span>
          <kbd>Esc</kbd>
        </button>

        <button
          onClick={onToggleHydrogens}
          disabled={isLoading}
          className={showHydrogens ? 'toggle-active' : ''}
        >
          <span>{showHydrogens ? 'Hide H' : 'Show H'}</span>
          <kbd>H</kbd>
        </button>
      </div>

      <div className="toolbar-section status-toolbar-section">
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

import type { HydrogenVisibility, SelectionMode } from '../App';

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
  onPreviousFile: () => void;
  onNextFile: () => void;
  canPreviousFile: boolean;
  canNextFile: boolean;
  isLoading: boolean;
  hydrogenVisibility: HydrogenVisibility;
  onCycleHydrogenVisibility: () => void;
  selectionMode: SelectionMode;
  onSelectionModeChange: (mode: SelectionMode) => void;
  onClearSelection: () => void;
  hasSelection: boolean;
}

function hydrogenButtonLabel(mode: HydrogenVisibility): string {
  if (mode === 'shown') return 'Hide H';
  if (mode === 'hidden') return 'Hide C-H';
  return 'Show H';
}

export function Toolbar({
  onOpenFile,
  onResetView,
  onExportPng,
  onPreviousFile,
  onNextFile,
  canPreviousFile,
  canNextFile,
  isLoading,
  hydrogenVisibility,
  onCycleHydrogenVisibility,
  selectionMode,
  onSelectionModeChange,
  onClearSelection,
  hasSelection,
}: ToolbarProps) {

  return (
    <div className="toolbar">
      <div className="toolbar-title">Cylform</div>

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
          onClick={onPreviousFile}
          disabled={isLoading || !canPreviousFile}
          title="Open previous supported file in this folder"
        >
          <span>Previous</span>
        </button>

        <button
          onClick={onNextFile}
          disabled={isLoading || !canNextFile}
          title="Open next supported file in this folder"
        >
          <span>Next</span>
        </button>

        <button
          onClick={onClearSelection}
          disabled={isLoading || !hasSelection}
        >
          <span>Clear Selection</span>
          <kbd>Esc</kbd>
        </button>

        <button
          onClick={onCycleHydrogenVisibility}
          disabled={isLoading}
          className={hydrogenVisibility !== 'shown' ? 'toggle-active' : ''}
          title="Cycle hydrogen visibility: shown, hidden, hide C-H hydrogens"
        >
          <span>{hydrogenButtonLabel(hydrogenVisibility)}</span>
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

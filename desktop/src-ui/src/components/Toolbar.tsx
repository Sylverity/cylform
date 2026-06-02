import type { HydrogenVisibility, SelectionMode } from '../App';
import appIconUrl from '../../../src-tauri/icons/32x32.png';

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
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenRecentDialog: () => void;
}

function hydrogenButtonLabel(mode: HydrogenVisibility): string {
  if (mode === 'shown') return 'Hide H';
  if (mode === 'hidden') return 'Hide C-H';
  return 'Show H';
}

/* Simple SVG icons as inline components */
function IconRefresh({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function IconSave({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function IconChevronLeft({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconClock({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconMenu({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
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
  onOpenSettings,
  onOpenShortcuts,
  onOpenRecentDialog,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      {/* Logo */}
      <div className="toolbar-section" style={{ borderLeft: 'none', paddingLeft: 0 }}>
        <div className="toolbar-title">
          <img className="toolbar-title-mark" src={appIconUrl} alt="" aria-hidden="true" />
          <span>Cylform</span>
        </div>
      </div>

      {/* Mode selector */}
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

      {/* Actions */}
      <div className="toolbar-section action-toolbar-section">
        <button onClick={onOpenFile} disabled={isLoading} className="primary">
          <span>Open File</span>
          <kbd>Ctrl O</kbd>
        </button>

        <button
          onClick={onOpenRecentDialog}
          disabled={isLoading}
          className="icon-only"
          title="Open recent molecule"
          aria-label="Open recent molecule"
        >
          <IconClock />
        </button>

        <button
          onClick={onResetView}
          disabled={isLoading}
          className="icon-only"
          title="Reset view (R)"
          aria-label="Reset view"
        >
          <IconRefresh />
        </button>

        <button
          onClick={onExportPng}
          disabled={isLoading}
          className="icon-only"
          title="Export PNG (Ctrl+E)"
          aria-label="Export PNG"
        >
          <IconSave />
        </button>

        <button
          onClick={onPreviousFile}
          disabled={isLoading || !canPreviousFile}
          className="icon-only"
          title="Previous file in folder"
          aria-label="Previous file"
        >
          <IconChevronLeft />
        </button>

        <button
          onClick={onNextFile}
          disabled={isLoading || !canNextFile}
          className="icon-only"
          title="Next file in folder"
          aria-label="Next file"
        >
          <IconChevronRight />
        </button>

        <button
          onClick={onClearSelection}
          disabled={isLoading || !hasSelection}
          className="icon-only"
          title="Clear selection (Esc)"
          aria-label="Clear selection"
        >
          <IconX />
        </button>

        <button
          onClick={onCycleHydrogenVisibility}
          disabled={isLoading}
          className={hydrogenVisibility !== 'shown' ? 'toggle-active' : ''}
          title="Cycle hydrogen visibility (H)"
        >
          <span>{hydrogenButtonLabel(hydrogenVisibility)}</span>
          <kbd>H</kbd>
        </button>
      </div>

      {/* Menu + Status */}
      <div className="toolbar-section status-toolbar-section">
        <button
          onClick={onOpenShortcuts}
          disabled={isLoading}
          className="icon-only"
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <kbd style={{ minWidth: 'auto', padding: '1px 4px' }}>?</kbd>
        </button>

        <button
          onClick={onOpenSettings}
          disabled={isLoading}
          className="icon-only"
          title="Settings (Ctrl+,)"
          aria-label="Settings"
        >
          <IconMenu />
        </button>

        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner" />
            <span>Loading…</span>
          </div>
        )}
      </div>
    </div>
  );
}

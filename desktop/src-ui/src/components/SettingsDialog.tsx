import { useState, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type {
  AppSettings,
  AppDataPaths,
  HydrogenVisibility,
  LightingMood,
  ProjectionMode,
} from '../types';
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  SHORTCUT_ACTION_LABELS,
  SHORTCUT_DEFINITIONS,
  effectiveKeyboardShortcuts,
  hasShortcutConflict,
  shortcutDisplayText,
  shortcutFromKeyboardEvent,
  type ShortcutActionId,
} from '../shortcuts';

function preventMaterialPresetShortcutOverlap(event: ReactKeyboardEvent<HTMLSelectElement>) {
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    event.stopPropagation();
  }
}

type SettingsCategory =
  | 'rendering'
  | 'chemistry'
  | 'interaction'
  | 'files'
  | 'app'
  | 'shortcuts';

const CATEGORIES: Array<{ id: SettingsCategory; label: string; icon: string }> = [
  { id: 'rendering', label: 'Rendering', icon: '🎨' },
  { id: 'chemistry', label: 'Chemistry', icon: '⚗️' },
  { id: 'interaction', label: 'Interaction', icon: '🖱️' },
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'app', label: 'App', icon: '⚙️' },
  { id: 'shortcuts', label: 'Shortcuts', icon: '⌨️' },
];

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings;
  appDataPaths: AppDataPaths | null;
  status: string | null;
  onChange: (settings: AppSettings) => void;
  onReset: () => void;
  onOpenAppData: () => void;
  onClearRecentFiles: () => void;
  onClearSessionTabs: () => void;
  onClose: () => void;
}

export function SettingsDialog({
  open,
  settings,
  appDataPaths,
  status,
  onChange,
  onReset,
  onOpenAppData,
  onClearRecentFiles,
  onClearSessionTabs,
  onClose,
}: SettingsDialogProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('rendering');
  const [shortcutWarning, setShortcutWarning] = useState<string | null>(null);

  const shortcuts = useMemo(() => effectiveKeyboardShortcuts(settings), [settings]);
  const shortcutRows = useMemo(() => SHORTCUT_DEFINITIONS.map((definition) => definition.id), []);

  if (!open) return null;

  const update = <Section extends keyof AppSettings>(
    section: Section,
    patch: Partial<AppSettings[Section]>,
  ) => {
    onChange({
      ...settings,
      [section]: {
        ...(settings[section] as object),
        ...patch,
      },
    } as AppSettings);
  };

  const setShortcut = (action: ShortcutActionId, normalized: string) => {
    if (!normalized) {
      setShortcutWarning('Press a shortcut like Ctrl+O, Shift+R, or M.');
      return;
    }
    if (hasShortcutConflict(action, normalized, settings)) {
      setShortcutWarning(`${shortcutDisplayText(normalized)} is already assigned.`);
      return;
    }
    setShortcutWarning(null);
    update('interaction', {
      keyboardShortcuts: {
        ...settings.interaction.keyboardShortcuts,
        [action]: normalized,
      },
    });
  };

  const captureShortcut = (action: ShortcutActionId, event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Backspace' || event.key === 'Delete') {
      const next = { ...settings.interaction.keyboardShortcuts };
      delete next[action];
      setShortcutWarning(null);
      update('interaction', { keyboardShortcuts: next });
      return;
    }
    const normalized = shortcutFromKeyboardEvent(event.nativeEvent);
    if (normalized) setShortcut(action, normalized);
  };

  const resetShortcuts = () => {
    setShortcutWarning(null);
    update('interaction', { keyboardShortcuts: {} });
  };

  const resetShortcut = (action: ShortcutActionId) => {
    const next = { ...settings.interaction.keyboardShortcuts };
    delete next[action];
    setShortcutWarning(null);
    update('interaction', { keyboardShortcuts: next });
  };

  return (
    <div
      className="menu-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="menu-dialog settings-dialog">
        <div className="menu-dialog-header">
          <h3>Settings</h3>
          <button type="button" className="menu-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="settings-dialog-body">
          {/* Sidebar */}
          <nav className="settings-sidebar" aria-label="Settings categories">
            {CATEGORIES.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                className={activeCategory === id ? 'settings-nav-item active' : 'settings-nav-item'}
                onClick={() => setActiveCategory(id)}
              >
                <span aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="settings-content">
            {/* Rendering */}
            {activeCategory === 'rendering' && (
            <section className="settings-section">
              <h4>Rendering & Export</h4>
              <label className="settings-row">
                <span>PNG export scale</span>
                <select
                  value={settings.rendering.pngExportScale}
                  onChange={(event) => update('rendering', { pngExportScale: Number(event.target.value) as 1 | 2 | 4 })}
                >
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Default background</span>
                <select
                  value={settings.rendering.defaultBackground}
                  onChange={(event) => update('rendering', { defaultBackground: event.target.value as AppSettings['rendering']['defaultBackground'] })}
                >
                  <option value="white">White</option>
                  <option value="black">Black</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Custom background</span>
                <input
                  type="color"
                  value={settings.rendering.customBackgroundHex}
                  onChange={(event) => update('rendering', { customBackgroundHex: event.target.value })}
                  disabled={settings.rendering.defaultBackground !== 'custom'}
                />
              </label>
              <label className="settings-row">
                <span>Default render style</span>
                <select
                  value={settings.rendering.defaultRenderProfile}
                  onKeyDown={preventMaterialPresetShortcutOverlap}
                  onChange={(event) => {
                    update('rendering', { defaultRenderProfile: event.target.value as AppSettings['rendering']['defaultRenderProfile'] });
                    event.currentTarget.blur();
                  }}
                >
                  <option value="cylview">CYLview</option>
                  <option value="ball-stick">Ball and stick</option>
                  <option value="houkmol">Houkmol</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Default projection</span>
                <select
                  value={settings.rendering.defaultProjection}
                  onChange={(event) => update('rendering', { defaultProjection: event.target.value as ProjectionMode })}
                >
                  <option value="perspective">Perspective</option>
                  <option value="orthographic">Orthographic</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Default lighting</span>
                <select
                  value={settings.rendering.defaultLighting}
                  onChange={(event) => update('rendering', { defaultLighting: event.target.value as LightingMood })}
                >
                  <option value="publication">Publication</option>
                  <option value="soft-studio">Soft studio</option>
                  <option value="high-contrast">High contrast</option>
                </select>
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.rendering.showFloorGridByDefault}
                  onChange={(event) => update('rendering', { showFloorGridByDefault: event.target.checked })}
                />
                Show floor/grid for new molecules
              </label>
            </section>
            )}

            {/* Chemistry */}
            {activeCategory === 'chemistry' && (
            <section className="settings-section">
              <h4>Chemistry & Measurements</h4>
              <label className="settings-row">
                <span>Default hydrogens</span>
                <select
                  value={settings.chemistry.defaultHydrogenVisibility}
                  onChange={(event) => update('chemistry', { defaultHydrogenVisibility: event.target.value as HydrogenVisibility })}
                >
                  <option value="shown">Show all</option>
                  <option value="hidden">Hide H</option>
                  <option value="hide-c-h">Hide C-H</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Distance decimals</span>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={settings.chemistry.distancePrecision}
                  onChange={(event) => update('chemistry', { distancePrecision: Number(event.target.value) })}
                />
              </label>
              <label className="settings-row">
                <span>Angle decimals</span>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={settings.chemistry.anglePrecision}
                  onChange={(event) => update('chemistry', { anglePrecision: Number(event.target.value) })}
                />
              </label>
              <label className="settings-row">
                <span>Bond tolerance</span>
                <select
                  value={settings.chemistry.bondPerceptionTolerance}
                  onChange={(event) => update('chemistry', { bondPerceptionTolerance: Number(event.target.value) })}
                >
                  <option value={1.1}>1.1x</option>
                  <option value={1.3}>1.3x</option>
                  <option value={1.5}>1.5x</option>
                </select>
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.chemistry.useSymbolUnits}
                  onChange={(event) => update('chemistry', { useSymbolUnits: event.target.checked })}
                />
                Use symbol units (Å, °)
              </label>
              <p className="settings-note">Bond tolerance applies to newly loaded or reloaded molecules.</p>
            </section>
            )}

            {/* Interaction */}
            {activeCategory === 'interaction' && (
            <section className="settings-section">
              <h4>Interaction & Accessibility</h4>
              <label className="settings-row">
                <span>Mouse mode</span>
                <select
                  value={settings.interaction.mouseMode}
                  onChange={(event) => update('interaction', { mouseMode: event.target.value as AppSettings['interaction']['mouseMode'] })}
                >
                  <option value="standard">Standard</option>
                  <option value="one-button">One-button / trackpad</option>
                </select>
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.interaction.invertScrollZoom}
                  onChange={(event) => update('interaction', { invertScrollZoom: event.target.checked })}
                />
                Invert scroll zoom
              </label>
            </section>
            )}

            {/* Files */}
            {activeCategory === 'files' && (
            <section className="settings-section">
              <h4>Files & Session</h4>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.files.autosavePresentationState}
                  onChange={(event) => update('files', { autosavePresentationState: event.target.checked })}
                />
                Auto-save presentation state
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.files.restorePreviousSessionOnStartup}
                  onChange={(event) => update('files', { restorePreviousSessionOnStartup: event.target.checked })}
                />
                Restore previous session on startup
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.files.droppedFilesOpenInBackground}
                  onChange={(event) => update('files', { droppedFilesOpenInBackground: event.target.checked })}
                />
                Dropped files open in background
              </label>
              <label className="settings-row">
                <span>Recent files limit</span>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={settings.files.recentFilesLimit}
                  onChange={(event) => update('files', { recentFilesLimit: Number(event.target.value) })}
                />
              </label>
              <div className="settings-button-row">
                <button type="button" className="panel-action secondary compact" onClick={onClearRecentFiles}>
                  Clear Recent Files
                </button>
                <button type="button" className="panel-action secondary compact" onClick={onClearSessionTabs}>
                  Clear Session Tabs
                </button>
              </div>
            </section>
            )}

            {/* App */}
            {activeCategory === 'app' && (
            <section className="settings-section">
              <h4>App & Diagnostics</h4>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.app.devtoolsMenuEnabled}
                  onChange={(event) => update('app', { devtoolsMenuEnabled: event.target.checked })}
                />
                DevTools menu action enabled
              </label>
              <label className="settings-row">
                <span>Theme</span>
                <select
                  value={settings.app.theme}
                  onChange={(event) => update('app', { theme: event.target.value as AppSettings['app']['theme'] })}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="auto">Auto</option>
                </select>
              </label>
              <label className="settings-check disabled">
                <input type="checkbox" checked={false} disabled />
                Auto-check for updates <span>Coming later</span>
              </label>
              <p className="settings-note">DevTools open from View → Open DevTools when this setting is enabled.</p>
              <div className="settings-button-row">
                <button type="button" className="panel-action secondary compact" onClick={onOpenAppData}>
                  Open App Data Folder
                </button>
              </div>
              {appDataPaths && (
                <div className="settings-path-list">
                  <div><span>Settings</span><code>{appDataPaths.settings}</code></div>
                  <div><span>Session</span><code>{appDataPaths.session_tabs}</code></div>
                  <div><span>SavedInfo</span><code>{appDataPaths.saved_info}</code></div>
                  <div><span>Pose Library</span><code>{appDataPaths.pose_library}</code></div>
                  <div><span>Previews</span><code>{appDataPaths.pose_previews}</code></div>
                </div>
              )}
            </section>
            )}

            {/* Shortcuts */}
            {activeCategory === 'shortcuts' && (
            <section className="settings-section">
              <h4>Keyboard Shortcuts</h4>
              <div className="shortcut-settings-table">
                {shortcutRows.map((action) => (
                  <div key={action}>
                    <span>{SHORTCUT_ACTION_LABELS[action]}</span>
                    <input
                      value={shortcutDisplayText(shortcuts[action])}
                      readOnly
                      onKeyDown={(event) => captureShortcut(action, event)}
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label={`${SHORTCUT_ACTION_LABELS[action]} shortcut`}
                    />
                    <button
                      type="button"
                      className="appearance-mini-button"
                      onClick={() => resetShortcut(action)}
                      disabled={shortcuts[action] === DEFAULT_KEYBOARD_SHORTCUTS[action]}
                    >
                      Reset
                    </button>
                  </div>
                ))}
              </div>
              {shortcutWarning && <p className="settings-warning">{shortcutWarning}</p>}
              <button type="button" className="panel-action secondary compact" onClick={resetShortcuts}>
                Reset Shortcuts
              </button>
            </section>
            )}
          </div>
        </div>
        <div className="menu-dialog-footer">
          {status && <span className="settings-status">{status}</span>}
          <button type="button" className="panel-action secondary compact" onClick={onReset}>
            Reset to Defaults
          </button>
          <button type="button" className="panel-action compact" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

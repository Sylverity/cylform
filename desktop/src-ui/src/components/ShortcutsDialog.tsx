import {
  SHORTCUT_DEFINITIONS,
  shortcutDisplayText,
  type ShortcutActionId,
} from '../shortcuts';

interface ShortcutsDialogProps {
  open: boolean;
  shortcuts: Record<ShortcutActionId, string>;
  onClose: () => void;
}

function shortcutKeys(shortcut: string): string[] {
  return shortcutDisplayText(shortcut).split('+').map((part) => part.trim()).filter(Boolean);
}

export function ShortcutsDialog({ open, shortcuts, onClose }: ShortcutsDialogProps) {
  if (!open) return null;

  const shortcutGroups = [
    {
      title: 'File',
      ids: ['openFile', 'openRecent', 'closeTab', 'exportPng', 'previousTab', 'nextTab', 'previousFile', 'nextFile'],
    },
    {
      title: 'Navigation',
      ids: ['resetView', 'clearSelection', 'cameraFront', 'cameraTop', 'cameraRight', 'cameraIso'],
      extra: [
        { keys: ['Left drag'], action: 'Rotate' },
        { keys: ['Right drag'], action: 'Pan' },
        { keys: ['Scroll'], action: 'Zoom' },
      ],
    },
    {
      title: 'Selection modes',
      ids: ['viewMode', 'measureMode', 'atomMode', 'bondMode', 'atomBondMode', 'labelMode'],
    },
    {
      title: 'Visibility & style',
      ids: ['toggleHydrogen'],
    },
    {
      title: 'Help',
      ids: ['openSettings', 'showShortcuts'],
    },
  ] satisfies Array<{
    title: string;
    ids: ShortcutActionId[];
    extra?: Array<{ keys: string[]; action: string }>;
  }>;

  const definitionById = new Map(SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition]));
  const groups = shortcutGroups.map((group) => ({
    title: group.title,
    shortcuts: [
      ...(group.extra ?? []),
      ...group.ids.map((id) => ({
        keys: shortcutKeys(shortcuts[id]),
        action: definitionById.get(id)?.label ?? id,
      })),
    ],
  }));

  return (
    <div
      className="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="shortcuts-dialog">
        <div className="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button type="button" className="shortcuts-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="shortcuts-body">
          {groups.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h4>{group.title}</h4>
              <div className="shortcuts-list">
                {group.shortcuts.map(({ keys, action }) => (
                  <div key={action} className="shortcut-row">
                    <span className="shortcut-keys">
                      {keys.map((k, i) => (
                        <span key={k + i}>
                          <kbd>{k}</kbd>
                          {i < keys.length - 1 && <span className="shortcut-plus">+</span>}
                        </span>
                      ))}
                    </span>
                    <span className="shortcut-action">{action}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="shortcuts-footer">
          <button type="button" className="panel-action" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

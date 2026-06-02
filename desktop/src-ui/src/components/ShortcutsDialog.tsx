interface ShortcutsDialogProps {
  open: boolean;
  shortcuts?: {
    openFile: string;
    exportPng: string;
    resetView: string;
    toggleHydrogen: string;
    viewMode: string;
    measureMode: string;
    atomMode: string;
    bondMode: string;
    atomBondMode: string;
    labelMode: string;
    openSettings: string;
  };
  onClose: () => void;
}

function shortcutKeys(shortcut: string): string[] {
  return shortcut.split('+').map((part) => part.trim()).filter(Boolean);
}

export function ShortcutsDialog({ open, shortcuts, onClose }: ShortcutsDialogProps) {
  if (!open) return null;

  const groups = [
    {
      title: 'File',
      shortcuts: [
        { keys: shortcutKeys(shortcuts?.openFile ?? 'Ctrl+O'), action: 'Open file' },
        { keys: shortcutKeys(shortcuts?.exportPng ?? 'Ctrl+E'), action: 'Export PNG' },
        { keys: shortcutKeys(shortcuts?.openSettings ?? 'Ctrl+,'), action: 'Settings' },
      ],
    },
    {
      title: 'Navigation',
      shortcuts: [
        { keys: ['L', 'drag'], action: 'Rotate' },
        { keys: ['R', 'drag'], action: 'Pan' },
        { keys: ['Scroll'], action: 'Zoom' },
        { keys: shortcutKeys(shortcuts?.resetView ?? 'R'), action: 'Reset view' },
      ],
    },
    {
      title: 'Selection modes',
      shortcuts: [
        { keys: shortcutKeys(shortcuts?.viewMode ?? 'V'), action: 'View mode' },
        { keys: shortcutKeys(shortcuts?.measureMode ?? 'M'), action: 'Measure mode' },
        { keys: shortcutKeys(shortcuts?.atomMode ?? 'A'), action: 'Select atoms' },
        { keys: shortcutKeys(shortcuts?.bondMode ?? 'B'), action: 'Select bonds' },
        { keys: shortcutKeys(shortcuts?.atomBondMode ?? 'Z'), action: 'Select atoms + bonds' },
        { keys: shortcutKeys(shortcuts?.labelMode ?? 'L'), action: 'Label mode' },
      ],
    },
    {
      title: 'Visibility & style',
      shortcuts: [
        { keys: shortcutKeys(shortcuts?.toggleHydrogen ?? 'H'), action: 'Cycle hydrogen visibility' },
        { keys: ['Esc'], action: 'Clear selection' },
      ],
    },
    {
      title: 'Help',
      shortcuts: [{ keys: ['?'], action: 'Show this dialog' }],
    },
  ];

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

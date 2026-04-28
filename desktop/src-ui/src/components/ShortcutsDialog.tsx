interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'File',
    shortcuts: [
      { keys: ['Ctrl', 'O'], action: 'Open file' },
      { keys: ['Ctrl', 'E'], action: 'Export PNG' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['L', 'drag'], action: 'Rotate' },
      { keys: ['R', 'drag'], action: 'Pan' },
      { keys: ['Scroll'], action: 'Zoom' },
      { keys: ['R'], action: 'Reset view' },
    ],
  },
  {
    title: 'Selection modes',
    shortcuts: [
      { keys: ['V'], action: 'View mode' },
      { keys: ['M'], action: 'Measure mode' },
      { keys: ['A'], action: 'Atom mode' },
      { keys: ['B'], action: 'Bond mode' },
      { keys: ['Z'], action: 'Atom+Bond mode' },
      { keys: ['L'], action: 'Label mode' },
    ],
  },
  {
    title: 'Visibility & style',
    shortcuts: [
      { keys: ['H'], action: 'Cycle hydrogen visibility' },
      { keys: ['Esc'], action: 'Clear selection' },
    ],
  },
  {
    title: 'Help',
    shortcuts: [{ keys: ['?'], action: 'Show this dialog' }],
  },
];

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  if (!open) return null;

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
          {SHORTCUT_GROUPS.map((group) => (
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

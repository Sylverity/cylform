export type ShortcutActionId =
  | 'openFile'
  | 'openRecent'
  | 'closeTab'
  | 'exportPng'
  | 'previousTab'
  | 'nextTab'
  | 'previousFile'
  | 'nextFile'
  | 'resetView'
  | 'clearSelection'
  | 'toggleHydrogen'
  | 'viewMode'
  | 'measureMode'
  | 'atomMode'
  | 'bondMode'
  | 'atomBondMode'
  | 'labelMode'
  | 'openSettings'
  | 'showShortcuts'
  | 'cameraFront'
  | 'cameraTop'
  | 'cameraRight'
  | 'cameraIso';

export interface ShortcutSettingsLike {
  interaction: {
    keyboardShortcuts: Record<string, string>;
  };
}

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  defaultShortcut: string;
  group: 'file' | 'navigation' | 'selection' | 'visibility' | 'help';
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'openFile', label: 'Open File', defaultShortcut: 'CmdOrCtrl+O', group: 'file' },
  { id: 'openRecent', label: 'Open Recent', defaultShortcut: 'CmdOrCtrl+Shift+O', group: 'file' },
  { id: 'closeTab', label: 'Close Current Molecule', defaultShortcut: 'CmdOrCtrl+W', group: 'file' },
  { id: 'exportPng', label: 'Export PNG', defaultShortcut: 'CmdOrCtrl+E', group: 'file' },
  { id: 'previousTab', label: 'Previous Tab', defaultShortcut: 'CmdOrCtrl+PageUp', group: 'file' },
  { id: 'nextTab', label: 'Next Tab', defaultShortcut: 'CmdOrCtrl+PageDown', group: 'file' },
  { id: 'previousFile', label: 'Previous File', defaultShortcut: 'Alt+ArrowLeft', group: 'file' },
  { id: 'nextFile', label: 'Next File', defaultShortcut: 'Alt+ArrowRight', group: 'file' },
  { id: 'resetView', label: 'Reset View', defaultShortcut: 'R', group: 'navigation' },
  { id: 'clearSelection', label: 'Clear Selection', defaultShortcut: 'Escape', group: 'navigation' },
  { id: 'cameraFront', label: 'Front View', defaultShortcut: 'Digit1', group: 'navigation' },
  { id: 'cameraTop', label: 'Top View', defaultShortcut: 'Digit2', group: 'navigation' },
  { id: 'cameraRight', label: 'Right View', defaultShortcut: 'Digit3', group: 'navigation' },
  { id: 'cameraIso', label: 'Iso View', defaultShortcut: 'Digit4', group: 'navigation' },
  { id: 'viewMode', label: 'View Mode', defaultShortcut: 'V', group: 'selection' },
  { id: 'measureMode', label: 'Measure Mode', defaultShortcut: 'M', group: 'selection' },
  { id: 'atomMode', label: 'Atom Selection', defaultShortcut: 'A', group: 'selection' },
  { id: 'bondMode', label: 'Bond Selection', defaultShortcut: 'B', group: 'selection' },
  { id: 'atomBondMode', label: 'Atom+Bond Selection', defaultShortcut: 'Z', group: 'selection' },
  { id: 'labelMode', label: 'Label Mode', defaultShortcut: 'L', group: 'selection' },
  { id: 'toggleHydrogen', label: 'Toggle Hydrogen Mode', defaultShortcut: 'H', group: 'visibility' },
  { id: 'openSettings', label: 'Settings', defaultShortcut: 'CmdOrCtrl+,', group: 'help' },
  { id: 'showShortcuts', label: 'Keyboard Shortcuts', defaultShortcut: 'Shift+/', group: 'help' },
];

export const DEFAULT_KEYBOARD_SHORTCUTS = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition.defaultShortcut]),
) as Record<ShortcutActionId, string>;

export const SHORTCUT_ACTION_LABELS = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition.label]),
) as Record<ShortcutActionId, string>;

const MODIFIER_ORDER = ['CmdOrCtrl', 'Ctrl', 'Meta', 'Alt', 'Shift'] as const;
const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  space: 'Space',
  ' ': 'Space',
  comma: ',',
  period: '.',
  slash: '/',
  '/': '/',
  '?': '/',
  backslash: '\\',
  semicolon: ';',
  quote: "'",
  minus: '-',
  equal: '=',
  plus: '=',
  tab: 'Tab',
  enter: 'Enter',
  return: 'Enter',
  delete: 'Delete',
  backspace: 'Backspace',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
};

function normalizeKeyPart(part: string): string | null {
  const trimmed = part.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  if (/^digit[0-9]$/i.test(trimmed)) return `Digit${trimmed.charAt(trimmed.length - 1)}`;
  if (/^[0-9]$/.test(trimmed)) return `Digit${trimmed}`;
  if (/^key[a-z]$/i.test(trimmed)) return trimmed.slice(-1).toUpperCase();
  if (/^[a-z]$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(trimmed)) return trimmed.toUpperCase();
  if (trimmed.length === 1) return trimmed;
  return trimmed;
}

export function normalizeShortcutText(shortcut: string): string | null {
  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const modifiers = new Set<string>();
  let key: string | null = null;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (['cmdorctrl', 'cmdorcontrol', 'commandorcontrol', 'commandorctrl'].includes(lower)) {
      modifiers.add('CmdOrCtrl');
    } else if (['ctrl', 'control'].includes(lower)) {
      modifiers.add('Ctrl');
    } else if (['cmd', 'command', 'meta', 'super'].includes(lower)) {
      modifiers.add('Meta');
    } else if (lower === 'alt' || lower === 'option') {
      modifiers.add('Alt');
    } else if (lower === 'shift') {
      modifiers.add('Shift');
    } else if (!key) {
      key = normalizeKeyPart(part);
    } else {
      return null;
    }
  }

  if (!key) return null;
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join('+');
}

function eventKey(event: KeyboardEvent): string {
  if (/^Digit[0-9]$/.test(event.code)) return event.code;
  const key = normalizeKeyPart(event.key);
  return key ?? event.key;
}

export function shortcutMatchesEvent(shortcut: string, event: KeyboardEvent): boolean {
  const normalized = normalizeShortcutText(shortcut);
  if (!normalized) return false;

  const parts = normalized.split('+');
  const key = parts[parts.length - 1];
  const wantsCmdOrCtrl = parts.includes('CmdOrCtrl');
  const wantsCtrl = parts.includes('Ctrl');
  const wantsMeta = parts.includes('Meta');
  const wantsAlt = parts.includes('Alt');
  const wantsShift = parts.includes('Shift');
  const commandOrControlMatches = wantsCmdOrCtrl
    ? event.ctrlKey || event.metaKey
    : event.ctrlKey === wantsCtrl && event.metaKey === wantsMeta;

  return (
    key === eventKey(event) &&
    commandOrControlMatches &&
    event.altKey === wantsAlt &&
    event.shiftKey === wantsShift
  );
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent): string | null {
  const key = eventKey(event);
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  const modifiers = [
    event.ctrlKey || event.metaKey ? 'CmdOrCtrl' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
  ].filter(Boolean);
  return normalizeShortcutText([...modifiers, key].join('+'));
}

export function effectiveKeyboardShortcuts(
  settings: ShortcutSettingsLike,
): Record<ShortcutActionId, string> {
  const shortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };
  for (const action of Object.keys(DEFAULT_KEYBOARD_SHORTCUTS) as ShortcutActionId[]) {
    const normalized = normalizeShortcutText(settings.interaction.keyboardShortcuts[action] ?? '');
    if (normalized) shortcuts[action] = normalized;
  }
  return shortcuts;
}

export function hasShortcutConflict(
  action: ShortcutActionId,
  shortcut: string,
  settings: ShortcutSettingsLike,
): boolean {
  const normalized = normalizeShortcutText(shortcut);
  if (!normalized) return true;
  const shortcuts = effectiveKeyboardShortcuts(settings);
  return (Object.keys(shortcuts) as ShortcutActionId[]).some((candidate) => (
    candidate !== action && normalizeShortcutText(shortcuts[candidate]) === normalized
  ));
}

export function shortcutDisplayText(shortcut: string): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform.toLowerCase();
  return normalizeShortcutText(shortcut)
    ?.replace(/CmdOrCtrl/g, platform.includes('mac') ? 'Cmd' : 'Ctrl')
    ?.replace(/ArrowLeft/g, 'Left')
    ?.replace(/ArrowRight/g, 'Right')
    ?.replace(/ArrowUp/g, 'Up')
    ?.replace(/ArrowDown/g, 'Down')
    ?.replace(/Digit/g, '')
    ?? shortcut;
}

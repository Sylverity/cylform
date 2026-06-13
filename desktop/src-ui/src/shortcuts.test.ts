import { describe, expect, it } from 'vitest';
import {
  effectiveKeyboardShortcuts,
  hasShortcutConflict,
  normalizeShortcutText,
  shortcutFromKeyboardEvent,
  shortcutMatchesEvent,
  type ShortcutSettingsLike,
} from './shortcuts';

function keyEvent(
  key: string,
  options: Partial<KeyboardEvent> = {},
): KeyboardEvent {
  return {
    key,
    code: options.code ?? '',
    ctrlKey: Boolean(options.ctrlKey),
    metaKey: Boolean(options.metaKey),
    altKey: Boolean(options.altKey),
    shiftKey: Boolean(options.shiftKey),
  } as KeyboardEvent;
}

function settings(shortcuts: Record<string, string>): ShortcutSettingsLike {
  return { interaction: { keyboardShortcuts: shortcuts } };
}

describe('keyboard shortcuts', () => {
  it('normalizes command/control, modifiers, punctuation, and named keys', () => {
    expect(normalizeShortcutText('ctrl + o')).toBe('Ctrl+O');
    expect(normalizeShortcutText('CommandOrControl + ,')).toBe('CmdOrCtrl+,');
    expect(normalizeShortcutText('Shift + /')).toBe('Shift+/');
    expect(normalizeShortcutText('Alt + Left')).toBe('Alt+ArrowLeft');
    expect(normalizeShortcutText('1')).toBe('Digit1');
    expect(normalizeShortcutText('Ctrl+O+P')).toBeNull();
  });

  it('matches CmdOrCtrl on either control or meta without blocking modified mode shortcuts', () => {
    expect(shortcutMatchesEvent('CmdOrCtrl+O', keyEvent('o', { ctrlKey: true }))).toBe(true);
    expect(shortcutMatchesEvent('CmdOrCtrl+O', keyEvent('o', { metaKey: true }))).toBe(true);
    expect(shortcutMatchesEvent('Ctrl+Shift+R', keyEvent('R', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(shortcutMatchesEvent('Ctrl+Shift+R', keyEvent('R', { metaKey: true, shiftKey: true }))).toBe(false);
  });

  it('handles slash/question and digit codes consistently', () => {
    expect(shortcutMatchesEvent('Shift+/', keyEvent('?', { code: 'Slash', shiftKey: true }))).toBe(true);
    expect(shortcutMatchesEvent('Digit1', keyEvent('!', { code: 'Digit1', shiftKey: true }))).toBe(false);
    expect(shortcutMatchesEvent('Shift+Digit1', keyEvent('!', { code: 'Digit1', shiftKey: true }))).toBe(true);
  });

  it('captures user shortcuts from keyboard events', () => {
    expect(shortcutFromKeyboardEvent(keyEvent('o', { ctrlKey: true }))).toBe('CmdOrCtrl+O');
    expect(shortcutFromKeyboardEvent(keyEvent('?', { code: 'Slash', shiftKey: true }))).toBe('Shift+/');
    expect(shortcutFromKeyboardEvent(keyEvent('Control', { ctrlKey: true }))).toBeNull();
  });

  it('applies defaults and detects conflicts against effective shortcuts', () => {
    const configured = settings({ resetView: 'Ctrl+R' });
    expect(effectiveKeyboardShortcuts(configured).resetView).toBe('Ctrl+R');
    expect(hasShortcutConflict('openFile', 'Ctrl+R', configured)).toBe(true);
    expect(hasShortcutConflict('openFile', 'Ctrl+Shift+R', configured)).toBe(false);
  });
});

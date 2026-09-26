import { describe, expect, it } from 'vitest';
import { createKeyInput } from '@chardesk/keyboard';
import {
  matchesShortcutInput,
  normalizeShortcut,
  shortcutFromKeyInput,
} from './shortcut';

describe('editor shortcut adapter', () => {
  it('normalizes strokes and explicit two-stroke sequences', () => {
    expect(normalizeShortcut('Shift+MOD+Z')).toEqual(['Mod+Shift+Z']);
    expect(normalizeShortcut('Backspace')).toEqual(['Backspace']);
    expect(normalizeShortcut('MOD+K mod+C')).toEqual(['Mod+K', 'Mod+C']);
    expect(normalizeShortcut(['MOD+K', 'mod+C'])).toEqual(['Mod+K', 'Mod+C']);
  });

  it('rejects modifier-only, malformed, and overlong shortcuts', () => {
    expect(normalizeShortcut('mod')).toBeNull();
    expect(normalizeShortcut('mod+a+b')).toBeNull();
    expect(normalizeShortcut('mod+k mod+c mod+x')).toBeNull();
  });

  it('never records left or right modifier keys as strokes', () => {
    expect(shortcutFromKeyInput(createKeyInput({
      key: 'Meta', code: 'MetaLeft', modifiers: { meta: true },
    }))).toBeNull();
    expect(shortcutFromKeyInput(createKeyInput({
      key: 'Control', code: 'ControlRight', modifiers: { ctrl: true },
    }))).toBeNull();
  });

  it('records portable Mod and matches physical fallbacks for layouts and dead keys', () => {
    const commandR = createKeyInput({ key: 'r', code: 'KeyR', modifiers: { meta: true } });
    expect(shortcutFromKeyInput(commandR, 'mac')).toBe('Mod+R');
    expect(matchesShortcutInput(
      createKeyInput({ key: 'Dead', code: 'KeyE', modifiers: { alt: true } }),
      'Alt+E',
      'mac'
    )).toBe(true);
    expect(matchesShortcutInput(
      createKeyInput({ key: '¡', code: 'Digit1', modifiers: { alt: true } }),
      'Alt+1',
      'mac'
    )).toBe(true);
    expect(matchesShortcutInput(commandR, 'Mod+R', 'linux')).toBe(true);
    expect(matchesShortcutInput(
      createKeyInput({ key: 'r', code: 'KeyR', modifiers: { ctrl: true } }),
      'Mod+R',
      'mac'
    )).toBe(true);
  });

  it('migrates supported physical letter and digit codes', () => {
    expect(normalizeShortcut('Alt+code:Digit1')).toEqual(['Alt+1']);
    expect(normalizeShortcut('Mod+code:KeyR')).toEqual(['Mod+R']);
  });
});

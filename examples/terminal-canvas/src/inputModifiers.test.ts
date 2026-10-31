import { expect, test } from 'bun:test';
import { buildKittyKeyboardFlags } from '@opentui/core';
import { terminalKeyboardOptions, TerminalInputModifiers } from './inputModifiers.ts';

test('Warp requests standalone modifier lifetimes together with associated text', () => {
  expect(buildKittyKeyboardFlags(terminalKeyboardOptions('WarpTerminal'))).toBe(31);
  expect(buildKittyKeyboardFlags(terminalKeyboardOptions(undefined))).toBe(7);
});

test('left/right modifiers remain distinct and release ignores Warp self bits', () => {
  const state = new TerminalInputModifiers();
  const key = (name: string, eventType: 'press' | 'release') => ({
    name,
    eventType,
    source: 'kitty' as const,
  });
  state.update(key('leftalt', 'press'));
  state.update(key('rightalt', 'press'));
  state.update(key('leftctrl', 'press'));
  expect(state.held).toEqual({ shift: false, alt: true, ctrl: true });
  state.update(key('leftalt', 'release'));
  expect(state.held.alt).toBe(true);
  state.update(key('rightalt', 'release'));
  expect(state.held).toEqual({ shift: false, alt: false, ctrl: true });
  state.update(key('leftctrl', 'release'));
  expect(state.held.ctrl).toBe(false);
  expect(state.merge({ shift: true, alt: false, ctrl: false }).shift).toBe(true);
  expect(state.update({ name: 'leftalt', eventType: 'press', source: 'raw' })).toBe(false);
  expect(state.held.alt).toBe(false);
  state.update(key('leftalt', 'press'));
  state.clear();
  expect(state.held.alt).toBe(false);
});

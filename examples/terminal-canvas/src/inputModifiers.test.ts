import { expect, test } from 'bun:test';
import { buildKittyKeyboardFlags } from '@opentui/core';
import { terminalKeyboardOptions, TerminalInputModifiers } from './inputModifiers.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';

const warp = resolveTerminalPolicy({ TERM_PROGRAM: 'WarpTerminal' });
const native = resolveTerminalPolicy({ TERM_PROGRAM: 'ghostty' });
const none = { shift: false, alt: false, ctrl: false };
const key = (
  name: string,
  eventType: 'press' | 'repeat' | 'release' = 'press',
  modifiers: Partial<{
    shift: boolean;
    ctrl: boolean;
    meta: boolean;
    option: boolean;
    super: boolean;
  }> = {}
) => ({
  name,
  eventType,
  source: 'kitty' as const,
  shift: false,
  ctrl: false,
  meta: false,
  option: false,
  ...modifiers,
});

test('Warp requests standalone modifier lifetimes together with associated text', () => {
  expect(buildKittyKeyboardFlags(terminalKeyboardOptions('WarpTerminal'))).toBe(31);
  expect(buildKittyKeyboardFlags(terminalKeyboardOptions(undefined))).toBe(7);
});

test('left/right modifiers remain distinct and release ignores Warp self bits', () => {
  const state = new TerminalInputModifiers();
  state.observeKey(key('leftalt', 'press', { meta: true }), warp);
  state.observeKey(key('rightalt', 'press', { meta: true }), warp);
  state.observeKey(key('leftctrl', 'press', { meta: true, ctrl: true }), warp);
  expect(state.held).toEqual({ shift: false, alt: true, ctrl: true });
  state.observeKey(key('leftalt', 'release', { meta: true, ctrl: true }), warp);
  expect(state.held.alt).toBe(true);
  state.observeKey(key('rightalt', 'release', { meta: true, ctrl: true }), warp);
  expect(state.held).toEqual({ shift: false, alt: false, ctrl: true });
  state.observeKey(key('leftctrl', 'release', { ctrl: true }), warp);
  expect(state.held).toEqual(none);
  expect(state.observeKey({ ...key('leftalt'), source: 'raw' }, warp)).toBe(false);
  expect(state.held).toEqual(none);
  state.observeKey(key('leftalt', 'press', { meta: true }), warp);
  state.clear();
  expect(state.held).toEqual(none);
});

for (const phase of ['press', 'repeat', 'release'] as const) {
  test(`ordinary Kitty ${phase} replaces stale modifier edges and side ownership`, () => {
    const state = new TerminalInputModifiers();
    state.observeKey(key('leftalt', 'press', { meta: true }), warp);
    expect(state.observeKey(key('a', phase, { ctrl: true }), warp)).toBe(false);
    expect(state.held).toEqual({ ...none, ctrl: true });
    state.observeKey(key('rightalt', 'press', { meta: true }), warp);
    state.observeKey(key('rightalt', 'release', { meta: true }), warp);
    // The obsolete left Alt edge cannot keep the new right Alt release alive.
    expect(state.held).toEqual(none);
  });
}

test('full snapshots normalize Option separately from Command, without needing standalone edges', () => {
  const state = new TerminalInputModifiers();
  state.observeKey(key('escape', 'press', { option: true }), warp);
  expect(state.resolveMouse(none, warp)).toEqual({ ...none, alt: true });
  state.observeKey(key('c', 'press', { super: true }), warp);
  expect(state.held).toEqual(none);
  state.observeKey(key('a', 'press', { meta: true, shift: true, ctrl: true }), warp);
  expect(state.resolveMouse(none, warp)).toEqual({ ...none, alt: true, ctrl: true });
  expect(state.resolveMouse({ ...none, shift: true }, warp).shift).toBe(true);
});

test('raw text is not a full snapshot; unmodified raw Escape explicitly recovers', () => {
  const state = new TerminalInputModifiers();
  state.observeKey(key('leftalt', 'press', { meta: true }), warp);
  state.observeKey({ ...key('a'), source: 'raw' }, warp);
  expect(state.held.alt).toBe(true);
  state.observeKey({ ...key('escape', 'press', { meta: true }), source: 'raw' }, warp);
  expect(state.held.alt).toBe(true);
  state.observeKey({ ...key('escape'), source: 'raw' }, warp);
  expect(state.held).toEqual(none);
});

test('non-Warp release honors the snapshot even if an opposite-side press was never observed', () => {
  const state = new TerminalInputModifiers();
  state.observeKey(key('leftalt', 'press', { meta: true }), native);
  state.observeKey(key('leftalt', 'release', { meta: true }), native);
  expect(state.held.alt).toBe(true);
  expect(state.resolveMouse(none, native)).toEqual(none);
  expect(state.held).toEqual(none);
});

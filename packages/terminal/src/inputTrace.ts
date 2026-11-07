import { openSync, closeSync, writeSync } from 'node:fs';
import type { KeyEvent } from '@opentui/core';
import type { CanvasSurface } from './surface.ts';

// Navigation, deletion controls and mouse protocols only. Never record pasted text, OSC payloads,
// printable key names, or Kitty encodings of printable Unicode code points.
const navigationSequence =
  // eslint-disable-next-line no-control-regex -- ANSI Escape is part of the terminal input protocol.
  /^(?:\x1b\[<\d+;\d+;\d+[mM]|\x1b\[[\d;:]*[ABCDHF~]|\x1bO[ABCDHP-S]|\x1b\[57[34]\d{2}[\d;:]*u)+$/;
const deletionSequence =
  // eslint-disable-next-line no-control-regex -- Only Backspace controls, without associated text.
  /^(?:[\x08\x7f]|\x1b\[(?:8|127)(?:;\d+(?::[123])?)?u)$/;
const navigationName =
  /^(?:up|down|left|right|home|end|pageup|pagedown|escape|tab|backspace|delete|f\d+|(?:left|right)?(?:shift|alt|option|meta|super|ctrl|control))$/;

/** Opt-in evidence from the real terminal, without modifying input dispatch. */
export function attachInputTrace(surface: CanvasSurface, path: string) {
  const fd = openSync(path, 'wx', 0o600);
  const { renderer, model } = surface;
  let active = true;
  const appearanceState = () => {
    const { revision, mode, status } = surface.appearance.getSnapshot();
    return { revision, mode, status };
  };
  let previousContentVersion = model.version;
  let contentVersion = 0;
  const state = () => {
    if (model.version !== previousContentVersion) {
      previousContentVersion = model.version;
      contentVersion++;
    }
    return {
      tool: model.currentTool,
      viewport: model.viewport,
      cursor: model.cursor,
      selection: model.selection,
      gesture: model.gestureState.type,
      contentVersion,
      focus: {
        dock: surface.focusedDockControl?.id ?? null,
        style: Boolean(surface.inspector?.focused),
        colorInput: Boolean(surface.inspector?.colorInput),
      },
      deletionEnabled: {
        backward: model.editor.commands.canExecute('terminal.backspace', undefined),
        forward: model.editor.commands.canExecute('terminal.delete', undefined),
      },
      heldModifiers: surface.inputModifiers.held,
      panel: Boolean(surface.panel),
      help: surface.help,
      contextMenu: Boolean(surface.contextMenu?.isOpen),
      appearance: appearanceState(),
    };
  };
  const write = (event: Record<string, unknown>) => {
    if (!active) return;
    try {
      writeSync(fd, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
    } catch {
      active = false;
    } // A failed diagnostic must not interrupt editing.
  };
  write({
    kind: 'start',
    entrypoint: process.argv[1],
    terminal: { term: process.env.TERM, program: process.env.TERM_PROGRAM },
    state: state(),
  });
  const raw = (chunk: Buffer | string) => {
    const sequence = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (sequence.length <= 512 && navigationSequence.test(sequence))
      write({ kind: 'raw-navigation', hex: Buffer.from(sequence).toString('hex') });
    else if (sequence.length <= 512 && deletionSequence.test(sequence))
      write({ kind: 'raw-deletion', hex: Buffer.from(sequence).toString('hex') });
    else
      write({
        kind: 'raw-redacted',
        bytes: Buffer.byteLength(sequence),
        startsWithEscape: sequence.startsWith('\x1b'),
      });
  };
  const key = (event: KeyEvent) =>
    write({
      kind: navigationName.test(event.name) ? 'key' : 'key-redacted',
      ...(navigationName.test(event.name) ? { name: event.name } : {}),
      source: event.source,
      phase: event.eventType,
      modifiers: {
        shift: event.shift,
        option: event.option,
        meta: event.meta,
        super: event.super,
        ctrl: event.ctrl,
      },
      state: state(),
    });
  renderer.stdin.on('data', raw);
  renderer.keyInput.prependListener('keypress', key);
  renderer.keyInput.prependListener('keyrelease', key);
  const unsubscribe = model.subscribe(() => write({ kind: 'state', state: state() }));
  const unsubscribeAppearance = surface.appearance.subscribe(() =>
    write({ kind: 'appearance', appearance: appearanceState() })
  );
  return () => {
    renderer.stdin.off('data', raw);
    renderer.keyInput.off('keypress', key);
    renderer.keyInput.off('keyrelease', key);
    unsubscribe();
    unsubscribeAppearance();
    if (active) write({ kind: 'stop', state: state() });
    active = false;
    closeSync(fd);
  };
}

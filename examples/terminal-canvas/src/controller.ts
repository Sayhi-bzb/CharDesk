import { captureSelectionSnapshot, renderSelectionSnapshot } from './snapshot.ts';
import type { PasteEvent, KeyEvent } from '@opentui/core';
import { connectBindings } from '@chardesk/editor-input';
import { createTerminalInput } from '@chardesk/editor-input/terminal';
import type { TerminalClipboardAccess } from './clipboard.ts';
import type {
  EditorCommandResult,
  EditorCommandCompletion,
} from '@chardesk/editor-core/editor/types';
import { TerminalSettingsDialog } from './settingsDialog.ts';
import { TerminalContextMenu } from './contextMenu.ts';
import { messages } from './copy.ts';
import type { TerminalAction } from './shortcuts.ts';
import type { CanvasSurface } from './surface.ts';
import type { TerminalWorkspace } from './workspace.ts';
import { WorkspaceControls } from './workspaceControls.ts';

const unavailableClipboard: TerminalClipboardAccess = {
  canRead: () => false,
  read: async () => ({ error: 'clipboard-failed' }),
  write: async () => ({ status: 'unavailable' }),
};

export function attachControls(
  surface: CanvasSurface,
  quit: () => void,
  clipboard: TerminalClipboardAccess = unavailableClipboard,
  workspace?: TerminalWorkspace
) {
  const { model, renderer, shortcuts } = surface;
  const clipboardPort = clipboard;
  const copy = messages,
    editor = model.editor;
  const detachClipboard = model.configureClipboard(clipboardPort);
  const disposers: Array<() => void> = [];
  const settingsDialog = new TerminalSettingsDialog(surface);
  disposers.push(() => settingsDialog.dispose());
  const menu = new TerminalContextMenu(surface);
  surface.contextMenu = menu;
  disposers.push(() => {
    menu.close();
    surface.contextMenu = null;
  });
  const workspaceControls = workspace
    ? new WorkspaceControls(surface, workspace, clipboardPort, () => {
        editor.commands.execute('terminal.quit', undefined, 'workspace');
      })
    : null;
  if (workspaceControls) disposers.push(() => workspaceControls.dispose());
  disposers.push(
    model.subscribe(() => {
      menu.validate();
      surface.requestRender();
    })
  );
  disposers.push(editor.keymap.subscribe(() => surface.requestRender()));
  let active = true,
    clipboardRequest = 0;
  const editOnly = () => surface.tool === 'edit';
  const panelActions = new Set(['copy', 'cut', 'paste', 'select-all']);
  const bind = (
    id: string,
    keys: readonly string[],
    run: () => void | EditorCommandResult,
    enabled = () => true,
    repeatable = true
  ) => {
    const commandId = `terminal.${id}`;
    const available = () =>
      !surface.closing &&
      !settingsDialog.isOpen &&
      !(surface.panel && id !== 'help' && id !== 'escape' && !panelActions.has(id)) &&
      !(surface.help && id !== 'help' && id !== 'escape') &&
      enabled();
    disposers.push(
      editor.commands.register('terminal', {
        id: commandId,
        canExecute: available,
        execute: () => {
          menu.close();
          keymap.clearPendingSequence();
          surface.status = '';
          return run() ?? { handled: true, status: 'succeeded' };
        },
      })
    );
    disposers.push(
      editor.keymap.register('terminal', {
        id: commandId,
        shortcuts: keys,
        target: { type: 'command', id: commandId },
        scope: 'canvas',
        repeat: repeatable ? 'allow' : 'ignore',
        when: () => (id === 'help' || id === 'escape' || !surface.help) && enabled(),
      })
    );
  };
  const action = (
    id: TerminalAction,
    run: () => void | EditorCommandResult,
    enabled = () => true
  ) => bind(id, shortcuts[id].keys, run, enabled, shortcuts[id].repeatable);
  const clipboardAction = (kind: 'copy' | 'cut' | 'paste', providedText?: string, ansi = false) => {
    if (surface.panel) {
      workspaceControls?.clipboardAction(kind);
      return;
    }
    surface.cancelGesture();
    const request = ++clipboardRequest;
    let result: ReturnType<typeof model.commands.copy>;
    if (providedText !== undefined) result = model.commands.pasteProvided(providedText);
    else if (kind === 'copy') result = model.commands.copy({ ansi });
    else result = model.commands[kind]();
    if (result.status === 'pending') {
      surface.status = copy.clipboardWorking;
      void result.completion
        .then((completion) => {
          if (!active || request !== clipboardRequest) return;
          const data = completion.succeeded ? completion.data : undefined;
          if (!completion.succeeded) {
            const failures: Record<string, string> = {
              'stale-target': copy.clipboardStale,
              'prepare-failed': copy.pasteFailed,
            };
            surface.status = failures[completion.reason] ?? copy.clipboardFailed;
          } else if (data?.status === 'dispatched')
            surface.status = kind === 'cut' ? copy.cutDispatched : copy.copyDispatched;
          else if (data?.status === 'noop') surface.status = copy.clipboardEmpty;
          else
            surface.status = copy[kind === 'copy' ? 'copied' : kind === 'cut' ? 'cut' : 'pasted'];
          const diagnostics = model.getSnapshot().pasteDiagnostics;
          if (kind === 'paste' && completion.succeeded && diagnostics.length)
            surface.status += ` · ${copy.pasteWarnings}: ${diagnostics[0]!.message}`;
          surface.requestRender();
        })
        .catch(() => {
          if (active && request === clipboardRequest) {
            surface.status = copy.clipboardFailed;
            surface.requestRender();
          }
        });
    } else if (result.status === 'rejected') surface.status = copy.clipboardFailed;
  };
  action('settings', () => {
    workspaceControls?.dismiss();
    settingsDialog.open();
  });
  action('edit', () => surface.setTool('edit'));
  action('hand', () => surface.setTool('hand'));
  action(
    'context-menu',
    () => menu.open(),
    () => !surface.placement
  );
  for (const [id, dx, dy] of [
    ['pan-left', -1, 0],
    ['pan-right', 1, 0],
    ['pan-up', 0, -1],
    ['pan-down', 0, 1],
  ] as const) {
    action(id, () =>
      model.editor.transact(() => {
        surface.cancelGesture();
        model.pan(dx * surface.settings.values.panStep, dy * surface.settings.values.panStep);
      })
    );
  }

  action('minimap', () => {
    surface.cancelGesture();
    surface.minimapOpen = !surface.minimapOpen;
  });
  action('help', () => {
    surface.cancelGesture();
    surface.help = !surface.help;
    surface.helpScroll = 0;
  });
  action('quit', quit);
  if (workspace && workspaceControls) {
    for (const id of [
      'tools',
      'templates',
      'characters',
      'confirm-placement',
      'cancel-placement',
      'open',
      'new',
      'save-copy',
      'documents',
      'next-document',
      'previous-document',
      'search',
      'next-match',
      'anchors',
      'add-anchor',
      'close-document',
    ] as const)
      action(id, () => workspaceControls.action(id));
  }
  bind('escape', ['Escape'], () => {
    if (surface.help) surface.help = false;
    else if (model.gestureState.type !== 'idle') surface.cancelGesture();
    else {
      surface.cancelGesture();
      model.commands.escape();
    }
  });
  for (const kind of ['copy', 'cut'] as const)
    action(
      kind,
      () => clipboardAction(kind),
      () => Boolean(surface.panel || model.selection)
    );
  action(
    'paste',
    () => clipboardAction('paste'),
    () => clipboardPort.canRead?.() !== false
  );
  bind(
    'delete-selection',
    [],
    () => model.commands.erase(),
    () => Boolean(model.selection)
  );
  bind(
    'copy-ansi',
    [],
    () => clipboardAction('copy', undefined, true),
    () => Boolean(model.selection)
  );
  bind(
    'snapshot-png',
    [],
    () => {
      surface.cancelGesture();
      model.cancelPendingPaste();
      const request = ++clipboardRequest;
      const address = JSON.stringify(model.documents.getActiveAddress());
      const revision = model.plane.getRevision();
      const selection = JSON.stringify(model.getSnapshot().interaction);
      let appearanceRevision: number | null = null;
      const current = () =>
        active &&
        !surface.closing &&
        !settingsDialog.isOpen &&
        request === clipboardRequest &&
        address === JSON.stringify(model.documents.getActiveAddress()) &&
        revision === model.plane.getRevision() &&
        selection === JSON.stringify(model.getSnapshot().interaction) &&
        (appearanceRevision === null ||
          appearanceRevision === surface.appearance.getSnapshot().revision);
      surface.status = copy.clipboardWorking;
      const completion: Promise<EditorCommandCompletion> = (async () => {
        let copying = false;
        try {
          const snapshot = captureSelectionSnapshot(model);
          const appearance = await surface.appearance.ensurePalette();
          if (!current()) throw new Error('stale-target');
          if (appearance.status !== 'ready' || !appearance.palette)
            throw new Error('palette-unavailable');
          appearanceRevision = appearance.revision;
          const image = renderSelectionSnapshot(snapshot, {
            color: appearance.palette.foreground,
            background: appearance.palette.background,
          });
          if (!current()) throw new Error('stale-target');
          copying = true;
          const result = await clipboardPort.writeImage!(image, current);
          if (!current()) throw new Error('stale-target');
          if (result.status !== 'written') throw new Error('clipboard-failed');
          surface.status = copy.pngCopied;
          surface.requestRender();
          return { succeeded: true, changed: false };
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'clipboard-failed';
          if (active && request === clipboardRequest) {
            const failures: Record<string, string> = {
              'stale-target': copy.clipboardStale,
              'image-too-large': copy.pngTooLarge,
              'palette-unavailable': copy.pngPaletteUnavailable,
            };
            surface.status = failures[reason] ?? (copying ? copy.clipboardFailed : copy.pngFailed);
            surface.requestRender();
          }
          return { succeeded: false, changed: false, reason };
        }
      })();
      return { handled: true, status: 'pending', completion };
    },
    () =>
      Boolean(
        model.selection && clipboardPort.writeImage && clipboardPort.canWriteImage?.() !== false
      )
  );
  action(
    'undo',
    () => {
      surface.cancelGesture();
      return model.commands.undo();
    },
    () => model.canUndo
  );
  action(
    'redo',
    () => {
      surface.cancelGesture();
      return model.commands.redo();
    },
    () => model.canRedo
  );
  action(
    'select-all',
    () => {
      if (surface.panel) {
        workspaceControls?.clipboardAction('select-all');
        return;
      }
      surface.cancelGesture();
      return model.commands.selectAll();
    },
    () => Boolean(surface.panel || model.plane.getContentBounds())
  );
  action('origin', () => model.commands.pointAt({ x: 0, y: 0 }));
  action('focus', () => model.commands.focusContent());
  bind('delete', ['Delete'], () => model.commands.erase(), editOnly);
  bind('backspace', ['Backspace'], () => model.commands.deleteBackward(), editOnly);
  bind('newline', ['Enter'], () => model.commands.insert('\n'), editOnly);
  bind('tab', ['Tab'], () => model.commands.insert('\t'), editOnly);
  for (const [name, x, y] of [
    ['Left', -1, 0],
    ['Right', 1, 0],
    ['Up', 0, -1],
    ['Down', 0, 1],
  ] as const) {
    bind(
      name,
      [name],
      () => {
        surface.cancelGesture();
        return model.commands.navigate(x, y);
      },
      editOnly
    );
    bind(
      `extend-${name}`,
      [`Shift+${name}`],
      () => {
        surface.cancelGesture();
        return model.commands.navigate(x, y, true);
      },
      editOnly
    );
    bind(
      `move-${name}`,
      [`Ctrl+${name}`],
      () => {
        surface.cancelGesture();
        return model.commands.moveSelection(x, y);
      },
      editOnly
    );
  }
  const inputHost = createTerminalInput(renderer);
  const keymap = inputHost.keymap;
  const targetKey = () => JSON.stringify([model.documents.getActiveAddress(), model.currentTool]);
  let target = targetKey();
  disposers.push(
    model.subscribe(() => {
      const next = targetKey();
      if (next !== target) {
        target = next;
        keymap.clearPendingSequence();
      }
    })
  );
  const detachIntercept = keymap.intercept('key', ({ event: key, consume }) => {
    if (surface.inputModifiers.update(key)) {
      consume();
      return;
    }
    if (surface.closing) {
      consume();
      return;
    }
    if (menu.key(key)) {
      consume();
      return;
    }
    if (settingsDialog.key(key)) {
      consume();
      return;
    }
    if (surface.help && (key.name === 'up' || key.name === 'down')) {
      surface.helpScroll = Math.max(
        0,
        Math.min(surface.helpLines.length - 1, surface.helpScroll + (key.name === 'up' ? -1 : 1))
      );
      surface.requestRender();
      consume();
      return;
    }
    const binding = surface.panel ? bindings.resolveEvent(key) : undefined;
    if (
      binding?.id.startsWith('terminal.') &&
      panelActions.has(binding.id.slice('terminal.'.length))
    )
      return;
    if (workspaceControls?.key(key)) {
      consume();
      return;
    }
  });
  const bindings = connectBindings(keymap, editor.keymap, {
    context: () => ({
      state: model.getSnapshot(),
      targetKind: 'canvas-surface' as const,
      phase: 'keydown' as const,
    }),
    repeat: (key) => key.eventType === 'repeat',
    execute: (binding) => {
      surface.status = '';
      if (binding.target.type === 'command') {
        const result = editor.commands.execute(binding.target.id, undefined, 'terminal-keyboard');
        surface.requestRender();
        return result.handled;
      }
      return editor.setCurrentTool(binding.target.id);
    },
  });
  const keypress = (key: KeyEvent) => {
    if (key.eventType === 'release') return;
    key.preventDefault();
    surface.status = '';
    if (
      !surface.help &&
      surface.tool === 'edit' &&
      !key.ctrl &&
      !key.meta &&
      !key.super &&
      key.sequence &&
      !/\p{Cc}/u.test(key.sequence)
    ) {
      surface.cancelGesture();
      model.commands.insert(key.sequence);
    }
    surface.requestRender();
  };
  const paste = (event: PasteEvent) => {
    menu.validate();
    if (menu.isOpen || settingsDialog.isOpen) {
      event.preventDefault();
      return;
    }
    if (surface.help) return;
    event.preventDefault();
    if (surface.closing) return;
    if (workspaceControls?.paste(new TextDecoder().decode(event.bytes))) return;
    surface.status = '';
    surface.cancelGesture();
    clipboardAction('paste', new TextDecoder().decode(event.bytes));
    surface.requestRender();
  };
  const keyrelease = (key: KeyEvent) => {
    surface.inputModifiers.update(key);
  };
  const cancelGesture = () => {
    menu.close();
    surface.inputModifiers.clear();
    surface.cancelGesture();
  };
  renderer.keyInput.on('keypress', keypress);
  renderer.keyInput.on('keyrelease', keyrelease);
  renderer.keyInput.on('paste', paste);
  renderer.on('blur', cancelGesture);
  renderer.on('resize', cancelGesture);
  return () => {
    active = false;
    detachIntercept();
    bindings.dispose();
    inputHost.dispose();
    surface.inputModifiers.clear();
    detachClipboard();
    surface.cancelGesture();
    disposers.reverse().forEach((dispose) => dispose());
    renderer.keyInput.off('keypress', keypress);
    renderer.keyInput.off('keyrelease', keyrelease);
    renderer.keyInput.off('paste', paste);
    renderer.off('blur', cancelGesture);
    renderer.off('resize', cancelGesture);
  };
}

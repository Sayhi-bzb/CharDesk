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
import type { TerminalAction } from './shortcuts.ts';
import type { CanvasSurface } from './surface.ts';
import type { LocalSessions } from '../../local-runtime/src/sessions.ts';
import type { TerminalWorkspace } from '../../local-runtime/src/workspace.ts';
import { WorkspaceControls } from './workspaceControls.ts';
import { textAttributeNames } from '@chardesk/editor-core/selection/style';
import { navigationActions } from './navigation.ts';
import { TerminalInspector } from './inspector.ts';

const unavailableClipboard: TerminalClipboardAccess = {
  canRead: () => false,
  read: async () => ({ error: 'clipboard-failed' }),
  write: async () => ({ status: 'unavailable' }),
};

export function attachControls(
  surface: CanvasSurface,
  quit: () => void,
  clipboard: TerminalClipboardAccess = unavailableClipboard,
  workspace?: TerminalWorkspace,
  sessions?: LocalSessions
) {
  const { model, renderer, shortcuts } = surface;
  const clipboardPort = clipboard;
  const copy = surface.messages,
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
  const inspector = new TerminalInspector(surface, clipboardPort);
  surface.inspector = inspector;
  disposers.push(() => {
    inspector.dispose();
    surface.inspector = null;
  });
  const workspaceControls = workspace
    ? new WorkspaceControls(
        surface,
        workspace,
        clipboardPort,
        () => {
          editor.commands.execute('terminal.quit', undefined, 'workspace');
        },
        sessions
      )
    : null;
  if (workspaceControls) disposers.push(() => workspaceControls.dispose());
  if (workspaceControls) {
    surface.onFeedbackAction = (notice) => {
      settingsDialog.close();
      menu.close();
      inspector.blur();
      if (notice.action) notice.action.run();
      else workspaceControls.showFeedback(notice);
    };
    disposers.push(() => {
      surface.onFeedbackAction = undefined;
    });
  }
  disposers.push(
    model.subscribe(() => {
      menu.validate();
      surface.requestRender();
    })
  );
  disposers.push(editor.keymap.subscribe(() => surface.requestRender()));
  let active = true,
    clipboardRequest = 0;
  let dockClosingKey: string | null = null;
  const dockActions = new Set(['dock-next', 'dock-previous', 'dock-activate']);
  const dockKeys = new Set([...dockActions, 'escape', 'help', 'quit']);
  const editOnly = () => surface.tool === 'edit';
  const panelActions = new Set(['copy', 'cut', 'paste', 'select-all']);
  const runInput = (run: () => void | EditorCommandResult) => {
    try {
      return run();
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      surface.feedback.show(() => surface.t('Canvas limit'), 'warning', error.message);
      surface.requestRender();
      return { handled: true as const, status: 'rejected' as const, reason: 'operation-limit' };
    }
  };
  const emptyActions = new Set([
    ...dockActions,
    'help',
    'settings',
    'quit',
    'open',
    'new',
    'documents',
    'escape',
  ]);
  const bind = (
    id: string,
    keys: readonly string[],
    run: () => void | EditorCommandResult,
    enabled = () => true,
    repeatable = true
  ) => {
    const commandId = `terminal.${id}`;
    const application = id === 'quit' || id === 'feedback-details';
    const available = () =>
      !surface.closing &&
      (application ||
        surface.hasDocument ||
        emptyActions.has(id) ||
        Boolean(surface.panel && panelActions.has(id))) &&
      (application ||
        (!settingsDialog.isOpen &&
          !(surface.panel && id !== 'help' && id !== 'escape' && !panelActions.has(id)) &&
          !(surface.help && id !== 'help' && id !== 'escape'))) &&
      enabled();
    disposers.push(
      editor.commands.register('terminal', {
        id: commandId,
        canExecute: available,
        execute: () => {
          menu.close();
          keymap.clearPendingSequence();
          if (!dockActions.has(id) && id !== 'escape') surface.clearDockFocus();
          return runInput(run) ?? { handled: true, status: 'succeeded' };
        },
      })
    );
    disposers.push(
      editor.keymap.register('terminal', {
        id: commandId,
        label: id === 'inspector' ? 'Style' : undefined,
        shortcuts: keys,
        target: { type: 'command', id: commandId },
        scope: application ? 'application' : 'canvas',
        repeat: repeatable ? 'allow' : 'ignore',
        when: () => (application || id === 'help' || id === 'escape' || !surface.help) && enabled(),
      })
    );
  };
  const action = (
    id: TerminalAction,
    run: () => void | EditorCommandResult,
    enabled = () => true
  ) => bind(id, shortcuts[id].keys, run, enabled, shortcuts[id].repeatable);
  action(
    'feedback-details',
    () => {
      const notice = surface.footerNotice;
      if (notice) surface.onFeedbackAction?.(notice);
    },
    () => Boolean(surface.feedbackControl?.action)
  );
  for (const [id, direction] of [
    ['dock-next', 1],
    ['dock-previous', -1],
  ] as const)
    action(
      id,
      () => surface.moveDockFocus(direction),
      () => surface.focusableDockControls.length > 0
    );
  action(
    'dock-activate',
    () => surface.activateDock(),
    () => Boolean(surface.focusedDockControl)
  );
  const clipboardAction = (kind: 'copy' | 'cut' | 'paste', providedText?: string, ansi = false) => {
    if (inspector.clipboardAction(kind)) return;
    if (surface.panel) {
      workspaceControls?.clipboardAction(kind);
      return;
    }
    surface.settleGesture();
    const request = ++clipboardRequest;
    let result: ReturnType<typeof model.commands.copy>;
    if (providedText !== undefined) result = model.commands.pasteProvided(providedText);
    else if (kind === 'copy') result = model.commands.copy({ ansi, rich: !ansi });
    else result = model.commands[kind]();
    if (result.status === 'pending') {
      surface.feedback.show(() => copy.clipboardWorking, 'progress');
      void result.completion
        .then((completion) => {
          if (!active || request !== clipboardRequest) return;
          const data = completion.succeeded ? completion.data : undefined;
          if (!completion.succeeded) {
            const failures: Record<string, string> = {
              'stale-target': copy.clipboardStale,
              'prepare-failed': copy.pasteFailed,
            };
            surface.feedback.show(failures[completion.reason] ?? copy.clipboardFailed, 'error');
          } else if (data?.status === 'dispatched')
            surface.feedback.show(
              () => (kind === 'cut' ? copy.cutDispatched : copy.copyDispatched),
              'warning',
              kind === 'cut' ? () => surface.t('Copy is unconfirmed; selection kept.') : undefined
            );
          else if (data?.status === 'noop') surface.feedback.show(() => copy.clipboardEmpty);
          else
            surface.feedback.show(
              () => copy[kind === 'copy' ? 'copied' : kind === 'cut' ? 'cut' : 'pasted']
            );
          if (data?.status === 'applied' && data.warning === 'plain-fallback')
            surface.feedback.show(() => surface.t('Pasted as text'), 'warning');
          const diagnostics = model.getSnapshot().pasteDiagnostics;
          if (kind === 'paste' && completion.succeeded && diagnostics.length)
            surface.feedback.show(
              () => surface.t('Pasted with warnings'),
              'warning',
              diagnostics.map((item) => item.message).join('\n')
            );
          surface.requestRender();
        })
        .catch(() => {
          if (active && request === clipboardRequest) {
            surface.feedback.show(() => copy.clipboardFailed, 'error');
            surface.requestRender();
          }
        });
    } else if (result.status === 'rejected')
      surface.feedback.show(() => copy.clipboardFailed, 'error');
  };
  action('settings', () => {
    inspector.blur();
    workspaceControls?.dismiss();
    settingsDialog.open();
  });
  action('edit', () => surface.setTool('edit'));
  action('hand', () => surface.setTool('hand'));
  action(
    'inspector',
    () => inspector.toggle(),
    () => !surface.placement
  );
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
      'export',
      'sources',

      'navigation',
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
  for (const attribute of textAttributeNames)
    action(
      `format-${attribute}`,
      () => {
        const style = model.selectionStyle;
        if (style.attributes)
          return model.commands.style({
            kind: 'attributes',
            attributes: { [attribute]: style.attributes[attribute] !== 'on' },
          });
      },
      () => Boolean(!surface.placement && model.selectionStyle.attributes)
    );
  bind('escape', ['Escape'], () => {
    if (surface.clearDockFocus()) return;
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
      () => Boolean(inspector.colorInput || surface.panel || model.selection)
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
      surface.settleGesture();
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
      surface.feedback.show(() => copy.clipboardWorking, 'progress');
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
          surface.feedback.show(() => copy.pngCopied);
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
            surface.feedback.show(
              failures[reason] ?? (copying ? copy.clipboardFailed : copy.pngFailed),
              'error',
              reason === 'palette-unavailable'
                ? () => surface.t('Refresh terminal colors in Settings.')
                : undefined
            );
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
      if (inspector.clipboardAction('select-all')) return;
      if (surface.panel) {
        workspaceControls?.clipboardAction('select-all');
        return;
      }
      surface.cancelGesture();
      return model.commands.selectAll();
    },
    () => Boolean(inspector.colorInput || surface.panel || model.plane.getContentBounds())
  );
  for (const entry of navigationActions(model))
    action(entry.id, entry.run, () => !surface.placement);
  bind('delete', ['Delete'], () => model.commands.erase(), editOnly);
  bind('backspace', ['Backspace'], () => model.commands.deleteBackward(), editOnly);
  bind(
    'newline',
    ['Enter'],
    () => model.commands.insert('\n'),
    () => editOnly() && !surface.focusedDockControl
  );
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
        surface.settleGesture();
        return model.commands.navigate(x, y);
      },
      editOnly
    );
    bind(
      `extend-${name}`,
      [`Shift+${name}`],
      () => {
        surface.settleGesture();
        return model.commands.navigate(x, y, true);
      },
      editOnly
    );
    bind(
      `move-${name}`,
      [`Ctrl+${name}`],
      () => {
        surface.settleGesture();
        return model.commands.moveSelection(x, y);
      },
      editOnly
    );
  }
  editor.keymap.hydrateUserBindings(surface.settings.keybindings);
  disposers.push(
    editor.keymap.subscribe(() => surface.settings.setKeybindings(editor.keymap.getUserBindings()))
  );
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
        surface.clearDockFocus();
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
    if (key.eventType === 'repeat' && key.name === dockClosingKey) {
      consume();
      return;
    }
    dockClosingKey = null;
    // Resolve application bindings (including sequence prefixes) before modal input.
    // The keymap still owns dispatch, user overrides and repeat/release policy.
    const binding = bindings.resolveEvent(key);
    if (binding?.scope === 'application') return;
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
    if (inspector.key(key, binding?.id.replace(/^terminal\./, ''))) {
      consume();
      return;
    }
    if (!surface.panel && !surface.help) {
      const id = binding?.id.replace(/^terminal\./, '');
      if (surface.focusedDockControl) {
        if (id && dockKeys.has(id)) return;
        consume();
        return;
      }
      if (id && dockActions.has(id)) return;
    }
    if (
      surface.panel &&
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
    execute: (binding, key) => {
      if (
        surface.focusedDockControl &&
        (binding.id === 'terminal.dock-activate' || binding.id === 'terminal.escape')
      )
        dockClosingKey = key.name;
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
    if (
      !surface.help &&
      !surface.focusedDockControl &&
      surface.hasDocument &&
      surface.tool === 'edit' &&
      !key.ctrl &&
      !key.meta &&
      !key.super &&
      key.sequence &&
      !/\p{Cc}/u.test(key.sequence)
    ) {
      surface.settleGesture();
      runInput(() => model.commands.insert(key.sequence));
    }
    surface.requestRender();
  };
  const paste = (event: PasteEvent) => {
    menu.validate();
    if (settingsDialog.isOpen) {
      event.preventDefault();
      settingsDialog.paste(new TextDecoder().decode(event.bytes));
      return;
    }
    if (inspector.paste(new TextDecoder().decode(event.bytes))) {
      event.preventDefault();
      return;
    }
    if (menu.isOpen || surface.focusedDockControl) {
      event.preventDefault();
      return;
    }
    if (surface.help) return;
    event.preventDefault();
    if (surface.closing) return;
    if (workspaceControls?.paste(new TextDecoder().decode(event.bytes))) return;
    if (!surface.hasDocument) return;
    clipboardAction('paste', new TextDecoder().decode(event.bytes));
    surface.requestRender();
  };
  const keyrelease = (key: KeyEvent) => {
    surface.inputModifiers.update(key);
  };
  const cancelGesture = () => {
    menu.close();
    inspector.blur();
    surface.clearDockFocus();
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
    surface.clearDockFocus();
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

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { formatCellFrame } from '@chardesk/cell-core';
import { getGraphemeCellWidth } from '@chardesk/protocol';
import { parseCharDeskDocumentEnvelope } from '@chardesk/document';
import { CanvasFile, resolveCanvasFilePath } from './document.ts';
import type { ClipboardTextPreparation } from '@chardesk/editor-core/clipboard/commands';
import { TerminalSettingsStore, terminalSettingsPath } from './settings.ts';
import { createTextPreparation } from './text.ts';
import { parseOptions } from './options.ts';
import { TerminalWorkspace } from './workspace.ts';
import { WorkspacePersistence } from './persistence.ts';
import { messages } from './copy.ts';
import { attachInputTrace } from './inputTrace.ts';
import { terminalKeyboardOptions } from './inputModifiers.ts';
import {
  attachTerminalPolicy,
  resolveTerminalPolicy,
  terminalRendererEnvironment,
} from './terminalPolicy.ts';

const args = process.argv.slice(2);
if (args.slice(0, args.indexOf('--') < 0 ? args.length : args.indexOf('--')).includes('--help')) {
  console.log(
    'Terminal Unicode Canvas\n\nUsage: bun run start [files.chardesk…] [--blank] [--paste-mode auto|plain|ansi|markdown] [--workspace checkpoint.json] [--settings preferences.json] [--no-autosave] [--snapshot]\n\nF2 Edit; F3 Hand; F4 Minimap; Shift+F2 tools; Shift+F3 characters; Shift+F4 templates; F6 switch; F7 documents; F8 find; F9 anchors; F10 open; F11 settings; F12 save all; F1 help.\nAuto save and workspace recovery are enabled by default. Requires Bun >=1.3.14.'
  );
} else {
  let settings: TerminalSettingsStore | null = null;
  let workspace: TerminalWorkspace | null = null;
  let persistence: WorkspacePersistence | null = null;
  try {
    const options = parseOptions(args);
    if (!options.snapshot)
      settings = await TerminalSettingsStore.load(
        options.settingsPath ?? terminalSettingsPath(),
        options.pasteMode ? { pasteMode: options.pasteMode } : {}
      );
    const prepareText: ClipboardTextPreparation = (...args) =>
      createTextPreparation(settings?.values.pasteMode ?? options.pasteMode)(...args);
    const editorOptions = {
      prepareText,
      autoAnchors: true,
    };
    const first = options.files[0] ?? 'terminal-canvas.chardesk';
    const welcome = async () =>
      options.files.length || options.blank
        ? ''
        : parseCharDeskDocumentEnvelope(
            await readFile(new URL('../welcome.chardesk', import.meta.url), 'utf8')
          )!.body;
    if (options.snapshot) {
      const { model } = await CanvasFile.open(first, await welcome(), editorOptions);
      try {
        model.viewport = { x: 0, y: 0, width: 80, height: 24 };
        console.log(
          formatCellFrame(
            model.frame(),
            (cell) => ({ text: cell.char, width: getGraphemeCellWidth(cell.char) }),
            { trimEnd: true }
          )
        );
      } finally {
        model.dispose();
      }
    } else {
      if (!process.stdin.isTTY || !process.stdout.isTTY)
        throw new Error('Use an interactive terminal, or pass --snapshot.');
      const checkpointPath =
        options.workspacePath ?? `${await resolveCanvasFilePath(first)}.workspace.json`;
      const checkpoint = await resolveCanvasFilePath(checkpointPath);
      if (settings!.path === checkpoint || settings!.path === `${checkpoint}.lock`)
        throw new Error('Settings and workspace storage must use separate filenames.');
      persistence = await WorkspacePersistence.open(checkpointPath);
      const restored = await persistence.restore(editorOptions);
      workspace = restored ?? (await TerminalWorkspace.open(first, await welcome(), editorOptions));
      workspace.reservePaths([persistence.path, `${persistence.path}.lock`, settings!.path!]);
      for (const path of options.files.slice(restored ? 0 : 1)) {
        const canonical = await resolveCanvasFilePath(path);
        if (!workspace.files.some((file) => file.path === canonical))
          await workspace.openFile(path);
      }
      const { model } = workspace;
      const { createCliRenderer, RGBA, NativeSession } = await import('@opentui/core');
      const { CanvasSurface } = await import('./surface.ts');
      const { attachControls } = await import('./controller.ts');
      const { createTerminalClipboardPort } = await import('./clipboard.ts');
      const nativeSession = new NativeSession(process.stdout);
      const renderer = await createCliRenderer({
        nativeSession,
        environment: terminalRendererEnvironment(),
        screenMode: 'alternate-screen',
        useMouse: true,
        useKittyKeyboard: terminalKeyboardOptions(process.env.TERM_PROGRAM),
        exitOnCtrlC: false,
        backgroundColor: RGBA.defaultBackground(),
        consoleMode: 'disabled',
        openConsoleOnError: false,
      }).catch(async (error) => {
        nativeSession.dispose();
        await nativeSession.closed.catch(() => {});
        throw error;
      });
      const clipboard = createTerminalClipboardPort(renderer);
      let detachTrace = () => {};
      let detachPolicy = () => {};
      let detach = () => {},
        discard = false,
        closing = false;
      const onSignal = () => renderer.destroy();
      try {
        const copy = messages;
        const surface = new CanvasSurface(
          renderer,
          model,
          basename(workspace.active.path),
          process.platform,
          !restored,
          resolveTerminalPolicy(process.env, renderer.capabilities),
          settings!
        );
        renderer.root.add(surface);
        detachPolicy = attachTerminalPolicy(
          renderer,
          (bytes) => nativeSession.write(bytes),
          (policy) => surface.setInputPolicy(policy)
        );
        const quit = () => {
          if (closing) return;
          closing = true;
          discard = workspace!.dirty;
          surface.closing = true;
          surface.status = copy.closing;
          surface.requestRender();
          void persistence!
            .close(discard)
            .then(() => renderer.destroy())
            .catch((error) => {
              closing = false;
              surface.closing = false;
              surface.status = String(error.message ?? error);
              surface.requestRender();
            });
        };
        detach = attachControls(surface, workspace.active, quit, clipboard, workspace);
        if (process.env.CHARDESK_TRACE_INPUT)
          detachTrace = attachInputTrace(surface, process.env.CHARDESK_TRACE_INPUT);
        if (restored)
          surface.status = persistence.conflicts.length
            ? `${copy.recoveryConflict}: ${persistence.conflicts.join(', ')}`
            : copy.recovered;
        persistence.start(workspace, {
          autosaveMs: options.autosave ? 800 : -1,
          onStatus: (status) => {
            surface.backgroundStatus =
              status.phase === 'error'
                ? (status.message ?? '')
                : status.phase === 'saving'
                  ? copy.autosaving
                  : copy.autosaved;
            if (status.phase === 'error') surface.status = surface.backgroundStatus;
            surface.requestRender();
          },
        });
        renderer.on('render:error', (event: { error: unknown }) => {
          process.stderr.write(`Render failed: ${String(event.error)}\n`);
          process.exitCode = 1;
          renderer.destroy();
        });
        process.once('SIGTERM', onSignal);
        process.once('SIGINT', onSignal);
        await renderer.closed;
      } finally {
        process.off('SIGTERM', onSignal);
        process.off('SIGINT', onSignal);
        detachTrace();
        detachPolicy();
        detach();
        await clipboard.dispose();
        renderer.destroy();
        await renderer.closed;
        await persistence.close(discard);
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await settings?.flush();
    await persistence?.abandon();
    workspace?.dispose();
  }
}

import {
  initializeCanvasTesting,
  testingCanvasRuntime,
} from '@/domains/canvas/testing';
import { createSelectionCommandFactory, createEditorCommandsExtension } from '@/domains/actions/public';
import {
  configureTextRenderingRuntimeFallbackForTesting,
  createTextRenderingRuntime,
  parseDocumentSessionSource,
} from '@/domains/document/public';
import { configureCanvasRuntimeFallbackForTesting } from '@/domains/canvas/react';
import { createCollaborationRuntime } from '@/domains/collaboration/public';
import { configureCollaborationRuntimeFallbackForTesting } from '@/domains/collaboration/react';
import { configureEditorRuntimeFallbackForTesting } from '@/domains/editor/react';
import {
  createCanvasEditorExtension,
  createCanvasEditorRuntime,
} from '@/domains/editor/public';
import { CanvasEngineRuntime } from '@/widgets/canvas-editor/engine/CanvasEngineRuntime';
import { configureCanvasEngineRuntimeFallbackForTesting } from '@/widgets/canvas-editor/engine/useCanvasEngineRuntime';

if (typeof globalThis.ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

const textRendering = createTextRenderingRuntime();

initializeCanvasTesting({
  selectionCommands: createSelectionCommandFactory({
    renderClipboardText: textRendering.renderCompact,
  }),
  parseSessionSource: parseDocumentSessionSource,
});
configureCanvasRuntimeFallbackForTesting(testingCanvasRuntime);
configureTextRenderingRuntimeFallbackForTesting(textRendering);

const editor = createCanvasEditorRuntime({
  state: {
    get: testingCanvasRuntime.getState,
    subscribe: testingCanvasRuntime.subscribe,
  },
  history: testingCanvasRuntime.commands.history,
  transactions: { run: testingCanvasRuntime.commands.history.transact },
  onToolChange: testingCanvasRuntime.commands.tools.set,
});
editor
  .registerExtension(createCanvasEditorExtension(editor.interactionPort))
  .registerExtension(createEditorCommandsExtension(testingCanvasRuntime))
  .start(editor.getState().tool);
configureEditorRuntimeFallbackForTesting(editor);

const collaboration = createCollaborationRuntime();
configureCollaborationRuntimeFallbackForTesting(collaboration);

const engine = new CanvasEngineRuntime({
  getViewport: () => {
    return testingCanvasRuntime.viewport.getSnapshot();
  },
  setViewport: testingCanvasRuntime.commands.viewport.setViewport,
});
configureCanvasEngineRuntimeFallbackForTesting(engine);

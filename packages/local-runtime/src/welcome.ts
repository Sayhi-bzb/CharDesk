import { buildDefaultDemoGrid } from '@chardesk/canvas-templates/welcome';
import type { CanvasDocumentDraft } from '@chardesk/editor-core/canvasDocumentModel';
import { serializeCanvasDocument } from '@chardesk/editor-core/documentText';

export function createWelcomeDocument(): CanvasDocumentDraft {
  return {
    id: 'welcome',
    mode: 'freeform',
    activePageId: 'welcome:main',
    pages: [{ id: 'welcome:main', kind: 'cell-plane', grid: buildDefaultDemoGrid() }],
  };
}
export const createWelcomeSource = () =>
  serializeCanvasDocument(createWelcomeDocument(), 'Welcome');

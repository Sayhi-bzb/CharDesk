import type { EditorState } from '../interfaces';
import type { CanvasSessionDescriptor } from '@/domains/sessions/public';
import type { CanvasMode } from '@/domains/sessions/public';
import { isToolAllowedForMode, type ToolType } from '../../model/tool';
import { MIN_ZOOM, MAX_ZOOM } from '@/shared/lib/constants';
import { normalizeSessionMode } from '@/domains/sessions/public';
import type { CanvasDocumentRegistry } from '../CanvasDocumentRegistry';
import {
  materializeSlideDeckContent,
  readSlideDeckDescriptor,
} from '../slideDocumentPages';

export const DEFAULT_SESSION_ID = 'canvas-1';
export const DEFAULT_SESSION_NAME = 'Welcome';
export const DEFAULT_MODE = 'freeform' as const satisfies CanvasMode;
const DEFAULT_VIEWPORT = { offset: { x: 0, y: 0 }, zoom: 1 };
export const getSessionCanvasDocumentId = (
  session: CanvasSessionDescriptor
) =>
  session.id;

const normalizeSessionViewport = (
  viewport: CanvasSessionDescriptor['viewport'] | undefined
) => {
  if (!viewport) return null;
  const x = Number.isFinite(viewport.offset?.x) ? viewport.offset.x : DEFAULT_VIEWPORT.offset.x;
  const y = Number.isFinite(viewport.offset?.y) ? viewport.offset.y : DEFAULT_VIEWPORT.offset.y;
  const rawZoom = Number.isFinite(viewport.zoom) ? viewport.zoom : DEFAULT_VIEWPORT.zoom;
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawZoom));
  return { offset: { x, y }, zoom };
};

const FALLBACK_TOOL: ToolType = 'brush';

export const buildSessionSnapshot = (
  state: EditorState,
  documents: CanvasDocumentRegistry
) => {
  const viewport = normalizeSessionViewport(
    state.canvasSessions.find((session) => session.id === state.activeCanvasId)?.viewport
  ) ?? DEFAULT_VIEWPORT;
  if (state.canvasMode === 'slide') {
    if (!state.slideDeck) {
      throw new Error('Active slide session has no deck projection');
    }
    return {
      mode: 'slide' as const,
      slideDeck: materializeSlideDeckContent(
        documents,
        state.activeCanvasId,
        state.slideDeck
      ),
      viewport,
    };
  }
  return {
    mode: 'freeform' as const,
    grid: Array.from(state.contentSurface.reader.materialize()),
    viewport,
  };
};

export const resolveSessionDescriptorRuntime = (
  session: CanvasSessionDescriptor,
  currentTool: ToolType
) => {
  const nextMode = normalizeSessionMode(session.mode);
  const viewport = normalizeSessionViewport(session.viewport);
  const nextOffset = viewport?.offset ?? DEFAULT_VIEWPORT.offset;
  const nextZoom = viewport?.zoom ?? DEFAULT_VIEWPORT.zoom;

  return {
    nextMode,
    nextTool: isToolAllowedForMode(currentTool, nextMode)
      ? currentTool
      : FALLBACK_TOOL,
    nextOffset,
    nextZoom,
  };
};

export const resolveSessionDocumentRuntime = (
  documents: CanvasDocumentRegistry,
  session: CanvasSessionDescriptor,
  currentTool: ToolType
) => {
  const runtime = resolveSessionDescriptorRuntime(session, currentTool);
  return {
    ...runtime,
    nextSlideDeck:
      session.mode === 'slide'
        ? readSlideDeckDescriptor(documents, session.id)
        : null,
  };
};

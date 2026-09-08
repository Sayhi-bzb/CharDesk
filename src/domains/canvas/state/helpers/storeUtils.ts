import type { EditorState } from '../interfaces';
import type { CanvasSession } from '@/domains/sessions/public';
import type { CanvasMode } from '@/domains/sessions/public';
import { isToolAllowedForMode, type ToolType } from '../../model/tool';
import type {
  StructuredComponentInstance,
  StructuredNode,
} from '@/domains/structured-content/public';
import { MIN_ZOOM, MAX_ZOOM } from '@/shared/lib/constants';
import { normalizeSessionMode } from '@/domains/sessions/public';
import {
  createSlideDeck,
  normalizeSlideDeck,
  updateSlideGrid,
  type SlideDeck,
} from '@/domains/slides/public';

const serializeContentSurface = (state: EditorState) =>
  Array.from(state.contentSurface.reader.materialize());

export const DEFAULT_SESSION_ID = 'canvas-1';
export const DEFAULT_SESSION_NAME = 'Welcome';
export const DEFAULT_STRUCTURED_SESSION_ID = 'canvas-2';
export const DEFAULT_STRUCTURED_SESSION_NAME = 'Canvas 2';
export const DEFAULT_MODE = 'freeform' as const satisfies CanvasMode;
const DEFAULT_VIEWPORT = { offset: { x: 0, y: 0 }, zoom: 1 };
export const stripSlideDeckContent = (deck: SlideDeck): SlideDeck => ({
  ...deck,
  slides: deck.slides.map((slide) => ({ ...slide, grid: [] })),
});

export const stripSessionContent = (
  session: CanvasSession
): CanvasSession =>
  session.mode === 'slide'
    ? { ...session, slideDeck: stripSlideDeckContent(session.slideDeck) }
    : { ...session, grid: [], scene: [], components: [] };
export const getSessionCanvasDocumentId = (
  session: CanvasSession
) =>
  session.id;

const normalizeSessionViewport = (viewport: CanvasSession['viewport'] | undefined) => {
  if (!viewport) return null;
  const x = Number.isFinite(viewport.offset?.x) ? viewport.offset.x : DEFAULT_VIEWPORT.offset.x;
  const y = Number.isFinite(viewport.offset?.y) ? viewport.offset.y : DEFAULT_VIEWPORT.offset.y;
  const rawZoom = Number.isFinite(viewport.zoom) ? viewport.zoom : DEFAULT_VIEWPORT.zoom;
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawZoom));
  return { offset: { x, y }, zoom };
};

const getFallbackToolForMode = (mode: CanvasMode): ToolType => {
  return mode === 'structured' ? 'select' : 'brush';
};

export const buildSessionSnapshot = (state: EditorState) => {
  if (state.canvasMode === 'slide') {
    const deck =
      state.slideDeck ??
      createSlideDeck({
        initialSlideId: `${state.activeCanvasId}-slide-1`,
      });
    return {
      mode: 'slide' as const,
      slideDeck: updateSlideGrid(deck, deck.activeSlideId, serializeContentSurface(state)),
      viewport: { offset: { ...state.offset }, zoom: state.zoom },
    };
  }
  if (state.canvasMode === 'structured') {
    return {
      mode: 'structured' as const,
      scene: state.structuredScene,
      components: state.structuredComponents,
      grid: [],
      viewport: { offset: { ...state.offset }, zoom: state.zoom },
    };
  }

  return {
    mode: 'freeform' as const,
    scene: [] as StructuredNode[],
    components: [] as StructuredComponentInstance[],
    grid: serializeContentSurface(state),
    viewport: { offset: { ...state.offset }, zoom: state.zoom },
  };
};

export const resolveSessionRuntime = (session: CanvasSession, currentTool: ToolType) => {
  const nextMode = normalizeSessionMode(session.mode);
  const viewport = normalizeSessionViewport(session.viewport);
  const nextOffset = viewport?.offset ?? DEFAULT_VIEWPORT.offset;
  const nextZoom = viewport?.zoom ?? DEFAULT_VIEWPORT.zoom;

  const nextSlideDeck: SlideDeck | null =
    nextMode === 'slide' && session.mode === 'slide'
      ? normalizeSlideDeck(session.slideDeck, `${session.id}-slide-1`)
      : null;
  // CanvasSession values are normalized at restore/import boundaries and kept in
  // sync by the active document projector. Preserve their identities here so a
  // session switch does not invalidate structured projection caches.
  const nextScene = nextMode === 'structured' && session.mode === 'structured'
    ? session.scene
    : [];
  const nextComponents =
    nextMode === 'structured' && session.mode === 'structured'
      ? (session.components ?? [])
      : [];
  let nextGridEntries: CanvasSession['grid'];
  if (nextMode === 'structured') {
    const structuredGrid = session.mode === 'structured' ? session.grid : [];
    // Scene is authoritative. Keep an existing legacy grid readable, but never
    // synthesize and retain a second full representation of structured content.
    nextGridEntries = structuredGrid;
  } else if (nextMode === 'slide' && nextSlideDeck) {
    nextGridEntries =
      nextSlideDeck.slides.find(
        (slide) => slide.id === nextSlideDeck.activeSlideId
      )?.grid ?? [];
  } else {
    nextGridEntries = session.mode === 'freeform' || session.mode === 'structured'
      ? session.grid
      : [];
  }

  return {
    nextMode,
    nextSlideDeck,
    nextScene,
    nextComponents,
    nextGridEntries,
    nextTool: isToolAllowedForMode(currentTool, nextMode)
      ? currentTool
      : getFallbackToolForMode(nextMode),
    nextOffset,
    nextZoom,
  };
};

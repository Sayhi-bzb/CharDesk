import type { CanvasSession } from "@/domains/sessions/public";
import type { SlideDeck } from "@/domains/slides/public";
import type { GridCell } from "@/shared/types";
import type { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";

/** Slide metadata lives in the deck; the Canvas document owns each page. */

export const replaceSlideDeckSession = (
  sessions: CanvasSession[],
  sessionId: string,
  slideDeck: SlideDeck
) =>
  sessions.map((session): CanvasSession =>
    session.id === sessionId && session.mode === "slide"
      ? { ...session, slideDeck }
      : session
  );

export const activateSlidePage = (
  documents: CanvasDocumentRegistry,
  sessionId: string,
  slideId: string,
  grid: [string, GridCell][]
) => {
  if (!documents.getDocument(sessionId)) {
    documents.activateDocument(sessionId, {
      mode: "slide",
      activePageId: slideId,
      pages: [{ id: slideId, kind: "cell-plane", grid }],
      grid: [],
      scene: [],
      components: [],
    });
  } else {
    documents.ensurePage(
      sessionId,
      { id: slideId, kind: "cell-plane", grid },
      { activate: true }
    );
  }
  documents.activatePage(sessionId, slideId);
  return documents.getContentReader(sessionId, slideId)!;
};

export const readSlideGrid = (
  documents: CanvasDocumentRegistry,
  sessionId: string,
  slideId: string,
  fallback: [string, GridCell][] = []
) => {
  const reader = documents.getContentReader(sessionId, slideId);
  return reader ? Array.from(reader.materialize()) : fallback;
};

export const materializeSlideDeckContent = (
  documents: CanvasDocumentRegistry,
  sessionId: string,
  deck: SlideDeck
): SlideDeck => ({
  ...deck,
  slides: deck.slides.map((slide) => ({
    ...slide,
    grid: readSlideGrid(documents, sessionId, slide.id, slide.grid),
  })),
});

export const resetSlidePage = (
  documents: CanvasDocumentRegistry,
  sessionId: string,
  slideId: string,
  grid: [string, GridCell][]
) => {
  if (!documents.replacePage(sessionId, {
    id: slideId,
    kind: "cell-plane",
    grid,
  })) {
    documents.ensurePage(sessionId, {
      id: slideId,
      kind: "cell-plane",
      grid,
    });
  }
};

export const ensureSlidePage = (
  documents: CanvasDocumentRegistry,
  sessionId: string,
  slideId: string,
  grid: [string, GridCell][]
) => {
  if (documents.getContentReader(sessionId, slideId)) return;
  documents.ensurePage(sessionId, {
    id: slideId,
    kind: "cell-plane",
    grid,
  });
};

export const removeSlidePage = (
  documents: CanvasDocumentRegistry,
  sessionId: string,
  slideId: string
) => documents.removePage(sessionId, slideId);

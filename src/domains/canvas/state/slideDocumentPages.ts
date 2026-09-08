import {
  DEFAULT_SLIDE_SIZE,
  type SlideDeckDescriptor,
  type SlideDeckSnapshot,
} from "@/domains/slides/public";
import type { GridCell } from "@/shared/types";
import type { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";

/** Slide metadata and content live in the Canvas document; the deck is a projection. */

export const readSlideDeckDescriptor = (
  documents: CanvasDocumentRegistry,
  sessionId: string
): SlideDeckDescriptor | null => {
  const address = documents.getDocumentAddress(sessionId);
  if (!address) return null;
  const slides = documents.getPageDescriptors(sessionId).map((page, index) => ({
    id: page.id,
    name: page.name?.trim() || `Slide ${index + 1}`,
    size: page.size ?? { ...DEFAULT_SLIDE_SIZE },
  }));
  if (slides.length === 0) return null;
  return { slides, activeSlideId: address.pageId };
};

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
  deck: SlideDeckDescriptor
): SlideDeckSnapshot => ({
  ...deck,
  slides: deck.slides.map((slide) => ({
    ...slide,
    grid: readSlideGrid(documents, sessionId, slide.id),
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

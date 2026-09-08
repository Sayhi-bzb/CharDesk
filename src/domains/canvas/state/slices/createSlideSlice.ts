import type { StateCreator } from "zustand";
import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import {
  activateSlide as activateDeckSlide,
  addSlideDescriptor as addDeckSlide,
  createSlideId,
  duplicateSlideDescriptor as duplicateDeckSlide,
  moveSlide as moveDeckSlide,
  removeSlide as removeDeckSlide,
  renameSlide as renameDeckSlide,
  resizeSlide as resizeDeckSnapshot,
  resizeSlideDescriptor as resizeDeckSlide,
  getSlideResizeCropCount,
} from "@/domains/slides/public";
import type { EditorState, SlideSlice } from "../interfaces";
import { createSlideActivationPatch } from "../transitions/editorTransitions";
import {
  activateSlidePage,
  ensureSlidePage,
  readSlideGrid,
  removeSlidePage,
  resetSlidePage,
} from "../slideDocumentPages";

export const createSlideSlice = (
  documents: CanvasDocumentRegistry
): StateCreator<
  EditorState,
  [],
  [],
  SlideSlice
> => (set, get) => ({
  slideDeck: null,

  addSlide: () => {
    const state = get();
    if (state.canvasMode !== "slide" || !state.slideDeck) return;
    const next = addDeckSlide(state.slideDeck, {
      id: createSlideId(state.slideDeck.slides),
    });
    const active = next.slides.find((slide) => slide.id === next.activeSlideId);
    if (!active) return;
    const activeGrid = activateSlidePage(
      documents,
      state.activeCanvasId,
      active.id,
      []
    );
    documents.updatePage(state.activeCanvasId, active.id, {
      name: active.name,
      size: active.size,
    });
    set(createSlideActivationPatch(next, activeGrid));
  },

  duplicateSlide: (slideId) => {
    const state = get();
    if (state.canvasMode !== "slide" || !state.slideDeck) return;
    const source = state.slideDeck.slides.find((slide) => slide.id === slideId);
    if (!source) return;
    const sourceGrid = readSlideGrid(
      documents,
      state.activeCanvasId,
      slideId,
      []
    );
    const next = duplicateDeckSlide(state.slideDeck, {
      sourceSlideId: slideId,
      id: createSlideId(state.slideDeck.slides),
    });
    if (next === state.slideDeck) return;
    const active = next.slides.find((slide) => slide.id === next.activeSlideId);
    if (!active) return;
    const activeGrid = activateSlidePage(
      documents,
      state.activeCanvasId,
      active.id,
      sourceGrid
    );
    documents.updatePage(state.activeCanvasId, active.id, {
      name: active.name,
      size: active.size,
    });
    set(createSlideActivationPatch(next, activeGrid));
  },

  removeSlide: (slideId) => {
    const state = get();
    if (state.canvasMode !== "slide" || !state.slideDeck) return;
    const next = removeDeckSlide(state.slideDeck, slideId);
    if (next === state.slideDeck) return;
    const active = next.slides.find((slide) => slide.id === next.activeSlideId);
    if (!active) return;
    const activeGrid = activateSlidePage(
      documents,
      state.activeCanvasId,
      active.id,
      []
    );
    set(createSlideActivationPatch(next, activeGrid));
    removeSlidePage(documents, state.activeCanvasId, slideId);
  },

  renameSlide: (slideId, name) => {
    const state = get();
    if (state.canvasMode !== "slide" || !state.slideDeck) return;
    const next = renameDeckSlide(state.slideDeck, slideId, name);
    if (next === state.slideDeck) return;
    documents.updatePage(state.activeCanvasId, slideId, { name });
    set({
      slideDeck: next,
    });
  },

  moveSlide: (slideId, targetIndex) => {
    const state = get();
    if (state.canvasMode !== "slide" || !state.slideDeck) return;
    const next = moveDeckSlide(state.slideDeck, slideId, targetIndex);
    if (next === state.slideDeck) return;
    documents.reorderPages(
      state.activeCanvasId,
      next.slides.map((slide) => slide.id)
    );
    set({
      slideDeck: next,
    });
  },

  activateSlide: (slideId) => {
    const state = get();
    if (
      state.canvasMode !== "slide" ||
      !state.slideDeck ||
      state.slideDeck.activeSlideId === slideId
    ) {
      return;
    }
    const next = activateDeckSlide(state.slideDeck, slideId);
    if (next === state.slideDeck) return;
    const active = next.slides.find((slide) => slide.id === slideId);
    if (!active) return;
    const activeGrid = activateSlidePage(
      documents,
      state.activeCanvasId,
      active.id,
      []
    );
    set(createSlideActivationPatch(next, activeGrid));
  },

  resizeSlide: (slideId, size) => {
    const state = get();
    if (state.canvasMode !== "slide" || !state.slideDeck) return;
    const source = state.slideDeck.slides.find((slide) => slide.id === slideId);
    if (!source) return;
    const sourceWithGrid = {
      ...source,
      grid: readSlideGrid(
        documents,
        state.activeCanvasId,
        slideId,
        []
      ),
    };
    const cropCount = getSlideResizeCropCount(sourceWithGrid, size);
    const contentNext = resizeDeckSnapshot(
      { slides: [sourceWithGrid], activeSlideId: slideId },
      slideId,
      size
    );
    const next = resizeDeckSlide(state.slideDeck, slideId, size);
    if (next === state.slideDeck) return;
    const resizedContent = contentNext.slides[0];
    const active = next.slides.find((slide) => slide.id === next.activeSlideId);
    if (!active || !resizedContent) return;
    documents.updatePage(state.activeCanvasId, slideId, { size });

    if (cropCount > 0) {
      resetSlidePage(
        documents,
        state.activeCanvasId,
        resizedContent.id,
        resizedContent.grid
      );
    } else {
      ensureSlidePage(
        documents,
        state.activeCanvasId,
        resizedContent.id,
        resizedContent.grid
      );
    }

    if (slideId === next.activeSlideId) {
      const activeGrid = activateSlidePage(
        documents,
        state.activeCanvasId,
        active.id,
        resizedContent.grid
      );
      set(createSlideActivationPatch(next, activeGrid));
      return;
    }
    set({
      slideDeck: next,
    });
  },
});

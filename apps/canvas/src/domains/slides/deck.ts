import type { GridCell } from "@/shared/types";
import { createEntityId } from "@/shared/utils/id";
import { normalizeSlideGridEntries } from "./grid";
import {
  DEFAULT_SLIDE_SIZE,
  type SlideDeckDescriptor,
  type SlideSnapshot,
  type SlideDeckSnapshot,
  type SlideDescriptor,
  type SlideSize,
} from "./model";
import { isValidSlideSize } from "./grid";

type CreateSlideDeckInput = {
  initialSlideId: string;
  initialSlideName?: string;
  initialGrid?: ReadonlyArray<readonly [string, GridCell]>;
  size?: SlideSize;
};

type AddSlideInput = {
  id: string;
  name?: string;
  grid?: ReadonlyArray<readonly [string, GridCell]>;
  size?: SlideSize;
  afterSlideId?: string;
};

type AddSlideDescriptorInput = Omit<AddSlideInput, "grid">;

type DuplicateSlideInput = {
  sourceSlideId: string;
  id: string;
  name?: string;
};

const hasUsableId = (id: string) => id.trim().length > 0;

const hasSlide = (deck: SlideDeckDescriptor, id: string) =>
  deck.slides.some((slide) => slide.id === id);

export const createSlideId = (slides: readonly SlideDescriptor[]) => {
  const existing = new Set(slides.map((slide) => slide.id));
  let candidate = "";
  do {
    candidate = createEntityId("slide");
  } while (existing.has(candidate));
  return candidate;
};

export const resolveNextSlideName = (slides: readonly SlideDescriptor[]) => {
  let maxIndex = 0;
  slides.forEach((slide) => {
    const match = slide.name.match(/^Slide\s+(\d+)$/i);
    if (!match) return;
    maxIndex = Math.max(maxIndex, Number(match[1]));
  });
  return `Slide ${maxIndex + 1}`;
};

const resolveName = (name: string | undefined, fallback: string) => {
  const trimmed = name?.trim();
  return trimmed || fallback;
};

export const createSlideDeck = ({
  initialSlideId,
  initialSlideName,
  initialGrid = [],
  size = DEFAULT_SLIDE_SIZE,
}: CreateSlideDeckInput): SlideDeckSnapshot => {
  if (!hasUsableId(initialSlideId)) {
    throw new Error("A slide deck requires a non-empty initial slide ID");
  }
  if (!isValidSlideSize(size)) {
    throw new RangeError("Slide size must use positive integer columns and rows");
  }

  const normalizedSize = { ...size };
  const initialSlide: SlideSnapshot = {
    id: initialSlideId,
    name: resolveName(initialSlideName, "Slide 1"),
    size: normalizedSize,
    grid: normalizeSlideGridEntries(initialGrid, normalizedSize),
  };
  return {
    slides: [initialSlide],
    activeSlideId: initialSlide.id,
  };
};

export const createSlideDeckDescriptor = ({
  initialSlideId,
  initialSlideName,
  size = DEFAULT_SLIDE_SIZE,
}: Omit<CreateSlideDeckInput, "initialGrid">): SlideDeckDescriptor => {
  const snapshot = createSlideDeck({ initialSlideId, initialSlideName, size });
  return {
    activeSlideId: snapshot.activeSlideId,
    slides: snapshot.slides.map(({ id, name, size }) => ({ id, name, size })),
  };
};

export const toSlideDeckDescriptor = (
  deck: SlideDeckSnapshot
): SlideDeckDescriptor => ({
  activeSlideId: deck.activeSlideId,
  slides: deck.slides.map(({ id, name, size }) => ({ id, name, size })),
});

export const addSlideDescriptor = (
  deck: SlideDeckDescriptor,
  input: AddSlideDescriptorInput
): SlideDeckDescriptor => {
  if (!hasUsableId(input.id) || deck.slides.some((slide) => slide.id === input.id)) {
    return deck;
  }
  const afterSlideId = input.afterSlideId ?? deck.activeSlideId;
  const afterIndex = deck.slides.findIndex((slide) => slide.id === afterSlideId);
  if (afterIndex < 0) return deck;
  const size = input.size ?? deck.slides[afterIndex].size;
  if (!isValidSlideSize(size)) return deck;
  const slide: SlideDescriptor = {
    id: input.id,
    name: resolveName(input.name, resolveNextSlideName(deck.slides)),
    size: { ...size },
  };
  const slides = [...deck.slides];
  slides.splice(afterIndex + 1, 0, slide);
  return { slides, activeSlideId: slide.id };
};

export const duplicateSlideDescriptor = (
  deck: SlideDeckDescriptor,
  input: DuplicateSlideInput
): SlideDeckDescriptor => {
  const source = deck.slides.find((slide) => slide.id === input.sourceSlideId);
  if (!source) return deck;
  return addSlideDescriptor(deck, {
    id: input.id,
    name: input.name,
    size: source.size,
    afterSlideId: source.id,
  });
};

export const resizeSlideDescriptor = (
  deck: SlideDeckDescriptor,
  slideId: string,
  size: SlideSize
): SlideDeckDescriptor => {
  if (!isValidSlideSize(size)) return deck;
  const target = deck.slides.find((slide) => slide.id === slideId);
  if (!target) return deck;
  if (target.size.columns === size.columns && target.size.rows === size.rows) {
    return deck;
  }
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.id === slideId ? { ...slide, size: { ...size } } : slide
    ),
  };
};

export const addSlide = (deck: SlideDeckSnapshot, input: AddSlideInput): SlideDeckSnapshot => {
  if (!hasUsableId(input.id) || hasSlide(deck, input.id)) return deck;
  const afterSlideId = input.afterSlideId ?? deck.activeSlideId;
  const afterIndex = deck.slides.findIndex((slide) => slide.id === afterSlideId);
  if (afterIndex < 0) return deck;
  const size = input.size ?? deck.slides[afterIndex].size;
  if (!isValidSlideSize(size)) return deck;

  const slide: SlideSnapshot = {
    id: input.id,
    name: resolveName(input.name, resolveNextSlideName(deck.slides)),
    size: { ...size },
    grid: normalizeSlideGridEntries(input.grid ?? [], size),
  };
  const slides = [...deck.slides];
  slides.splice(afterIndex + 1, 0, slide);
  return { ...deck, slides, activeSlideId: slide.id };
};

export const duplicateSlide = (
  deck: SlideDeckSnapshot,
  input: DuplicateSlideInput
): SlideDeckSnapshot => {
  const source = deck.slides.find((slide) => slide.id === input.sourceSlideId);
  if (!source) return deck;
  return addSlide(deck, {
    id: input.id,
    name: input.name,
    grid: source.grid,
    size: source.size,
    afterSlideId: source.id,
  });
};

export const removeSlide = <Deck extends SlideDeckDescriptor>(
  deck: Deck,
  slideId: string
): Deck => {
  if (deck.slides.length <= 1) return deck;
  const removeIndex = deck.slides.findIndex((slide) => slide.id === slideId);
  if (removeIndex < 0) return deck;

  const slides = deck.slides.filter((slide) => slide.id !== slideId);
  if (deck.activeSlideId !== slideId) return { ...deck, slides } as Deck;
  const fallbackIndex = removeIndex === 0 ? 0 : removeIndex - 1;
  return { ...deck, slides, activeSlideId: slides[fallbackIndex].id } as Deck;
};

export const renameSlide = <Deck extends SlideDeckDescriptor>(
  deck: Deck,
  slideId: string,
  name: string
): Deck => {
  const trimmed = name.trim();
  if (!trimmed || !hasSlide(deck, slideId)) return deck;
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.id === slideId ? { ...slide, name: trimmed } : slide
    ),
  } as Deck;
};

export const activateSlide = <Deck extends SlideDeckDescriptor>(
  deck: Deck,
  slideId: string
): Deck =>
  hasSlide(deck, slideId) ? ({ ...deck, activeSlideId: slideId } as Deck) : deck;

export const moveSlide = <Deck extends SlideDeckDescriptor>(
  deck: Deck,
  slideId: string,
  targetIndex: number
): Deck => {
  const sourceIndex = deck.slides.findIndex((slide) => slide.id === slideId);
  if (sourceIndex < 0 || !Number.isFinite(targetIndex)) return deck;
  const clampedIndex = Math.min(
    deck.slides.length - 1,
    Math.max(0, Math.trunc(targetIndex))
  );
  if (sourceIndex === clampedIndex) return deck;

  const slides = [...deck.slides];
  const [slide] = slides.splice(sourceIndex, 1);
  slides.splice(clampedIndex, 0, slide);
  return { ...deck, slides } as Deck;
};

export const updateSlideGrid = (
  deck: SlideDeckSnapshot,
  slideId: string,
  grid: ReadonlyArray<readonly [string, GridCell]>
): SlideDeckSnapshot => {
  const target = deck.slides.find((slide) => slide.id === slideId);
  if (!target) return deck;
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.id === slideId
        ? { ...slide, grid: normalizeSlideGridEntries(grid, target.size) }
        : slide
    ),
  };
};

export const getSlideResizeCropCount = (
  slide: SlideSnapshot,
  size: SlideSize
) => {
  if (!isValidSlideSize(size)) return 0;
  return slide.grid.length - normalizeSlideGridEntries(slide.grid, size).length;
};

export const resizeSlide = (
  deck: SlideDeckSnapshot,
  slideId: string,
  size: SlideSize
): SlideDeckSnapshot => {
  if (!isValidSlideSize(size)) return deck;
  const target = deck.slides.find((slide) => slide.id === slideId);
  if (!target) return deck;
  if (
    target.size.columns === size.columns &&
    target.size.rows === size.rows
  ) {
    return deck;
  }
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.id === slideId
        ? {
            ...slide,
            size: { ...size },
            grid: normalizeSlideGridEntries(slide.grid, size),
          }
        : slide
    ),
  };
};

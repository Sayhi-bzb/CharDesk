import type { GridCell } from "@/shared/types";
import { createSlideDeck } from "./deck";
import { isValidSlideSize, normalizeSlideGridEntries } from "./grid";
import {
  DEFAULT_SLIDE_SIZE,
  type SlideSnapshot,
  type SlideDeckSnapshot,
  type SlideSize,
} from "./model";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeSize = (value: unknown): SlideSize | null => {
  if (!isRecord(value)) return null;
  const size = { columns: value.columns, rows: value.rows };
  return typeof size.columns === "number" &&
    typeof size.rows === "number" &&
    isValidSlideSize(size as SlideSize)
    ? (size as SlideSize)
    : null;
};

const normalizeSlide = (value: unknown, fallbackSize: SlideSize): SlideSnapshot | null => {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
    return null;
  }
  const size = normalizeSize(value.size) ?? fallbackSize;
  const rawGrid = Array.isArray(value.grid)
    ? (value.grid as Array<readonly [string, GridCell]>)
    : [];
  return {
    id: value.id,
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : "Slide",
    size: { ...size },
    grid: normalizeSlideGridEntries(rawGrid, size),
  };
};

export const normalizeSlideDeckSnapshot = (
  value: unknown,
  fallbackSlideId: string
): SlideDeckSnapshot => {
  if (!isRecord(value)) {
    return createSlideDeck({ initialSlideId: fallbackSlideId });
  }
  const legacySize = normalizeSize(value.size) ?? DEFAULT_SLIDE_SIZE;

  const seen = new Set<string>();
  const slides = (Array.isArray(value.slides) ? value.slides : [])
    .map((slide) => normalizeSlide(slide, legacySize))
    .filter((slide): slide is SlideSnapshot => {
      if (!slide || seen.has(slide.id)) return false;
      seen.add(slide.id);
      return true;
    });
  if (slides.length === 0) {
    return createSlideDeck({ initialSlideId: fallbackSlideId, size: legacySize });
  }
  const activeSlideId =
    typeof value.activeSlideId === "string" &&
    slides.some((slide) => slide.id === value.activeSlideId)
      ? value.activeSlideId
      : slides[0].id;
  return { slides, activeSlideId };
};

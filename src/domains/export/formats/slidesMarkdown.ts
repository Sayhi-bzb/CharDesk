import { DEFAULT_SLIDE_SIZE, type SlideDeckSnapshot } from '@/domains/slides/public';
import { GridManager } from '@/shared/utils/grid';
import { createGridMapSource } from '@/shared/utils/grid-source';
import { exportSelectionToAnsi } from './text';

const escapeFrontMatterValue = (value: string) => value.replace(/\r?\n/g, ' ').trim();

const isDefaultSlideSize = (size: SlideDeckSnapshot['slides'][number]['size']) =>
  size.columns === DEFAULT_SLIDE_SIZE.columns && size.rows === DEFAULT_SLIDE_SIZE.rows;

const resolveFence = (source: string) => {
  let length = 3;
  for (const match of source.matchAll(/^`+/gm)) {
    length = Math.max(length, match[0].length + 1);
  }
  return '`'.repeat(length);
};

const renderSlide = (
  slide: SlideDeckSnapshot['slides'][number],
  includeColor: boolean
) => {
  const gridEntries = slide.grid;
  const grid = new Map(gridEntries);
  const lastRow = gridEntries.reduce((max, [key]) => {
    const point = GridManager.fromKey(key);
    return Math.max(max, point.y);
  }, 0);
  const source = exportSelectionToAnsi(
    createGridMapSource(grid),
    [
      {
        start: { x: 0, y: 0 },
        end: {
          x: slide.size.columns - 1,
          y: Math.min(lastRow, slide.size.rows - 1),
        },
      },
    ],
    { includeColor }
  ).replaceAll('\u001b', '');
  const fence = resolveFence(source);
  return { source, fence };
};

export const exportSlideDeckBodyToMarkdown = (
  slideDeck: SlideDeckSnapshot,
  options?: { includeColor?: boolean }
) => {
  const pages = slideDeck.slides.map((slide) => {
    const { source, fence } = renderSlide(slide, options?.includeColor !== false);
    const size = `${slide.size.columns}x${slide.size.rows}`;
    const info = isDefaultSlideSize(slide.size) ? '' : ` size=${size}`;
    return `## ${escapeFrontMatterValue(slide.name)}\n\n${fence}chardesk${info}\n${source}\n${fence}`;
  });
  return pages.join('\n\n');
};

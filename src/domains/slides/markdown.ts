import {
  compileCharDeskText,
  materializeCompiledCharDeskText,
  type CharDeskSourceKind,
} from '@chardesk/chargraph';
import { createCharDeskMarkdownRenderOptions } from '@chardesk/chargraph/markdown';
import { CHARDESK_LIGHT_RENDER_THEME } from '@chardesk/chargraph/theme';
import { COLOR_PRIMARY_TEXT } from '@/shared/lib/constants';
import { GridManager } from '@/shared/utils/grid';
import { createSlideDeck, addSlide } from './deck';
import { DEFAULT_SLIDE_SIZE, type SlideDeckSnapshot, type SlideSize } from './model';

const SLIDE_MARKDOWN_SIGNATURE = 'slides/v1';
const AUTO_SLIDE_PADDING = { columns: 4, rows: 2 } as const satisfies SlideSize;
const NO_SLIDE_PADDING = { columns: 0, rows: 0 } as const satisfies SlideSize;

export const isSlideMarkdownSource = (source: string) => {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0]?.trim() !== '---') return false;
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  return endIndex > 0 && lines
    .slice(1, endIndex)
    .some((line) => /^chardesk:\s*slides\/v1\s*$/i.test(line.trim()));
};

type ParsedSlideMarkdown = {
  title?: string;
  slideDeck: SlideDeckSnapshot;
};

const parseFrontMatter = (source: string) => {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new Error('Invalid CharDesk Slides Markdown header.');
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (endIndex < 0) {
    throw new Error('Invalid CharDesk Slides Markdown header.');
  }

  const metadata = new Map<string, string>();
  lines.slice(1, endIndex).forEach((line) => {
    const separator = line.indexOf(':');
    if (separator < 0) return;
    metadata.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  });

  const signature = metadata.get('chardesk');
  if (signature !== SLIDE_MARKDOWN_SIGNATURE) {
    throw new Error('Unsupported CharDesk Slides Markdown version.');
  }

  const title = metadata.get('title')?.trim();
  return {
    bodyLines: lines.slice(endIndex + 1),
    ...(title ? { title } : {}),
  };
};

const toSourceKind = (language: string): CharDeskSourceKind => {
  if (language === 'text') return 'plain';
  if (language === 'ansi') return 'ansi';
  if (language === 'chargraph') return 'chargraph';
  return 'chardesk';
};

const toGridEntries = async (
  source: string,
  sourceKind: CharDeskSourceKind,
  padding: SlideSize
) => {
  const compiled = await compileCharDeskText(source, {
    sourceKind,
    defaultStyle: { color: COLOR_PRIMARY_TEXT },
    markdown: createCharDeskMarkdownRenderOptions({
      theme: CHARDESK_LIGHT_RENDER_THEME,
    }),
  });
  const parsed = materializeCompiledCharDeskText(compiled);
  const grid = parsed.cells
    .filter(
      (cell) =>
        cell.text !== ' ' ||
        !!cell.bgColor ||
        !!cell.href ||
        !!cell.attrs?.underline ||
        !!cell.attrs?.inverse ||
        !!cell.attrs?.strike
    )
    .map(
      (cell) =>
        [
          GridManager.toKey(cell.x + padding.columns, cell.y + padding.rows),
          {
            char: cell.text,
            color: cell.color ?? COLOR_PRIMARY_TEXT,
            ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
            ...(cell.attrs ? { attrs: { ...cell.attrs } } : {}),
            ...(cell.href ? { href: cell.href } : {}),
          },
        ] as const
    );
  return {
    grid,
    size: {
      columns: Math.max(1, parsed.width) + padding.columns * 2,
      rows: Math.max(1, parsed.height) + padding.rows * 2,
    },
  };
};

const parseSlideSize = (value: string) => {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) return null;
  const size = { columns: Number(match[1]), rows: Number(match[2]) };
  return Number.isSafeInteger(size.columns) &&
    Number.isSafeInteger(size.rows) &&
    size.columns > 0 &&
    size.rows > 0
    ? size
    : null;
};

const parseSlideBlocks = (
  lines: string[]
) => {
  const slides: Array<{
    name: string;
    source: string;
    sourceKind: CharDeskSourceKind;
    size: SlideSize | 'auto';
  }> = [];
  let heading: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(lines[index]);
    if (headingMatch) {
      heading = headingMatch[1].trim();
      continue;
    }

    const fenceMatch = /^(?<fence>`{3,}|~{3,})\s*(?<language>[^\s]*)(?<info>.*)$/.exec(lines[index]);
    if (!fenceMatch?.groups) continue;
    const fence = fenceMatch.groups.fence;
    const language = fenceMatch.groups.language.toLowerCase();
    const content: string[] = [];
    let closed = false;
    index += 1;
    for (; index < lines.length; index += 1) {
      if (new RegExp(`^${fence[0]}{${fence.length},}\\s*$`).test(lines[index])) {
        closed = true;
        break;
      }
      content.push(lines[index]);
    }
    if (!closed) throw new Error('Unclosed slide content fence.');
    if (!['chardesk', 'text', 'ansi', 'chargraph'].includes(language)) continue;
    const info = fenceMatch.groups.info.trim();
    const sizeMatch = /^size=(\S+)$/.exec(info);
    if (info && !sizeMatch) {
      throw new Error('Invalid slide block info; expected size=auto or size=columnsxrows.');
    }
    const sizeValue = sizeMatch?.[1];
    const explicitSize = sizeValue && sizeValue !== 'auto'
      ? parseSlideSize(sizeValue)
      : null;
    if (sizeValue && sizeValue !== 'auto' && !explicitSize) {
      throw new Error('Invalid slide size; expected auto or positive columnsxrows.');
    }
    const size = sizeValue === 'auto'
      ? 'auto' as const
      : explicitSize ?? { ...DEFAULT_SLIDE_SIZE };

    slides.push({
      name: heading || `Slide ${slides.length + 1}`,
      source: content.join('\n'),
      sourceKind: toSourceKind(language),
      size,
    });
    heading = null;
  }

  if (slides.length === 0) {
    throw new Error('CharDesk Slides Markdown requires at least one slide block.');
  }
  return slides;
};

export const parseSlideMarkdown = async (source: string): Promise<ParsedSlideMarkdown> => {
  const { bodyLines, title } = parseFrontMatter(source);
  const parsed = await parseSlideMarkdownBody(bodyLines.join('\n'));
  return { ...parsed, ...(title ? { title } : {}) };
};

export const parseSlideMarkdownBody = async (source: string): Promise<ParsedSlideMarkdown> => {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const slides = parseSlideBlocks(normalized.split('\n'));
  const compiledSlides = await Promise.all(
    slides.map((slide) =>
      toGridEntries(
        slide.source,
        slide.sourceKind,
        slide.size === 'auto' ? AUTO_SLIDE_PADDING : NO_SLIDE_PADDING
      )
    )
  );
  const resolveSize = (index: number) =>
    slides[index].size === 'auto'
      ? compiledSlides[index].size
      : slides[index].size;
  let slideDeck = createSlideDeck({
    initialSlideId: 'slide-1',
    initialSlideName: slides[0].name,
    initialGrid: compiledSlides[0].grid,
    size: resolveSize(0),
  });

  for (const [index, slide] of slides.slice(1).entries()) {
    slideDeck = addSlide(slideDeck, {
      id: `slide-${index + 2}`,
      name: slide.name,
      grid: compiledSlides[index + 1].grid,
      size: resolveSize(index + 1),
      afterSlideId: slideDeck.slides.at(-1)?.id,
    });
  }

  slideDeck = { ...slideDeck, activeSlideId: slideDeck.slides[0].id };
  return { slideDeck };
};

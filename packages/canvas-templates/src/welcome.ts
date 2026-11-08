import {
  WELCOME_DEMO_MARKDOWN as demoMarkdown,
  WELCOME_CASES_MARKDOWN as generatedCasesMarkdown,
} from './welcome-content.generated.js';
import type { GridCell } from '@chardesk/cell-plane/types';
import { COLOR_PRIMARY_TEXT } from '@chardesk/cell-plane/constants';
import { parseCharDeskText } from '@chardesk/protocol';
export { WELCOME_DEMO_MARKDOWN, WELCOME_CASES_MARKDOWN } from './welcome-content.generated.js';

// Keep inherited foreground, authored styles and Unicode widths identical across Hosts.
const parseAnsiTextCells = (input: string, color: string): PositionedGridCell[] | null => {
  const parsed = parseCharDeskText(input, { defaultStyle: { color } });
  if (!parsed.hasAnsi || !parsed.cells.length) return null;
  return parsed.cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    char: cell.text,
    color: cell.color ?? color,
    ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
    ...(cell.attrs ? { attrs: { ...cell.attrs } } : {}),
    ...(cell.href ? { href: cell.href } : {}),
  }));
};
const parsePlainTextCells = (input: string, color: string): PositionedGridCell[] =>
  parseCharDeskText(input, { syntax: 'plain', defaultStyle: { color } }).cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    char: cell.text,
    color: cell.color ?? color,
  }));

const DEMO_COLUMN_GAP = 8;
const DEMO_TO_CASE_ROW_GAP = 1;

type PositionedGridCell = GridCell & { x: number; y: number };

export const extractAsciiCodeBlocks = (markdown: string) => {
  const blocks: string[] = [];
  const pattern = /^(`{3,})ascii[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\1[^\S\r\n]*$/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push(match[2]);
  }

  return blocks;
};

const toGridEntries = (cells: readonly PositionedGridCell[]): [string, GridCell][] =>
  cells
    .filter((cell) => cell.char !== ' ' || !!cell.bgColor || !!cell.attrs || !!cell.href)
    .map((cell) => [
      `${cell.x},${cell.y}`,
      {
        char: cell.char,
        color: cell.color,
        ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
        ...(cell.attrs ? { attrs: cell.attrs } : {}),
        ...(cell.href ? { href: cell.href } : {}),
      },
    ]);

const buildGridFromMarkdown = (markdown: string): [string, GridCell][] => {
  const content = extractAsciiCodeBlocks(markdown).join('\n\n');
  const cells = parseAnsiTextCells(content, COLOR_PRIMARY_TEXT) ?? [];
  return toGridEntries(cells);
};

const buildWelcomeGrid = (): [string, GridCell][] => {
  const demoCells: PositionedGridCell[] = [];
  let columnOffset = 0;
  let demoHeight = 0;

  for (const block of extractAsciiCodeBlocks(demoMarkdown)) {
    const parsed = parseCharDeskText(block);
    const cells =
      parseAnsiTextCells(block, COLOR_PRIMARY_TEXT) ??
      parsePlainTextCells(block, COLOR_PRIMARY_TEXT);
    demoCells.push(...cells.map((cell) => ({ ...cell, x: cell.x + columnOffset })));
    columnOffset += parsed.width + DEMO_COLUMN_GAP;
    demoHeight = Math.max(demoHeight, parsed.height);
  }

  const caseOffset = demoHeight + DEMO_TO_CASE_ROW_GAP;
  const caseCells =
    parseAnsiTextCells(
      extractAsciiCodeBlocks(generatedCasesMarkdown).join('\n\n'),
      COLOR_PRIMARY_TEXT
    ) ?? [];
  const positionedCases = caseCells.map((cell) => ({
    ...cell,
    y: cell.y + caseOffset,
  }));

  return toGridEntries([...demoCells, ...positionedCases]);
};

export const buildDefaultDemoGrid = (markdown?: string): [string, GridCell][] =>
  markdown === undefined ? buildWelcomeGrid() : buildGridFromMarkdown(markdown);

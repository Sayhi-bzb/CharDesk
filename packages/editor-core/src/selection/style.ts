import type {
  GridCell,
  GridCellSource,
  GridPoint,
  TextAttributes,
} from '@chardesk/cell-plane/types';
import { cloneTextAttributes } from '@chardesk/cell-plane/ansi';
import { resolveGridSlot } from '@chardesk/cell-plane/grid-occupancy';
import { planDrawingPatch } from '../drawing/planner.js';
import { resolveGridSelectionCoverage } from './coverage.js';
import type { GridRange } from './grid-types.js';

export const textAttributeNames = ['bold', 'italic', 'underline', 'strike', 'inverse'] as const;
export type TextAttributeName = (typeof textAttributeNames)[number];
export type TextAttributeState = 'on' | 'off' | 'mixed';
export type TextFormattingModel = Record<TextAttributeName, TextAttributeState>;
export type SelectionStyleChange =
  | { kind: 'attributes'; attributes: Partial<Record<TextAttributeName, boolean>> }
  | { kind: 'foreground'; color: string }
  | { kind: 'background'; color: string | null };
export type SelectedColor = { kind: 'none' | 'mixed' } | { kind: 'color'; value: string };
const STYLE_CELL_LIMIT = 100_000;

export function deriveTextFormattingModel(
  styles: readonly { attrs?: TextAttributes }[]
): TextFormattingModel | null {
  if (!styles.length) return null;
  const states = {} as TextFormattingModel;
  for (const name of textAttributeNames) {
    const enabled = styles.reduce((count, cell) => count + Number(cell.attrs?.[name] === true), 0);
    if (enabled === 0) states[name] = 'off';
    else if (enabled === styles.length) states[name] = 'on';
    else states[name] = 'mixed';
  }
  return states;
}

function styleCoverage(reader: GridCellSource, ranges: readonly GridRange[]) {
  let work = 0;
  for (const { start, end } of ranges) {
    if (![start.x, start.y, end.x, end.y].every(Number.isSafeInteger))
      throw new RangeError('Selection has unsupported coordinates.');
    work += (Math.abs(end.x - start.x) + 1) * (Math.abs(end.y - start.y) + 1);
    if (!Number.isSafeInteger(work) || work > STYLE_CELL_LIMIT)
      throw new RangeError('Selection is too large to edit its styles.');
  }
  const coverage = resolveGridSelectionCoverage(ranges, reader);
  if (
    coverage.spans.reduce((count, span) => count + span.maxX - span.minX + 1, 0) > STYLE_CELL_LIMIT
  )
    throw new RangeError('Selection is too large to edit its styles.');
  return coverage;
}

function colorState(values: readonly (string | undefined)[]): SelectedColor {
  if (!values.length) return { kind: 'none' };
  if (values.some((value) => value !== values[0])) return { kind: 'mixed' };
  return values[0] ? { kind: 'color', value: values[0] } : { kind: 'none' };
}

/** Existing anchors determine mixed states; follower slots never count as separate cells. */
export function readSelectionStyle(reader: GridCellSource, ranges: readonly GridRange[]) {
  const cells: GridCell[] = [];
  let limited = false;
  let spans: ReturnType<typeof styleCoverage>['spans'] = [];
  try {
    spans = styleCoverage(reader, ranges).spans;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    limited = true;
  }
  for (const { y, minX, maxX } of spans)
    for (let x = minX; x <= maxX; x++) {
      const slot = resolveGridSlot(reader, { x, y });
      if (slot?.offset === 0) cells.push(slot.cell);
    }
  return {
    limited,
    count: cells.length,
    attributes: deriveTextFormattingModel(cells),
    foreground: colorState(cells.map((cell) => cell.color)),
    background: colorState(cells.map((cell) => cell.bgColor)),
  };
}

export function readSelectionStyleChange(input: unknown): SelectionStyleChange {
  if (input && typeof input === 'object' && 'kind' in input) {
    if (
      (input.kind === 'foreground' || input.kind === 'background') &&
      'color' in input &&
      (typeof input.color === 'string' || (input.kind === 'background' && input.color === null))
    )
      return input as SelectionStyleChange;
    if (
      input.kind === 'attributes' &&
      'attributes' in input &&
      input.attributes &&
      typeof input.attributes === 'object' &&
      !Array.isArray(input.attributes) &&
      Object.entries(input.attributes).every(
        ([name, value]) =>
          textAttributeNames.includes(name as TextAttributeName) && typeof value === 'boolean'
      )
    )
      return input as SelectionStyleChange;
  }
  throw new TypeError('Expected selection text attributes or a foreground/background color.');
}

/** One patch for all ranges; creating/removing blank cells follows the Web document contract. */
export function planSelectionStyle(
  reader: GridCellSource,
  ranges: readonly GridRange[],
  change: SelectionStyleChange,
  foreground: string
) {
  readSelectionStyleChange(change);
  const points: GridPoint[] = [],
    erasures: { x: number; y: number }[] = [];
  const materialize =
    change.kind === 'background'
      ? change.color !== null
      : change.kind === 'attributes' &&
        (change.attributes.underline === true ||
          change.attributes.strike === true ||
          change.attributes.inverse === true);
  for (const { y, minX, maxX } of styleCoverage(reader, ranges).spans) {
    for (let x = minX; x <= maxX; x++) {
      const slot = resolveGridSlot(reader, { x, y });
      if (slot && slot.offset !== 0) continue;
      const existing = slot?.cell;
      if (!existing && !materialize) continue;
      const cell: GridCell = existing ? { ...existing } : { char: ' ', color: foreground };
      if (change.kind === 'foreground') cell.color = change.color;
      else if (change.kind === 'background') {
        if (change.color === null) delete cell.bgColor;
        else cell.bgColor = change.color;
      } else {
        const attrs = { ...cloneTextAttributes(cell.attrs) };
        for (const [name, enabled] of Object.entries(change.attributes)) {
          if (enabled) attrs[name as TextAttributeName] = true;
          else delete attrs[name as TextAttributeName];
        }
        const normalized = cloneTextAttributes(attrs);
        if (normalized) cell.attrs = normalized;
        else delete cell.attrs;
      }
      if (
        change.kind !== 'foreground' &&
        cell.char === ' ' &&
        !cell.bgColor &&
        !cell.href &&
        !cloneTextAttributes(cell.attrs)
      ) {
        if (existing) erasures.push({ x, y });
      } else if (
        !existing ||
        existing.color !== cell.color ||
        existing.bgColor !== cell.bgColor ||
        textAttributeNames.some((name) => existing.attrs?.[name] !== cell.attrs?.[name])
      )
        points.push({ x, y, ...cell });
    }
  }
  return planDrawingPatch(reader, points, erasures, { backgroundStroke: false });
}

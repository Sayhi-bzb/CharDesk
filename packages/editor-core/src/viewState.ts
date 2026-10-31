import { readDrawingSettings, type DrawingSettings } from './drawing/settings.js';
import type { StaticGridState } from './selection/static-grid.js';
import type { CellPoint } from '@chardesk/cell-core';

export type EditorView = {
  interaction: StaticGridState;
  viewport: CellPoint;
  tool: string;
  drawing?: DrawingSettings;
  inputColumn: number;
  lastTyped: CellPoint | null;
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const point = (value: unknown): value is CellPoint =>
  object(value) && Number.isSafeInteger(value.x) && Number.isSafeInteger(value.y);
const range = (value: unknown) => object(value) && point(value.start) && point(value.end);

/** Recovery is an input boundary, not a cast from persisted JSON to live editor state. */
export function readEditorView(value: unknown): EditorView {
  let validInteraction = false;
  if (object(value) && object(value.interaction)) {
    const state = value.interaction;
    if (state.mode === 'navigate' && object(state.selection)) {
      const selection = state.selection;
      validInteraction =
        (selection.mode === 'cell' || selection.mode === 'range') &&
        point(selection.activeCell) &&
        point(selection.anchorCell) &&
        range(selection.primaryRange) &&
        Array.isArray(selection.additionalRanges) &&
        selection.additionalRanges.every(range);
    } else if (state.mode === 'text-edit' && object(state.session)) {
      const session = state.session;
      validInteraction =
        point(session.origin) &&
        point(session.activeCell) &&
        point(session.nextCell) &&
        (session.previousCell === null || point(session.previousCell)) &&
        typeof session.exhausted === 'boolean';
    }
  }
  if (
    !object(value) ||
    !validInteraction ||
    !point(value.viewport) ||
    typeof value.tool !== 'string' ||
    !value.tool ||
    !Number.isSafeInteger(value.inputColumn) ||
    !(value.lastTyped === null || point(value.lastTyped))
  )
    throw new Error('Invalid saved editor view.');
  const view = structuredClone(value as EditorView);
  if (value.drawing !== undefined) view.drawing = readDrawingSettings(value.drawing);
  return view;
}

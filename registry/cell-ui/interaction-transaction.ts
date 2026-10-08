import type { CellDragState, CellDragEvent } from "./drag.js";

export type CellInteractionTransaction = Readonly<{
  state: CellDragState;
  events: readonly CellDragEvent[];
}>;

export const createCellInteractionTransaction = (state: CellDragState): CellInteractionTransaction => ({
  state,
  events: [],
});

export const appendCellInteractionEvent = (
  transaction: CellInteractionTransaction,
  event: CellDragEvent,
): CellInteractionTransaction => ({
  state: event.state,
  events: [...transaction.events, event],
});


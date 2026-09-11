import type { GridCellSource } from "@/shared/types";
import { resolveGridSlot } from "@/shared/utils/grid-occupancy";
import type {
  GridAddress,
  GridBounds,
  StaticGridInteraction,
} from "./static-grid";

export type StaticGridDeleteDirection = "backward" | "forward";

export type StaticGridDeletePlan =
  | Readonly<{ kind: "range" }>
  | Readonly<{
      kind: "cell";
      target: GridAddress;
      nextActiveCell: GridAddress;
    }>
  | Readonly<{ kind: "noop"; reason: "boundary" }>;

const containsAddress = (bounds: GridBounds, address: GridAddress) =>
  address.x >= bounds.start.x
  && address.x <= bounds.end.x
  && address.y >= bounds.start.y
  && address.y <= bounds.end.y;

export const resolveStaticGridDeletePlan = (input: {
  interaction: StaticGridInteraction;
  direction: StaticGridDeleteDirection;
  grid: GridCellSource;
  bounds?: GridBounds | null;
  previousInputCell?: GridAddress | null;
}): StaticGridDeletePlan => {
  if (input.interaction.kind === "range") return { kind: "range" };

  const activeCell = input.interaction.activeCell;
  if (input.direction === "forward") {
    return {
      kind: "cell",
      target: resolveGridSlot(input.grid, activeCell)?.anchor ?? activeCell,
      nextActiveCell: activeCell,
    };
  }

  const previousAddress = input.interaction.kind === "text-edit"
    && input.previousInputCell
    ? input.previousInputCell
    : { x: activeCell.x - 1, y: activeCell.y };
  if (input.bounds && !containsAddress(input.bounds, previousAddress)) {
    return { kind: "noop", reason: "boundary" };
  }
  const target = resolveGridSlot(input.grid, previousAddress)?.anchor
    ?? previousAddress;
  return {
    kind: "cell",
    target,
    nextActiveCell: target,
  };
};

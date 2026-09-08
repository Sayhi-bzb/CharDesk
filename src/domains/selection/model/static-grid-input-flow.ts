import type { GridCellSource } from "@/shared/types";
import { resolveGridSlot } from "@/shared/utils/grid-occupancy";
import type { GridAddress, GridBounds } from "./static-grid";

export interface StaticGridInputFlow {
  lineOriginX: number;
  nextCell: GridAddress;
  activeCell: GridAddress;
  previousCell: GridAddress | null;
  exhausted: boolean;
}

interface StaticGridInputStep {
  flow: StaticGridInputFlow;
  writeAt: GridAddress | null;
}

const getGridLineOriginX = (grid: GridCellSource, address: GridAddress) => {
  const routed = grid.getLineOriginX?.(address);
  if (routed !== undefined) return routed;
  let seedX = address.x;
  let foundSeed = false;
  const bounds = grid.getContentBounds();
  if (bounds) grid.visit(bounds, (x, y) => {
    if (y !== address.y || x > address.x) return;
    seedX = foundSeed ? Math.max(seedX, x) : x;
    foundSeed = true;
  });
  if (!foundSeed) return address.x;

  let runStartX = seedX;
  while (true) {
    const previous = resolveGridSlot(grid, { x: runStartX - 1, y: address.y });
    if (!previous || previous.anchor.x + previous.width !== runStartX) break;
    runStartX = previous.anchor.x;
  }
  return Math.min(address.x, runStartX);
};

const clampXToBounds = (x: number, bounds?: GridBounds | null) => {
  if (!bounds) return x;
  return Math.max(bounds.start.x, Math.min(bounds.end.x, x));
};

export const createStaticGridInputFlow = (input: {
  grid: GridCellSource;
  address: GridAddress;
  bounds?: GridBounds | null;
  lineOriginX?: number;
}): StaticGridInputFlow => ({
  lineOriginX: clampXToBounds(
    input.lineOriginX ?? getGridLineOriginX(input.grid, input.address),
    input.bounds
  ),
  nextCell: { ...input.address },
  activeCell: { ...input.address },
  previousCell: null,
  exhausted: false,
});

const exhaustStaticGridInputFlow = (
  flow: StaticGridInputFlow,
  nextCell = flow.nextCell
): StaticGridInputFlow => ({
  ...flow,
  nextCell: { ...nextCell },
  exhausted: true,
});

export const advanceStaticGridInputFlow = (input: {
  flow: StaticGridInputFlow;
  width: 1 | 2;
  bounds?: GridBounds | null;
}): StaticGridInputStep => {
  const { bounds, width } = input;
  if (input.flow.exhausted) return { flow: input.flow, writeAt: null };

  let writeAt = { ...input.flow.nextCell };
  if (bounds) {
    const fitsRow = (point: GridAddress) =>
      point.x >= bounds.start.x &&
      point.x + width - 1 <= bounds.end.x &&
      point.y >= bounds.start.y &&
      point.y <= bounds.end.y;

    if (!fitsRow(writeAt)) {
      const wrapped = {
        x: input.flow.lineOriginX,
        y: writeAt.y + 1,
      };
      if (writeAt.x === input.flow.lineOriginX || !fitsRow(wrapped)) {
        return {
          flow: exhaustStaticGridInputFlow(input.flow),
          writeAt: null,
        };
      }
      writeAt = wrapped;
    }
  }

  const nextX = writeAt.x + width;
  if (!bounds || nextX <= bounds.end.x) {
    const nextCell = { x: nextX, y: writeAt.y };
    return {
      writeAt,
      flow: {
        ...input.flow,
        nextCell,
        activeCell: nextCell,
        previousCell: writeAt,
      },
    };
  }

  const nextCell = {
    x: input.flow.lineOriginX,
    y: writeAt.y + 1,
  };
  if (nextCell.y <= bounds.end.y) {
    return {
      writeAt,
      flow: {
        ...input.flow,
        nextCell,
        activeCell: nextCell,
        previousCell: writeAt,
      },
    };
  }

  return {
    writeAt,
    flow: {
      ...exhaustStaticGridInputFlow(input.flow, nextCell),
      activeCell: writeAt,
      previousCell: writeAt,
    },
  };
};

export const advanceStaticGridInputFlowLine = (input: {
  flow: StaticGridInputFlow;
  bounds?: GridBounds | null;
}): StaticGridInputFlow => {
  if (input.flow.exhausted) return input.flow;
  const nextCell = {
    x: input.flow.lineOriginX,
    y: input.flow.nextCell.y + 1,
  };
  if (input.bounds && nextCell.y > input.bounds.end.y) {
    return exhaustStaticGridInputFlow(input.flow, nextCell);
  }
  return {
    ...input.flow,
    nextCell,
    activeCell: nextCell,
  };
};

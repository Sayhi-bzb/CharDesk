import { expect, type Locator } from "@playwright/test";
import type { CellProbeSnapshot } from "@chardesk/cell-ui";
import { CELL_SURFACE_GUARD_CELLS } from "@chardesk/cell-ui/browser";

export type BrowserCellProbe = CellProbeSnapshot;

const PROBE_PROPERTY = "__chardeskCellProbeV5";

export const readCellMetrics = async (surface: Locator) => {
  await expect.poll(async () => (await readCellProbe(surface)).presentation?.measurement?.ready).toBe(true);
  return (await readCellProbe(surface)).presentation!.metrics;
};

export const readCellPixel = async (surface: Locator, x: number, y: number) => {
  const metrics = await readCellMetrics(surface);
  return surface.locator("canvas").first().evaluate((canvas, { metrics, x, y, guardCells }) =>
    Array.from(canvas.getContext("2d")!.getImageData(
      Math.round((x + guardCells) * metrics.cellWidth * devicePixelRatio),
      Math.round((y + guardCells) * metrics.cellHeight * devicePixelRatio), 1, 1
    ).data), { metrics, x, y, guardCells: CELL_SURFACE_GUARD_CELLS });
};

export const readCellProbe = async (surface: Locator): Promise<BrowserCellProbe> => {
  let snapshot: BrowserCellProbe | null = null;
  await expect.poll(async () => {
    snapshot = await surface.evaluate((element, property) =>
      (element as HTMLElement & Record<string, unknown>)[property] ?? null, PROBE_PROPERTY
    ) as BrowserCellProbe | null;
    return snapshot !== null;
  }).toBe(true);
  return snapshot!;
};

export const readCellText = async (surface: Locator): Promise<string> =>
  (await readCellProbe(surface)).text;

export const ownerCells = (snapshot: BrowserCellProbe, ownerId: string) =>
  snapshot.cells.filter((cell) => cell.ownerId === ownerId);

export const readCellProbeWithOwner = async (surface: Locator, ownerId: string): Promise<BrowserCellProbe> => {
  let snapshot: BrowserCellProbe | null = null;
  await expect.poll(async () => {
    snapshot = await readCellProbe(surface);
    return ownerCells(snapshot, ownerId).length;
  }).toBeGreaterThan(0);
  return snapshot!;
};

export const ownerBounds = (snapshot: BrowserCellProbe, ownerId: string) => {
  const cells = ownerCells(snapshot, ownerId);
  if (cells.length === 0) throw new Error(`Cell owner ${ownerId} has no visible Cells.`);
  const xs = cells.map(({ x }) => x);
  const ys = cells.map(({ y }) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x + 1,
    height: Math.max(...ys) - y + 1,
  };
};

export const cellPoint = async (surface: Locator, x: number, y: number) => {
  const metrics = await readCellMetrics(surface);
  const bounds = await surface.locator("canvas").first().boundingBox();
  if (!bounds) throw new Error("CellSurface Canvas is not visible.");
  return {
    x: bounds.x + (x + CELL_SURFACE_GUARD_CELLS + 0.5) * metrics.cellWidth,
    y: bounds.y + (y + CELL_SURFACE_GUARD_CELLS + 0.5) * metrics.cellHeight,
  };
};

export const copyCellRange = async (surface: Locator): Promise<string> =>
  surface.evaluate((element) => {
    const clipboard = new DataTransfer();
    element.dispatchEvent(new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    }));
    return clipboard.getData("text/plain");
  });

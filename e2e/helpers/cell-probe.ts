import { expect, type Locator } from "@playwright/test";
import type { CellProbeSnapshot } from "@chardesk/cell-ui";

export type BrowserCellProbe = CellProbeSnapshot;

const PROBE_PROPERTY = "__chardeskCellProbeV3";

export const readCellMetrics = async (surface: Locator) => {
  await expect.poll(async () => (await readCellProbe(surface)).presentation?.measurement?.ready).toBe(true);
  return (await readCellProbe(surface)).presentation!.metrics;
};

export const readCellPixel = async (surface: Locator, x: number, y: number) => {
  const metrics = await readCellMetrics(surface);
  return surface.locator("canvas").evaluate((canvas, { metrics, x, y }) =>
    Array.from(canvas.getContext("2d")!.getImageData(
      Math.round(x * metrics.cellWidth * devicePixelRatio),
      Math.round(y * metrics.cellHeight * devicePixelRatio), 1, 1
    ).data), { metrics, x, y });
};

export const readCellProbe = async (surface: Locator): Promise<BrowserCellProbe> => {
  const snapshot = await surface.evaluate((element, property) =>
    (element as HTMLElement & Record<string, unknown>)[property] ?? null, PROBE_PROPERTY
  ) as BrowserCellProbe | null;
  if (!snapshot) throw new Error("CellSurface probe is not enabled or has not committed a frame.");
  return snapshot;
};

export const readCellText = async (surface: Locator): Promise<string> =>
  (await readCellProbe(surface)).text;

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

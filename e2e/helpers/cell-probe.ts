import type { Locator } from "@playwright/test";
import type { CellProbeSnapshot } from "@chardesk/cell-ui";

export type BrowserCellProbe = CellProbeSnapshot;

const PROBE_PROPERTY = "__chardeskCellProbeV2";

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

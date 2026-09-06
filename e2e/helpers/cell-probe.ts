import type { Locator } from "@playwright/test";

export type BrowserCellProbe = Readonly<{
  schemaVersion: 1;
  probeId: string | null;
  revision: number;
  region: Readonly<{ x: number; y: number; width: number; height: number }>;
  viewport: Readonly<{ width: number; height: number }>;
  text: string;
  cells: readonly Readonly<{
    x: number;
    y: number;
    text: string;
    width: 1 | 2;
    continuation: boolean;
    ownerId: string | null;
    style: Readonly<{ bold?: boolean; backgroundColor?: string; color?: string }>;
  }>[];
  focusedId: string | null;
}>;

const PROBE_PROPERTY = "__chardeskCellProbeV1";

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

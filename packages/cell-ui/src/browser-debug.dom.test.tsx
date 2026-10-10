import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button, Root, Text } from "./index.js";
import { CellInspectorOverlay, CellSurface, registerCellDebugAdapter } from "./browser.js";

const context = {
  setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
  getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })),
  putImageData: vi.fn(), measureText: vi.fn(() => ({ width: 0 })), save: vi.fn(), restore: vi.fn(),
  beginPath: vi.fn(), closePath: vi.fn(), rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  arc: vi.fn(), stroke: vi.fn(), scale: vi.fn(), translate: vi.fn(), getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
  fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textBaseline: "", textAlign: "",
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
});

afterEach(() => cleanup());

describe("CellInspectorOverlay", () => {
  it("maps a browser pointer to a semantic Cell target", async () => {
    const result = render(<CellSurface viewport={{ width: 12, height: 2 }} onCommand={() => undefined} label="Debug surface">
      <Root><Button id="play" label="Play"><Text>Play</Text></Button></Root>
    </CellSurface>);
    const surface = result.container.querySelector("[data-cell-surface]")!;
    render(<CellInspectorOverlay surface={surface} />);
    const canvas = surface.querySelector("canvas")!;
    fireEvent.pointerMove(canvas, { clientX: 15, clientY: 25 });
    await waitFor(() => expect(screen.getByText(/owner=play\/[a-z0-9]{7}/)).toBeInTheDocument());
    expect(screen.getByText(/role=button/)).toBeInTheDocument();
    expect(document.querySelector("[data-cell-inspector-overlay]")).toBeInTheDocument();
    const bridge = (window as Window & { __CELL_UI_DEBUG__?: {
      listSurfaces: () => readonly string[];
      references: (surfaceId: string) => readonly { ref: string; canonicalId: string }[];
      resolveRef: (surfaceId: string, ref: string) => string | null;
    } }).__CELL_UI_DEBUG__;
    expect(bridge?.listSurfaces()).toContain("Debug surface");
    const refs = bridge?.references("Debug surface") ?? [];
    const playRef = refs.find((reference) => reference.canonicalId === "play")?.ref;
    expect(playRef).toMatch(/^play\/[a-z0-9]{7}$/);
    expect(bridge?.resolveRef("Debug surface", playRef!)).toBe("play");
  });

  it("exposes host-owned artifacts through the same bridge", async () => {
    const unregister = registerCellDebugAdapter({
      id: "host-preview",
      snapshot: () => ({ schemaVersion: 1, kind: "host-preview", revision: 3 }),
      verify: () => [],
    });
    render(<CellInspectorOverlay surface={null} enabled />);
    await waitFor(() => expect((window as Window & { __CELL_UI_DEBUG__?: { listSurfaces: () => readonly string[]; artifact: (id: string) => unknown } }).__CELL_UI_DEBUG__?.listSurfaces()).toContain("host-preview"));
    const bridge = (window as Window & { __CELL_UI_DEBUG__?: { artifact: (id: string) => unknown } }).__CELL_UI_DEBUG__;
    expect(bridge?.artifact("host-preview")).toEqual({ schemaVersion: 1, kind: "host-preview", revision: 3 });
    unregister();
  });
});

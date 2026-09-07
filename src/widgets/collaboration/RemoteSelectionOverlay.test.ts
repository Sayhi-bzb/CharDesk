import { describe, expect, it } from "vitest";
import type { StructuredNode } from "@/domains/structured-content/public";
import type { GridMap } from "@/shared/types";
import {
  resolveRemoteSelectionLayout,
  resolveRemoteSelectionRevealViewport,
  resolveRemoteSelectionVisuals,
  type RemoteSelectionVisual,
} from "./remoteSelectionGeometry";

const viewport = {
  offset: { x: 10, y: 20 },
  zoom: 2,
};

describe("resolveRemoteSelectionVisuals", () => {
  it("uses the shared grid geometry for cells, ranges, and CJK footprints", () => {
    const grid: GridMap = new Map([
      ["0,0", { char: "界", color: "#000000" }],
    ]);
    const visuals = resolveRemoteSelectionVisuals({
      peers: [{
        clientId: 7,
        name: "Ada",
        color: "#0969da",
        selection: {
          mode: "freeform",
          areas: [
            { start: { x: 1, y: 0 }, end: { x: 1, y: 0 } },
            { start: { x: 3, y: 2 }, end: { x: 5, y: 3 } },
          ],
        },
      }],
      canvasMode: "freeform",
      grid,
      structuredScene: [],
      viewport,
    });

    expect(visuals).toHaveLength(1);
    expect(visuals[0]).toMatchObject({
      clientId: 7,
      name: "Ada",
      color: "#0969da",
      bounds: expect.objectContaining({ left: 10, top: 20 }),
    });
    expect(visuals[0].path).toContain("M10 20");
    expect(visuals[0].path).toContain("46 20");
  });

  it("outlines selected structured nodes and ignores missing ids", () => {
    const scene: StructuredNode[] = [{
      id: "note",
      type: "text",
      order: 0,
      position: { x: 4, y: 3 },
      text: "hello",
      style: { color: "#000000" },
    }];
    const visuals = resolveRemoteSelectionVisuals({
      peers: [{
        clientId: 8,
        name: "Lin",
        color: "#bf3989",
        selection: { mode: "structured", nodeIds: ["missing", "note"] },
      }],
      canvasMode: "structured",
      grid: new Map(),
      structuredScene: scene,
      viewport,
    });

    expect(visuals).toEqual([expect.objectContaining({
      clientId: 8,
      center: { x: 127, y: 160 },
      path: "M82 140 H172 V180 H82 Z",
    })]);
  });

  it("does not project selections from another canvas mode", () => {
    expect(resolveRemoteSelectionVisuals({
      peers: [{
        clientId: 9,
        name: "Kai",
        color: "#1a7f37",
        selection: { mode: "structured", nodeIds: ["node"] },
      }],
      canvasMode: "freeform",
      grid: new Map(),
      structuredScene: [],
      viewport,
    })).toEqual([]);
  });

  it("keeps partially visible selections on canvas and tracks fully offscreen ones", () => {
    const createVisual = (
      clientId: number,
      bounds: RemoteSelectionVisual["bounds"]
    ): RemoteSelectionVisual => ({
      clientId,
      name: `Peer ${clientId}`,
      color: "#0969da",
      path: "M0 0",
      regions: [bounds],
      bounds,
      center: {
        x: (bounds.left + bounds.right) / 2,
        y: (bounds.top + bounds.bottom) / 2,
      },
    });
    const layout = resolveRemoteSelectionLayout([
      createVisual(1, { left: -5, top: 30, right: 5, bottom: 50 }),
      createVisual(2, { left: 400, top: 80, right: 420, bottom: 100 }),
    ], { x: 0, y: 0, width: 300, height: 200 });

    expect(layout.visible).toEqual([
      expect.objectContaining({ clientId: 1, labelAnchor: { x: 2, y: 14 } }),
    ]);
    expect(layout.indicators).toEqual([
      expect.objectContaining({
        clientId: 2,
        edge: "right",
        position: expect.objectContaining({ x: 286 }),
      }),
    ]);
  });

  it("separates peers on the same edge deterministically", () => {
    const visuals: RemoteSelectionVisual[] = [1, 2, 3].map((clientId) => ({
      clientId,
      name: `Peer ${clientId}`,
      color: "#0969da",
      path: "M0 0",
      regions: [{ left: 120, top: -100, right: 130, bottom: -90 }],
      bounds: { left: 120, top: -100, right: 130, bottom: -90 },
      center: { x: 125, y: -95 },
    }));
    const { indicators } = resolveRemoteSelectionLayout(
      visuals,
      { x: 0, y: 0, width: 300, height: 200 }
    );

    expect(indicators.map(({ edge }) => edge)).toEqual(["top", "top", "top"]);
    expect(indicators[1].position.x - indicators[0].position.x).toBeGreaterThanOrEqual(24);
    expect(indicators[2].position.x - indicators[1].position.x).toBeGreaterThanOrEqual(24);
  });

  it("places dots tangent to every pane edge", () => {
    const bounds = [
      { left: 140, top: -40, right: 160, bottom: -20 },
      { left: 320, top: 90, right: 340, bottom: 110 },
      { left: 140, top: 220, right: 160, bottom: 240 },
      { left: -40, top: 90, right: -20, bottom: 110 },
    ];
    const visuals: RemoteSelectionVisual[] = bounds.map((item, index) => ({
      clientId: index,
      name: `Peer ${index}`,
      color: "#0969da",
      path: "M0 0",
      regions: [item],
      bounds: item,
      center: {
        x: (item.left + item.right) / 2,
        y: (item.top + item.bottom) / 2,
      },
    }));

    const { indicators } = resolveRemoteSelectionLayout(
      visuals,
      { x: 0, y: 0, width: 300, height: 200 }
    );

    expect(indicators.map(({ edge, position }) => ({ edge, position }))).toEqual([
      { edge: "top", position: { x: 150, y: 14 } },
      { edge: "right", position: { x: 286, y: 100 } },
      { edge: "bottom", position: { x: 150, y: 186 } },
      { edge: "left", position: { x: 14, y: 100 } },
    ]);
  });

  it("centers a collaborator without changing zoom", () => {
    expect(resolveRemoteSelectionRevealViewport(
      { offset: { x: -100, y: 40 }, zoom: 2 },
      { x: 300, y: 200 },
      { x: 500, y: -50 }
    )).toEqual({ offset: { x: -300, y: 290 }, zoom: 2 });
  });
});

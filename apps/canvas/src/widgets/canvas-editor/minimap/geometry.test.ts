import { describe, expect, it } from "vitest";
import { GridSnapshotSource } from "@/shared/utils/grid-source";
import { GridManager } from "@/shared/utils/grid";
import {
  cameraCenterToOffset,
  clampMinimapCameraCenter,
  computeMinimapTransform,
  computeMinimapViewportRect,
  computeVisibleContentBounds,
  lockMinimapPointToAxis,
  minimapPointToWorld,
  worldPointToMinimap,
} from "./geometry";

const cell = (char: string, bgColor?: string) => ({
  char,
  color: "#ffffff",
  bgColor,
});

const DIMENSIONS = { width: 220, height: 140 };
const VIEWPORT_SIZE = { width: 1000, height: 700 };

describe("minimap geometry", () => {
  it("computes visible world bounds with wide characters and backgrounds", () => {
    const grid = new GridSnapshotSource([
      [GridManager.toKey(-2, 1), cell("你")],
      [GridManager.toKey(4, 3), cell(" ", "#222222")],
      [GridManager.toKey(100, 100), cell(" ")],
    ]);

    expect(computeVisibleContentBounds(grid)).toEqual({
      x: -18,
      y: 20,
      width: 63,
      height: 60,
    });
  });

  it("fits the union of content and viewport into a stable frame", () => {
    const grid = new GridSnapshotSource([
      [GridManager.toKey(0, 0), cell("A")],
      [GridManager.toKey(9, 9), cell("B")],
    ]);
    const transform = computeMinimapTransform({
      source: grid,
      offset: { x: -1800, y: -1900 },
      zoom: 1,
      viewportSize: VIEWPORT_SIZE,
      dimensions: DIMENSIONS,
      padding: 4,
    });

    expect(transform).not.toBeNull();
    expect(transform?.dimensions).toEqual(DIMENSIONS);
    expect(transform?.worldBounds.x).toBeLessThanOrEqual(0);
    expect(transform?.worldBounds.y).toBeLessThanOrEqual(0);
    expect(transform?.worldBounds.x).toBeLessThanOrEqual(1800);
    expect(
      transform!.worldBounds.x + transform!.worldBounds.width
    ).toBeGreaterThanOrEqual(2800);
    expect(
      transform!.worldBounds.y + transform!.worldBounds.height
    ).toBeGreaterThanOrEqual(2600);
    expect(
      transform!.worldBounds.width / transform!.worldBounds.height
    ).toBeCloseTo(212 / 132);
  });

  it("keeps the full viewport indicator inside the drawable frame", () => {
    const grid = new GridSnapshotSource([
      [GridManager.toKey(0, 0), cell("A")],
    ]);
    const transform = computeMinimapTransform({
      source: grid,
      offset: { x: -5000, y: 3500 },
      zoom: 1,
      viewportSize: VIEWPORT_SIZE,
      dimensions: DIMENSIONS,
      padding: 4,
    })!;
    const viewport = computeMinimapViewportRect(transform);

    expect(viewport.x).toBeGreaterThanOrEqual(transform.drawableRect.x);
    expect(viewport.y).toBeGreaterThanOrEqual(transform.drawableRect.y);
    expect(viewport.x + viewport.width).toBeCloseTo(
      transform.drawableRect.x + transform.drawableRect.width
    );
    expect(viewport.y + viewport.height).toBeLessThanOrEqual(
      transform.drawableRect.y + transform.drawableRect.height
    );
  });

  it("round-trips points between world and minimap coordinates", () => {
    const transform = computeMinimapTransform({
      source: new GridSnapshotSource([[GridManager.toKey(3, 4), cell("A")]]),
      offset: { x: -100, y: -200 },
      zoom: 2,
      viewportSize: VIEWPORT_SIZE,
      dimensions: DIMENSIONS,
      padding: 4,
    })!;
    const point = { x: 42, y: 76 };
    const minimapPoint = worldPointToMinimap(point, transform);

    const roundTrip = minimapPointToWorld(minimapPoint, transform);
    expect(roundTrip.x).toBeCloseTo(point.x);
    expect(roundTrip.y).toBeCloseTo(point.y);
  });

  it("clamps navigation to content plus half a viewport", () => {
    const content = { x: 100, y: 200, width: 90, height: 190 };
    const viewport = { x: 0, y: 0, width: 1000, height: 700 };

    expect(
      clampMinimapCameraCenter({ x: -1000, y: -1000 }, content, viewport)
    ).toEqual({ x: -200, y: -150 });
    expect(
      clampMinimapCameraCenter({ x: 2000, y: 2000 }, content, viewport)
    ).toEqual({ x: 690, y: 740 });
  });

  it("locks drag movement to the dominant axis", () => {
    expect(lockMinimapPointToAxis({ x: 20, y: 3 }, { x: 0, y: 0 })).toEqual({
      x: 20,
      y: 0,
    });
    expect(lockMinimapPointToAxis({ x: 2, y: 30 }, { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 30,
    });
  });

  it("converts a world center into the store offset", () => {
    expect(
      cameraCenterToOffset({ x: 100, y: 200 }, 2, VIEWPORT_SIZE)
    ).toEqual({ x: 300, y: -50 });
  });

  it("uses the viewport as the world bounds when content is empty", () => {
    const transform = computeMinimapTransform({
      source: new GridSnapshotSource(),
      offset: { x: -100, y: -200 },
      zoom: 1,
      viewportSize: VIEWPORT_SIZE,
      dimensions: DIMENSIONS,
      padding: 4,
    })!;

    expect(transform.contentBounds).toBeNull();
    expect(transform.viewportBounds).toEqual({
      x: 100,
      y: 200,
      width: 1000,
      height: 700,
    });
  });
});

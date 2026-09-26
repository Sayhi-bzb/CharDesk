import { afterEach, expect, it } from "vitest";
import { resolveCellPresentationWindow } from "./browser-presentation-window.js";

afterEach(() => { document.body.replaceChildren(); });

it("bounds a long Surface to visible rows and reuses its window until scrolling past it", () => {
  const surface = document.createElement("div");
  document.body.append(surface);
  let top = 80;
  surface.getBoundingClientRect = () => ({ top, bottom: top + 2_200, height: 2_200,
    left: 0, right: 800, width: 800, x: 0, y: top, toJSON: () => ({}) });
  const viewport = { width: 80, height: 110 };
  const metrics = { cellHeight: 20 };
  const first = resolveCellPresentationWindow(surface, viewport, metrics, null)!;
  expect(first).toMatchObject({ x: 0, y: 0, width: 80 });
  expect(first.height).toBeLessThan(viewport.height);
  top -= 40;
  expect(resolveCellPresentationWindow(surface, viewport, metrics, first)).toBe(first);
  top -= 800;
  const middle = resolveCellPresentationWindow(surface, viewport, metrics, first)!;
  expect(middle.y).toBeGreaterThan(0);
  expect(middle.y + middle.height).toBeLessThanOrEqual(viewport.height);
});

it("respects a clipping scroll ancestor and leaves short Surfaces unwindowed", () => {
  const clip = document.createElement("div");
  clip.style.overflowY = "auto";
  clip.getBoundingClientRect = () => ({ top: 100, bottom: 300, height: 200,
    left: 0, right: 800, width: 800, x: 0, y: 100, toJSON: () => ({}) });
  const surface = document.createElement("div");
  surface.getBoundingClientRect = () => ({ top: 50, bottom: 2_250, height: 2_200,
    left: 0, right: 800, width: 800, x: 0, y: 50, toJSON: () => ({}) });
  clip.append(surface);
  document.body.append(clip);
  expect(resolveCellPresentationWindow(surface, { width: 80, height: 110 },
    { cellHeight: 20 }, null)).toMatchObject({ y: 0, width: 80 });
  expect(resolveCellPresentationWindow(surface, { width: 80, height: 5 },
    { cellHeight: 20 }, null)).toBeNull();
});

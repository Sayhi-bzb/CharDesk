import { expect, test } from 'vitest';
import { buildDefaultDemoGrid } from './welcome.js';
import { WelcomeAppearance, type WelcomeAppearanceSnapshot } from './welcome-appearance.js';
import { createGridSurfaceReader, isIncrementalCanvasSurfaceReader } from '@chardesk/cell-plane';
import { createGridMapSource } from '@chardesk/cell-plane/grid-source';
import { contentColorContrast } from '@chardesk/rendering/theme';

test('one Welcome policy works for native surfaces and minimal browser/export sources', () => {
  const grid = new Map(buildDefaultDemoGrid());
  const source = createGridSurfaceReader(grid),
    minimal = createGridMapSource(grid);
  let snapshot: WelcomeAppearanceSnapshot = { revision: 0, palette: null };
  const appearance = new WelcomeAppearance(() => snapshot);
  const surface = appearance.project(source),
    generic = appearance.project(minimal);
  expect(isIncrementalCanvasSurfaceReader(surface)).toBe(false);
  for (const [foreground, background] of [
    ['#111111', '#ffffff'],
    ['#eeeeee', '#111111'],
    ['#d7e4d7', '#182820'],
  ]) {
    snapshot = {
      revision: snapshot.revision + 1,
      palette: { foreground: foreground!, background: background! },
    };
    for (const at of [
      { x: 37, y: 2 },
      { x: 37, y: 3 },
      { x: 35, y: 1 },
      { x: 1, y: 0 },
      { x: 112, y: 8 },
    ])
      expect(generic.get(at)).toEqual(surface.get(at));
    expect(
      contentColorContrast(generic.get({ x: 37, y: 3 })!.color, background!)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contentColorContrast(generic.get({ x: 35, y: 1 })!.color, background!)
    ).toBeGreaterThanOrEqual(3);
    expect(generic.get({ x: 37, y: 2 })!.color).toBe('#000000');
    expect(generic.get({ x: 1, y: 0 })).toEqual(grid.get('1,0'));
    expect(generic.get({ x: 112, y: 8 })).toEqual(grid.get('112,8'));
  }
  expect(grid.get('37,2')!.color).toBe('#0f172a');
});

test('range and cropped image sources keep the original Welcome scope, while unrelated art stays literal', () => {
  const scope = createGridMapSource(new Map(buildDefaultDemoGrid()));
  const cropped = createGridMapSource(new Map([['37,2', scope.get({ x: 37, y: 2 })!]]));
  const appearance = new WelcomeAppearance(() => ({
    revision: 0,
    palette: { foreground: '#eeeeee', background: '#111111' },
  }));
  expect(appearance.project(cropped)).toBe(cropped);
  expect(appearance.project(cropped, scope).get({ x: 37, y: 2 })!.color).toBe('#000000');
  expect(cropped.get({ x: 37, y: 2 })!.color).toBe('#0f172a');
  const project = appearance.project;
  expect(project(scope).get({ x: 37, y: 2 })!.color).toBe('#000000');
});

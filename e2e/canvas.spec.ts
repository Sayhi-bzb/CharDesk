import { test, expect, type Page } from '@playwright/test';

const STORAGE_KEY = 'chardesk-persistence';
const CELL_WIDTH = 9;
const CELL_HEIGHT = 19;

const seedSession = async (
  page: Page,
  session: Record<string, unknown>,
) => {
  await page.evaluate(
    ({ storageKey, seededSession }) => {
      const viewport = seededSession.viewport as {
        offset: { x: number; y: number };
        zoom: number;
      };
      localStorage.setItem(storageKey, JSON.stringify({
        state: {
          offset: viewport.offset,
          zoom: viewport.zoom,
          canvasMode: seededSession.mode,
          structuredScene: seededSession.scene ?? [],
          structuredComponents: [],
          brushChar: '#',
          brushColor: '#111827',
          showGrid: true,
          exportShowGrid: false,
          canvasSessions: [seededSession],
          activeCanvasId: seededSession.id,
          grid: seededSession.grid ?? [],
        },
        version: 0,
      }));
    },
    { storageKey: STORAGE_KEY, seededSession: session },
  );
  await page.reload();
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
};

const readPersistedState = async (
  page: Page,
) => page.evaluate(
  'import("/src/app/compositionRoot.ts").then(async ({ getApplicationEditorHost }) => { const host = getApplicationEditorHost(); await host.canvas.ready; await host.canvas.retryPersistence(); const state = host.canvas.getState(); return { ...state, grid: Array.from(state.grid.entries()), canvasSessions: state.canvasSessions.map((session) => ({ ...session, grid: session.grid ? Array.from(session.grid) : [], scene: session.scene ? Array.from(session.scene) : [], components: session.components ? Array.from(session.components) : [] })) }; })'
);

const readLiveCanvasState = (page: Page) =>
  page.evaluate<{
    activeCanvasId: string;
    canvasMode: string;
    structuredGridFocus: { x: number; y: number } | null;
    sessions: Array<{ id: string; name: string; mode: string }>;
  }>(
    'import("/src/app/compositionRoot.ts").then(({ getApplicationEditorHost }) => { const state = getApplicationEditorHost().canvas.getState(); return { activeCanvasId: state.activeCanvasId, canvasMode: state.canvasMode, structuredGridFocus: state.structuredGridFocus, sessions: state.canvasSessions.map(({ id, name, mode }) => ({ id, name, mode })) }; })'
  );

test.describe('Canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
  });

  test('should display canvas', async ({ page }) => {
    // Canvas should be visible
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('keeps overscanned rasters covering the viewport while panning', async ({ page }) => {
    const surface = page.getByTestId('canvas-editor-surface');
    const viewportLayer = page.getByTestId('canvas-viewport-layer');
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).not.toBeNull();

    const initialCoverage = await viewportLayer.evaluate((layer) => {
      const surface = layer.parentElement!;
      const surfaceRect = surface.getBoundingClientRect();
      return Array.from(layer.querySelectorAll(':scope > canvas')).map((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return {
          leftGutter: surfaceRect.left - rect.left,
          topGutter: surfaceRect.top - rect.top,
          rightGutter: rect.right - surfaceRect.right,
          bottomGutter: rect.bottom - surfaceRect.bottom,
        };
      });
    });
    expect(initialCoverage).toEqual([
      { leftGutter: 128, topGutter: 128, rightGutter: 128, bottomGutter: 128 },
      { leftGutter: 128, topGutter: 128, rightGutter: 128, bottomGutter: 128 },
      { leftGutter: 128, topGutter: 128, rightGutter: 128, bottomGutter: 128 },
    ]);

    const assertCovered = async () => {
      const covered = await viewportLayer.evaluate((layer) => {
        const surfaceRect = layer.parentElement!.getBoundingClientRect();
        return Array.from(layer.querySelectorAll(':scope > canvas')).every((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return (
            rect.left <= surfaceRect.left + 1 &&
            rect.top <= surfaceRect.top + 1 &&
            rect.right >= surfaceRect.right - 1 &&
            rect.bottom >= surfaceRect.bottom - 1
          );
        });
      });
      expect(covered).toBe(true);
    };

    const center = {
      x: surfaceBox!.x + surfaceBox!.width / 2,
      y: surfaceBox!.y + surfaceBox!.height / 2,
    };
    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(center.x + 420, center.y + 260);
    await assertCovered();
    await page.mouse.move(center.x - 420, center.y - 260);
    await assertCovered();
    await page.mouse.up({ button: 'middle' });
  });

  test('keeps the world point under an off-center wheel zoom anchor', async ({ page }) => {
    const surface = page.getByTestId('canvas-editor-surface');
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).not.toBeNull();

    await expect.poll(
      () => readPersistedState(page),
      { message: 'canvas viewport should be persisted before zooming' },
    ).not.toBeNull();
    const before = await readPersistedState(page);
    expect(before).not.toBeNull();

    const clientAnchor = {
      x: Math.round(surfaceBox!.x + surfaceBox!.width * 0.78),
      y: Math.round(surfaceBox!.y + surfaceBox!.height * 0.31),
    };
    const anchor = {
      x: clientAnchor.x - surfaceBox!.x,
      y: clientAnchor.y - surfaceBox!.y,
    };
    const worldBefore = {
      x: (anchor.x - before!.offset.x) / before!.zoom,
      y: (anchor.y - before!.offset.y) / before!.zoom,
    };

    await surface.dispatchEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: clientAnchor.x,
      clientY: clientAnchor.y,
      ctrlKey: true,
      deltaY: -120,
    });

    await expect.poll(async () => (await readPersistedState(page))?.zoom)
      .not.toBe(before!.zoom);
    const after = await readPersistedState(page);
    expect(after).not.toBeNull();

    const worldAfter = {
      x: (anchor.x - after!.offset.x) / after!.zoom,
      y: (anchor.y - after!.offset.y) / after!.zoom,
    };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 5);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 5);
  });

  test('does not render a red origin marker', async ({ page }) => {
    const offset = { x: 220, y: 180 };

    for (const mode of ['freeform', 'structured'] as const) {
      await seedSession(page, {
        id: `origin-${mode}`,
        name: `Origin ${mode}`,
        mode,
        scene: [],
        grid: [],
        viewport: { offset, zoom: 1 },
      });

      const surface = page.getByTestId('canvas-editor-surface');
      const backgroundCanvas = surface.locator('canvas').nth(0);
      const uiCanvas = surface.locator('canvas').nth(2);

      await expect.poll(() => backgroundCanvas.evaluate((canvas) => {
        const ctx = canvas.getContext('2d');
        return ctx?.getImageData(0, 0, 1, 1).data[3] ?? 0;
      })).toBe(255);

      const redPixels = await uiCanvas.evaluate((canvas, origin) => {
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.clientWidth === 0 || canvas.clientHeight === 0) return -1;
        const scaleX = canvas.width / canvas.clientWidth;
        const scaleY = canvas.height / canvas.clientHeight;
        const width = Math.max(1, Math.round(24 * scaleX));
        const height = Math.max(1, Math.round(24 * scaleY));
        const x = Math.max(0, Math.round(origin.x * scaleX - width / 2));
        const y = Math.max(0, Math.round(origin.y * scaleY - height / 2));
        const pixels = ctx.getImageData(x, y, width, height).data;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (
            pixels[index] > 240 &&
            pixels[index + 1] < 15 &&
            pixels[index + 2] < 15 &&
            pixels[index + 3] > 240
          ) {
            count += 1;
          }
        }
        return count;
      }, offset);

      expect(redPixels).toBe(0);
    }
  });

  test('recovers an incomplete v2 session payload before the first render', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.evaluate((storageKey) => {
      localStorage.setItem(storageKey, JSON.stringify({
        state: {
          schemaVersion: 2,
          workspace: {
            offset: { x: 12, y: 8 },
            zoom: 1.25,
            canvasMode: 'freeform',
            grid: [['0,0', { char: 'A', color: '#ffffff' }]],
            structuredScene: [],
            structuredComponents: [],
          },
          sessions: {
            activeId: 'canvas-1',
          },
          preferences: {
            brushChar: '#',
            brushColor: '#ffffff',
            showGrid: true,
            exportShowGrid: false,
          },
        },
        version: 2,
      }));
    }, STORAGE_KEY);

    await page.reload();

    await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Select canvas' })
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('keeps the color picker bounds stable when switching palette tabs', async ({ page }) => {
    const colorItem = page.locator('[data-toolbar-item="color"]');
    await colorItem.locator('button').last().click();

    const paletteTabs = page.getByRole('tablist', { name: 'Color palettes' });
    const popover = page.locator('[data-slot="popover-content"]').filter({
      has: paletteTabs,
    });
    await expect(popover).toBeVisible();
    const ansiBounds = await popover.boundingBox();
    expect(ansiBounds).not.toBeNull();

    await paletteTabs.getByRole('tab', { name: 'Presets' }).click();
    await expect(
      paletteTabs.getByRole('tab', { name: 'Presets' })
    ).toHaveAttribute('aria-selected', 'true');
    const presetBounds = await popover.boundingBox();
    expect(presetBounds).not.toBeNull();

    const contentFrame = page.getByTestId('color-picker-content-frame');
    const frameMetrics = await contentFrame.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(frameMetrics.scrollHeight).toBeLessThanOrEqual(
      frameMetrics.clientHeight
    );

    expect(Math.abs(presetBounds!.width - ansiBounds!.width))
      .toBeLessThanOrEqual(1);
    expect(Math.abs(presetBounds!.height - ansiBounds!.height))
      .toBeLessThanOrEqual(1);
    expect(Math.abs(presetBounds!.x - ansiBounds!.x))
      .toBeLessThanOrEqual(1);
    expect(Math.abs(presetBounds!.y - ansiBounds!.y))
      .toBeLessThanOrEqual(1);
  });

  test('self-hosts routed fonts and renders emoji with the canvas color', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const faces = await Promise.all([
        document.fonts.load('24px "Maple Mono NF CN"', 'A╭你'),
        document.fonts.load('700 24px "Maple Mono NF CN"', 'A╭你'),
        document.fonts.load('24px "JuliaMono"', '←∞✓◆⌘⚠'),
        document.fonts.load('40px "Noto Emoji"', '👩🏽‍💻'),
      ]);
      await document.fonts.ready;

      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 96, 96);
      ctx.font = '40px "Noto Emoji"';
      ctx.fillStyle = 'rgb(255, 0, 0)';
      ctx.textBaseline = 'top';
      ctx.fillText('😀', 8, 8);
      const pixels = ctx.getImageData(0, 0, 96, 96).data;
      let painted = 0;
      let offColor = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] === 0) continue;
        painted += 1;
        if (pixels[index + 1] > 2 || pixels[index + 2] > 2) offColor += 1;
      }

      const externalFontRequests = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) =>
          /fontsapi\.zeoseven\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url)
        );
      return {
        loadedFamilies: faces.map((items) => items.map((face) => face.family)),
        painted,
        offColor,
        externalFontRequests,
      };
    });

    expect(result.loadedFamilies[0]).toContain('Maple Mono NF CN');
    expect(result.loadedFamilies[1]).toContain('Maple Mono NF CN');
    expect(result.loadedFamilies[2]).toContain('JuliaMono');
    expect(result.loadedFamilies[3]).toContain('Noto Emoji');
    expect(result.painted).toBeGreaterThan(0);
    expect(result.offColor).toBe(0);
    expect(result.externalFontRequests).toEqual([]);
  });

  test('downloads only the JuliaMono shards required by rendered symbols', async ({ browser, page }) => {
    const baseURL = new URL(page.url()).origin;
    const context = await browser.newContext();
    const probe = await context.newPage();
    await probe.route('**/__font-probe', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }));
    await probe.goto(`${baseURL}/__font-probe`);
    const requests: string[] = [];
    probe.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.includes('/assets/julia-mono/')) requests.push(pathname);
    });
    await probe.addStyleTag({ url: '/packages/fonts/fonts.css' });

    for (const [grapheme, shard] of [
      ['→', 'arrows.woff2'],
      ['∞', 'math-technical.woff2'],
      ['◆', 'graphics.woff2'],
    ] as const) {
      const before = requests.length;
      const loaded = await probe.evaluate(async (sample) =>
        (await document.fonts.load('24px "JuliaMono"', sample)).map(({ family }) => family),
      grapheme);
      expect(loaded).toContain('JuliaMono');
      expect(requests.slice(before)).toEqual([
        `/packages/fonts/assets/julia-mono/${shard}`,
      ]);
    }

    expect(requests).not.toContain(
      '/packages/fonts/assets/julia-mono/JuliaMono-Regular.woff2'
    );
    await context.close();
  });

  test('loads curated character packs before lazy Unicode explorer shards', async ({ page }) => {
    const requested: string[] = [];
    await page.goto('about:blank');
    await page.route('**/data/characters/**', async (route) => {
      requested.push(route.request().url());
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: 'Search characters' })).toBeVisible();

    await expect.poll(() => requested).toEqual(expect.arrayContaining([
      expect.stringContaining('/data/characters/manifest.json'),
      expect.stringContaining('/data/characters/packs/essentials.'),
      expect.stringContaining('/data/characters/packs/nerd.'),
      expect.stringContaining('/data/characters/packs/emoji.'),
    ]));

    const beforeOpen = requested.filter((url) =>
      url.includes('/data/characters/unicode/')
    );
    expect(beforeOpen).toEqual([]);

    await page.getByRole('tab', { name: 'Unicode' }).click();
    await expect.poll(() => requested.filter((url) =>
      url.includes('/data/characters/unicode/')
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('/data/characters/unicode/manifest.'),
      expect.stringContaining('/data/characters/unicode/shards/'),
    ]));

    expect(requested.some((url) => url.includes('/name-index.'))).toBe(false);
    expect(await page.locator('button[data-character-codepoints]').count()).toBeLessThanOrEqual(300);

    await page.getByRole('searchbox', { name: 'Search characters' }).fill(
      'latin capital letter a'
    );
    await page.getByRole('button', { name: 'Search all Unicode' }).click();
    await expect.poll(() => requested).toEqual(expect.arrayContaining([
      expect.stringContaining('/data/characters/unicode/name-index.'),
    ]));
  });

  test('localizes curated character directories without translating view names', async ({ page }) => {
    await expect(page.getByText('ASCII & Punctuation', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'UI language' }).click();
    await expect(page.getByText('ASCII 与标点', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Essentials', exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Nerd Icons', exact: true }).click();
    await expect(page.getByText('天气图标', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Nerd Icons', exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Emoji', exact: true }).click();
    await expect(page.getByText('笑脸与情感', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Emoji', exact: true })).toBeVisible();
  });

  test('keeps the current curated character group title at the scroll viewport top', async ({
    page,
  }) => {
    const content = page.getByTestId('sidebar-view-content');
    const viewport = content.locator('[data-slot="scroll-area-viewport"]');
    const headers = content.locator('[data-slot="character-group-header"]');
    const firstHeader = headers.first();
    const nextHeader = headers.nth(1);

    await expect(firstHeader).toHaveAttribute('data-surface-kind', 'embedded');
    await expect(firstHeader).toHaveCSS('position', 'sticky');
    expect(await firstHeader.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe('rgba(0, 0, 0, 0)');

    await viewport.evaluate((element) => {
      element.scrollTop = 200;
    });
    await expect.poll(async () => {
      const [viewportBox, headerBox] = await Promise.all([
        viewport.boundingBox(),
        firstHeader.boundingBox(),
      ]);
      if (!viewportBox || !headerBox) return Number.POSITIVE_INFINITY;
      return Math.abs(headerBox.y - viewportBox.y);
    }).toBeLessThanOrEqual(1);

    await nextHeader.getByRole('button').click();
    await nextHeader.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await expect.poll(async () => {
      const [viewportBox, headerBox] = await Promise.all([
        viewport.boundingBox(),
        nextHeader.boundingBox(),
      ]);
      if (!viewportBox || !headerBox) return Number.POSITIVE_INFINITY;
      return Math.abs(headerBox.y - viewportBox.y);
    }).toBeLessThanOrEqual(1);

    const [firstBox, nextBox] = await Promise.all([
      firstHeader.boundingBox(),
      nextHeader.boundingBox(),
    ]);
    expect(firstBox).not.toBeNull();
    expect(nextBox).not.toBeNull();
    expect(firstBox!.y).toBeLessThan(nextBox!.y);
  });

  test('uses horizontal character view tabs in the mobile sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open library' }).click();

    const mobileSidebar = page.locator(
      '[data-slot="sidebar"][data-mobile="true"]'
    );
    await expect(mobileSidebar).toBeVisible();
    await expect(mobileSidebar).toHaveCSS('width', '288px');
    await expect(mobileSidebar).toHaveCSS('border-left-width', '0px');
    await expect(mobileSidebar).toHaveCSS(
      'box-shadow',
      /rgba\(0, 0, 0, 0\) 0px 0px 0px 0px/
    );
    await expect(
      mobileSidebar.getByTestId('character-view-rail-horizontal')
    ).toBeVisible();
    await expect(
      mobileSidebar.getByTestId('character-view-rail-vertical')
    ).toHaveCount(0);

    const tabs = mobileSidebar.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    expect(await tabs.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label'))
    )).toEqual([
      'Essentials',
      'Nerd Icons',
      'Emoji',
      'Unicode',
    ]);

    await mobileSidebar.getByRole('tab', { name: 'Unicode' }).click();
    await expect(
      mobileSidebar.getByRole('tabpanel', { name: 'Unicode characters' })
    ).toBeVisible();
  });

  test('uses a left view rail for the structured library and preserves it when collapsed', async ({ page }) => {
    await seedSession(page, {
      id: 'structured-sidebar-e2e',
      name: 'Structured Sidebar E2E',
      mode: 'structured',
      scene: [],
      grid: [],
      viewport: { offset: { x: 180, y: 130 }, zoom: 1 },
    });

    const sidebar = page.locator(
      '[data-slot="sidebar"][data-side="right"]'
    );
    const rail = page.getByTestId('structured-view-rail-vertical');
    await expect(rail).toBeVisible();
    await expect(page.getByTestId('structured-view-rail-horizontal')).toHaveCount(0);
    await expect(rail.getByRole('tab')).toHaveCount(2);
    await expect(rail.getByRole('tab', { name: 'Components' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('searchbox', { name: 'Search structured library' }))
      .toBeVisible();

    await rail.getByRole('tab', { name: 'Template' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Template' })).toBeVisible();

    await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    await expect(page.getByRole('searchbox', { name: 'Search structured library' }))
      .toHaveCount(0);
    await expect(page.getByTestId('structured-view-rail-vertical')).toBeVisible();

    await page.getByRole('tab', { name: 'Components' }).click();
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');
    await expect(page.getByRole('tabpanel', { name: 'Components' })).toBeVisible();
  });

  test('uses a horizontal structured view rail in the mobile sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page, {
      id: 'structured-mobile-sidebar-e2e',
      name: 'Structured Mobile Sidebar E2E',
      mode: 'structured',
      scene: [],
      grid: [],
      viewport: { offset: { x: 80, y: 90 }, zoom: 1 },
    });
    await page.getByRole('button', { name: 'Open library' }).click();

    const mobileSidebar = page.locator(
      '[data-slot="sidebar"][data-mobile="true"]'
    );
    await expect(
      mobileSidebar.getByTestId('structured-view-rail-horizontal')
    ).toBeVisible();
    await expect(
      mobileSidebar.getByTestId('structured-view-rail-vertical')
    ).toHaveCount(0);
    await expect(
      mobileSidebar.getByTestId('structured-view-rail-horizontal').getByRole('tab')
    ).toHaveCount(2);
  });

  test('keeps the top bar anchored while the sidebar collapses', async ({ page }) => {
    const topBar = page.getByTestId('app-top-bar');
    const sidebar = page.locator(
      '[data-slot="sidebar"][data-side="right"]'
    );
    const toggle = page.getByRole('button', { name: 'Toggle Sidebar' });

    await expect(topBar).toHaveCSS('left', '12px');
    const initialBox = await topBar.boundingBox();
    expect(initialBox).not.toBeNull();

    await toggle.click();
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    const collapsedBox = await topBar.boundingBox();
    expect(collapsedBox).not.toBeNull();
    expect(collapsedBox!.x).toBeCloseTo(initialBox!.x);
    expect(collapsedBox!.y).toBeCloseTo(initialBox!.y);

    await toggle.click();
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');
    const expandedBox = await topBar.boundingBox();
    expect(expandedBox).not.toBeNull();
    expect(expandedBox!.x).toBeCloseTo(initialBox!.x);
    expect(expandedBox!.y).toBeCloseTo(initialBox!.y);
  });

  test('moves the sidebar trigger on a horizontal path', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Toggle Sidebar' });
    const sidebar = page.locator(
      '[data-slot="sidebar"][data-side="right"]'
    );
    const initialBox = await trigger.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialCenter = {
      x: initialBox!.x + initialBox!.width / 2,
      y: initialBox!.y + initialBox!.height / 2,
    };
    const sampleMotion = () => trigger.evaluate(async (element) => {
      const control = element as HTMLElement;
      const points: Array<{ x: number; y: number }> = [];
      control.click();
      const startedAt = performance.now();
      do {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const rect = control.getBoundingClientRect();
        points.push({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      } while (performance.now() - startedAt < 260);
      return points;
    });
    const expectHorizontalPath = (points: Array<{ x: number; y: number }>) => {
      expect(points.length).toBeGreaterThan(1);
      const yValues = points.map((point) => point.y);
      expect(Math.max(...yValues) - Math.min(...yValues)).toBeLessThanOrEqual(1);
      expect(Math.abs(points.at(-1)!.x - points[0].x)).toBeGreaterThan(1);
    };

    const collapsePoints = await sampleMotion();
    expectHorizontalPath(collapsePoints);
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    expect(collapsePoints.at(-1)!.y).toBeCloseTo(initialCenter.y);

    await trigger.click();
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');
    await page.waitForTimeout(250);
    const expandedBox = await trigger.boundingBox();
    expect(expandedBox).not.toBeNull();
    expect(expandedBox!.x + expandedBox!.width / 2).toBeCloseTo(initialCenter.x);
    expect(expandedBox!.y + expandedBox!.height / 2).toBeCloseTo(initialCenter.y);
  });

  test('uses borderless color-block chrome for the desktop sidebar', async ({ page }) => {
    const sidebarInner = page.locator('[data-slot="sidebar-inner"]');
    const header = page.locator('[data-slot="sidebar-header"]');
    const footer = page.locator('[data-slot="sidebar-footer"]');
    const railShell = page
      .getByTestId('character-view-rail-vertical')
      .locator('..');
    const search = page.getByRole('searchbox', { name: 'Search characters' });

    await expect(sidebarInner).toHaveCSS('border-top-width', '0px');
    await expect(sidebarInner).toHaveCSS(
      'box-shadow',
      /rgba\(0, 0, 0, 0\) 0px 0px 0px 0px/
    );
    await expect(header).toHaveCSS('border-bottom-width', '0px');
    await expect(footer).toHaveCSS('border-top-width', '0px');
    await expect(railShell).toHaveCSS('border-right-width', '0px');
    await expect(search).toHaveCSS('border-top-width', '0px');

    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(sidebarInner).toHaveCSS('border-top-width', '0px');
    await expect(search).toHaveCSS('border-top-width', '0px');
  });

  test('delays tooltips and places them by interface region', async ({ page }) => {
    const tooltip = page.locator('[data-slot="tooltip-content"]');

    const dockTrigger = page
      .locator('[role="toolbar"]')
      .first()
      .getByRole('button', { name: 'Select', exact: true });
    await dockTrigger.hover();
    await page.waitForTimeout(250);
    await expect(tooltip).toHaveCount(0);
    await expect(tooltip).toBeVisible({ timeout: 1_000 });
    await expect(tooltip).toHaveAttribute('data-side', 'top');

    await page.mouse.move(0, 0);
    await page.waitForTimeout(350);

    const languageTrigger = page.getByRole('button', { name: 'UI language' });
    await languageTrigger.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveAttribute('data-side', 'top');

    await page.mouse.move(0, 0);
    await page.waitForTimeout(350);

    const characterTrigger = page.locator('button[data-character-codepoints]').nth(40);
    await expect(characterTrigger).toBeVisible();
    await characterTrigger.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveAttribute('data-side', 'top');
    await expect(tooltip.locator(':scope > [data-slot="tooltip-title"]')).toBeVisible();
    await expect(tooltip.locator(':scope > [data-slot="tooltip-meta"]')).toContainText('U+');

    await page.mouse.move(0, 0);
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    await languageTrigger.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveAttribute('data-side', 'left');
  });

  test('shows Slides view tooltips after the Sidebar rail delay', async ({ page }) => {
    await page.getByRole('button', { name: 'Select canvas' }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem', { name: 'New Slides' }).hover();
    await page.getByRole('menuitem', { name: /Widescreen/ }).click();

    const slidesTab = page
      .getByTestId('slide-view-rail-vertical')
      .getByRole('tab', { name: 'Slides' });
    const tooltip = page.locator('[data-slot="tooltip-content"]');

    await slidesTab.hover();
    await page.waitForTimeout(200);
    await expect(tooltip).toHaveCount(0);
    await expect(tooltip).toBeVisible({ timeout: 500 });
    await expect(tooltip).toHaveText('Slides');
    await expect(tooltip).toHaveAttribute('data-side', 'left');
  });

  test('should have toolbar', async ({ page }) => {
    // Toolbar buttons should be visible
    const toolbar = page.locator('[role="toolbar"]').first();
    await expect(toolbar).toBeVisible();
  });

  test('should create new session', async ({ page }) => {
    await page.getByRole('button', { name: 'Select canvas' }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem', { name: 'New Freeform' }).click();

    await expect.poll(async () => {
      const state = await readPersistedState(page);
      return state?.canvasSessions?.length ?? 0;
    }).toBeGreaterThan(1);
  });

  test('restores a newly created session after an immediate reload', async ({ page }) => {
    const before = await readLiveCanvasState(page);
    await page.getByRole('button', { name: 'Select canvas' }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem', { name: 'New Freeform' }).click();
    const created = await readLiveCanvasState(page);
    expect(created.sessions).toHaveLength(before.sessions.length + 1);
    expect(created.activeCanvasId).not.toBe(before.activeCanvasId);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
    const restored = await readLiveCanvasState(page);
    expect(restored.activeCanvasId).toBe(created.activeCanvasId);
    expect(restored.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.activeCanvasId }),
    ]));
  });

  test('binds different canvas sessions to split panes and restores them after reopening', async ({
    page,
  }) => {
    const appMenuTrigger = page.getByRole('button', { name: 'Open menu' });
    await appMenuTrigger.click();
    await page.getByRole('menuitem', { name: 'Split view' }).click();

    const primary = page.getByTestId('canvas-view-primary');
    const secondary = page.getByTestId('canvas-view-secondary');
    const topBar = page.getByTestId('app-top-bar');
    const resizeHandle = page.getByRole('separator', { name: 'Resize canvas views' });
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();
    await expect(resizeHandle).toHaveClass(/w-0\.5/);
    await expect(resizeHandle).toHaveClass(/bg-separator/);
    await expect(resizeHandle).not.toHaveClass(/rounded-full/);
    await expect(resizeHandle).not.toHaveClass(/bg-border/);
    await expect(topBar.getByTestId('canvas-session-selector-primary')).toBeVisible();
    await expect(
      topBar.getByTestId('canvas-session-selector-secondary')
    ).toHaveCount(0);
    const primarySelectorTrigger = topBar
      .getByTestId('canvas-session-selector-primary')
      .getByRole('button', { name: 'Select canvas' });
    const secondarySelectorTrigger = secondary.getByRole('button', {
      name: 'Select canvas',
    });
    await expect(primarySelectorTrigger).toHaveAttribute('data-pane-active', 'true');
    await expect(primarySelectorTrigger).toHaveAttribute('aria-current', 'true');
    await expect(secondarySelectorTrigger).not.toHaveAttribute('data-pane-active');
    const primarySessionId = await primary.getAttribute('data-session-id');
    const menuBounds = await appMenuTrigger.boundingBox();
    const primarySelectorBounds = await page
      .getByTestId('canvas-session-selector-primary')
      .boundingBox();
    const secondarySelectorBounds = await page
      .getByTestId('canvas-session-selector-secondary')
      .boundingBox();
    const collaborationBounds = await page
      .getByTestId('collaboration-control')
      .boundingBox();
    expect(menuBounds).not.toBeNull();
    expect(primarySelectorBounds).not.toBeNull();
    expect(secondarySelectorBounds).not.toBeNull();
    expect(collaborationBounds).not.toBeNull();
    expect(primarySelectorBounds!.y).toBeCloseTo(menuBounds!.y, 0);
    expect(primarySelectorBounds!.x).toBeCloseTo(menuBounds!.x + menuBounds!.width + 4, 0);
    expect(collaborationBounds!.x).toBeGreaterThanOrEqual(
      primarySelectorBounds!.x + primarySelectorBounds!.width + 4
    );
    expect(secondarySelectorBounds!.y).toBeCloseTo(menuBounds!.y, 0);

    const primaryBoundsBeforeResize = await primary.boundingBox();
    const resizeBounds = await resizeHandle.boundingBox();
    expect(primaryBoundsBeforeResize).not.toBeNull();
    expect(resizeBounds).not.toBeNull();
    await page.mouse.move(
      resizeBounds!.x + resizeBounds!.width / 2,
      resizeBounds!.y + resizeBounds!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(resizeBounds!.x + 80, resizeBounds!.y + resizeBounds!.height / 2, {
      steps: 4,
    });
    await page.mouse.up();
    await expect.poll(async () => (await primary.boundingBox())?.width ?? 0).toBeGreaterThan(
      primaryBoundsBeforeResize!.width + 40
    );
    await expect.poll(() =>
      page.evaluate(() => localStorage.getItem('chardesk-canvas-split-ratio'))
    ).not.toBeNull();

    await secondarySelectorTrigger.click();
    await expect(primarySelectorTrigger).not.toHaveAttribute('data-pane-active');
    await expect(secondarySelectorTrigger).toHaveAttribute('data-pane-active', 'true');
    await expect(secondarySelectorTrigger).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem', { name: 'New Freeform' }).click();
    await expect(page.getByRole('dialog', { name: 'Select canvas' })).toBeHidden();

    await expect(secondary).not.toHaveAttribute('data-session-id', primarySessionId ?? '');
    const secondarySessionId = await secondary.getAttribute('data-session-id');
    expect(secondarySessionId).toBeTruthy();

    await page.setViewportSize({ width: 600, height: 720 });
    await expect(page.getByTestId('canvas-view-primary')).toHaveCount(0);
    await expect(topBar.getByTestId('canvas-session-selector-secondary')).toBeVisible();
    await expect(page.getByTestId('canvas-session-selector-secondary')).toHaveCount(1);
    await expect(
      topBar
        .getByTestId('canvas-session-selector-secondary')
        .getByRole('button', { name: 'Select canvas' })
    ).not.toHaveAttribute('data-pane-active');

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();
    await expect(topBar.getByTestId('canvas-session-selector-primary')).toBeVisible();
    await expect(secondary.getByTestId('canvas-session-selector-secondary')).toBeVisible();
    await expect(
      secondary
        .getByTestId('canvas-session-selector-secondary')
        .getByRole('button', { name: 'Select canvas' })
    ).toHaveAttribute('data-pane-active', 'true');

    await appMenuTrigger.click();
    await page.getByRole('menuitem', { name: 'Close split view' }).click();
    await expect(page.getByRole('menuitem', { name: 'Close split view' })).toBeHidden();
    await expect(appMenuTrigger).toBeFocused();
    await expect(page.getByTestId('canvas-view-primary')).toHaveCount(0);
    const singleSelectorBounds = await page
      .getByTestId('canvas-session-selector-secondary')
      .boundingBox();
    expect(singleSelectorBounds).not.toBeNull();
    expect(singleSelectorBounds!.y).toBeCloseTo(menuBounds!.y, 0);
    expect(singleSelectorBounds!.x).toBeCloseTo(menuBounds!.x + menuBounds!.width + 4, 0);
    await expect(
      page
        .getByTestId('canvas-session-selector-secondary')
        .getByRole('button', { name: 'Select canvas' })
    ).not.toHaveAttribute('data-pane-active');

    await appMenuTrigger.click();
    await page.getByRole('menuitem', { name: 'Split view' }).click();
    await expect(page.getByTestId('canvas-view-primary')).toHaveAttribute(
      'data-session-id',
      primarySessionId ?? ''
    );
    await expect(page.getByTestId('canvas-view-secondary')).toHaveAttribute(
      'data-session-id',
      secondarySessionId ?? ''
    );
  });

  test('routes the first cell interaction to the active pane in a mixed-mode split', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Select canvas' }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem', { name: 'New Structured' }).click();
    const structuredState = await readLiveCanvasState(page);
    const structuredSession = structuredState.sessions.find(
      (session) => session.id === structuredState.activeCanvasId
    );
    expect(structuredSession).toBeTruthy();
    await expect(page.getByRole('dialog', { name: 'Select canvas' })).toBeHidden();
    await page.waitForTimeout(300);

    const appMenuTrigger = page.getByRole('button', { name: 'Open menu' });
    await appMenuTrigger.click();
    const splitViewItem = page.getByRole('menuitem', { name: 'Split view' });
    await expect(splitViewItem).toBeVisible();
    await splitViewItem.click();
    const primary = page.getByTestId('canvas-view-primary');
    const secondary = page.getByTestId('canvas-view-secondary');
    const primarySelector = page
      .getByTestId('app-top-bar')
      .getByTestId('canvas-session-selector-primary');
    const secondarySelector = secondary.getByTestId('canvas-session-selector-secondary');

    await secondarySelector.getByRole('button', { name: 'Select canvas' }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem', { name: 'New Freeform' }).click();
    const freeformState = await readLiveCanvasState(page);
    const freeformSession = freeformState.sessions.find(
      (session) => session.id === freeformState.activeCanvasId
    );
    expect(freeformSession).toBeTruthy();

    const clickPaneCell = async (pane: typeof primary) => {
      const surface = pane.getByTestId('canvas-editor-surface');
      const bounds = await surface.boundingBox();
      expect(bounds).not.toBeNull();
      await page.mouse.click(
        bounds!.x + bounds!.width / 2,
        bounds!.y + bounds!.height / 2
      );
    };

    await clickPaneCell(primary);
    await expect.poll(() => readLiveCanvasState(page)).toMatchObject({
      activeCanvasId: structuredSession!.id,
      canvasMode: 'structured',
      structuredGridFocus: expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    });

    await primarySelector.getByRole('button', { name: 'Select canvas' }).click();
    await page
      .locator('[role="dialog"][data-state="open"]')
      .getByRole('button', { name: freeformSession!.name, exact: true })
      .click();
    await secondarySelector.getByRole('button', { name: 'Select canvas' }).click();
    await page
      .locator('[role="dialog"][data-state="open"]')
      .getByRole('button', { name: structuredSession!.name, exact: true })
      .click();

    await clickPaneCell(primary);
    await expect.poll(() => readLiveCanvasState(page)).toMatchObject({
      activeCanvasId: freeformSession!.id,
      canvasMode: 'freeform',
    });
    await clickPaneCell(secondary);
    await expect.poll(() => readLiveCanvasState(page)).toMatchObject({
      activeCanvasId: structuredSession!.id,
      canvasMode: 'structured',
      structuredGridFocus: expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    });
  });

  test('commits a freeform shape drag to the persisted grid', async ({ page }) => {
    const viewport = { offset: { x: 180, y: 130 }, zoom: 1 };
    await seedSession(page, {
      id: 'freeform-e2e', name: 'Freeform E2E', mode: 'freeform',
      scene: [], grid: [], viewport,
    });
    await page.getByRole('button', { name: 'Box' }).click();
    const surface = page.getByTestId('canvas-editor-surface');
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    const start = {
      x: box!.x + viewport.offset.x + 2 * CELL_WIDTH,
      y: box!.y + viewport.offset.y + 2 * CELL_HEIGHT,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 3 * CELL_WIDTH, start.y, { steps: 4 });
    await page.mouse.up();

    await expect.poll(async () => {
      const state = await readPersistedState(page);
      return state.grid.length;
    }).toBeGreaterThan(0);
  });

  test('moves a structured node and persists the scene', async ({ page }) => {
    const viewport = { offset: { x: 180, y: 130 }, zoom: 1 };
    const node = {
      id: 'box-1', type: 'box', order: 1,
      start: { x: 0, y: 0 }, end: { x: 8, y: 4 },
      style: { color: '#111827' },
    };
    await seedSession(page, {
      id: 'structured-e2e', name: 'Structured E2E', mode: 'structured',
      scene: [node], components: [], grid: [], viewport,
    });
    const box = await page.getByTestId('canvas-editor-surface').boundingBox();
    expect(box).not.toBeNull();
    const start = {
      x: box!.x + viewport.offset.x + 4 * CELL_WIDTH,
      y: box!.y + viewport.offset.y + 2 * CELL_HEIGHT,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 2 * CELL_WIDTH, start.y + CELL_HEIGHT, { steps: 4 });
    await page.mouse.up();

    await expect.poll(async () => {
      const state = await readPersistedState(page);
      const moved = state.structuredScene.find((item: { id: string }) => item.id === node.id);
      return moved?.start;
    }).toEqual({ x: 2, y: 1 });
  });

  test('keeps structured text input focused after clicking the same caret position', async ({ page }) => {
    const viewport = { offset: { x: 180, y: 130 }, zoom: 1 };
    const textNode = {
      id: 'text-1', type: 'text', order: 1,
      position: { x: 2, y: 2 }, text: 'Edit',
      style: { color: '#111827' },
    };
    await seedSession(page, {
      id: 'structured-text-e2e', name: 'Structured Text E2E', mode: 'structured',
      scene: [textNode], components: [], grid: [], viewport,
    });
    const box = await page.getByTestId('canvas-editor-surface').boundingBox();
    expect(box).not.toBeNull();
    const caret = {
      x: box!.x + viewport.offset.x + 3 * CELL_WIDTH,
      y: box!.y + viewport.offset.y + 2 * CELL_HEIGHT,
    };

    await page.mouse.dblclick(caret.x, caret.y);
    await page.keyboard.type('A');
    await expect.poll(async () => {
      const state = await readPersistedState(page);
      return state.structuredScene.find(
        (item: { id: string }) => item.id === textNode.id,
      )?.text as string;
    }).toContain('A');
    const afterFirstState = await readPersistedState(page);
    const afterFirstInput = afterFirstState.structuredScene.find(
      (item: { id: string }) => item.id === textNode.id,
    )?.text as string;

    await page.mouse.click(caret.x, caret.y);
    await page.keyboard.type('B');
    await expect.poll(async () => {
      const state = await readPersistedState(page);
      return state.structuredScene.find(
        (item: { id: string }) => item.id === textNode.id,
      )?.text as string;
    }).toContain('B');
    expect(afterFirstInput).not.toContain('B');
  });

});

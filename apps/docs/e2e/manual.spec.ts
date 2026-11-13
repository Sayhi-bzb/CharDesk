import { expect, test, type Page } from '@playwright/test';
import { clickCellTarget } from '@chardesk/docs-ui/testing';

const ready = (page: Page) => expect(page.locator('[data-manual-cell-ui="ready"]')).toBeVisible();
const searchText = (page: Page) => page.locator('[data-cell-probe="manual-search"]').evaluate(node => (node as HTMLElement & { __chardeskCellProbeV5?: { text: string } }).__chardeskCellProbeV5?.text ?? '');
async function openSearch(page: Page) {
  await ready(page);
  await clickCellTarget(page.getByRole('button', { name: 'Search the manual', exact: true }));
  await expect(page.getByRole('textbox', { name: 'Search the manual' })).toBeVisible();
}

test('the default page uses the portal header, navigation, contents and Cell article', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Getting started · CharDesk Manual');
  for (const probe of ['gallery-header', 'gallery-nav-manual-0', 'gallery-toc', 'manual-article']) {
    await expect(page.locator(`[data-cell-probe="${probe}"] canvas`).first()).toBeVisible();
  }
  await expect(page.locator('.manual-fallback')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cell view', exact: true })).toHaveCount(0);
  await expect(page.locator('.gallery-page')).toHaveAttribute('data-gallery-font', 'fusion-mono');
});

test('initial load and refresh do not paint the HTML fallback while scripts are loading', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('chardesk-docs-theme', 'dark');
    const state = { fallbackFrames: 0, wrongThemeFrames: 0 };
    Object.assign(window, { manualBootCheck: state });
    const sample = () => {
      const fallback = document.querySelector<HTMLElement>('.manual-fallback');
      if (fallback && getComputedStyle(fallback).display !== 'none') state.fallbackFrames++;
      if (fallback && document.documentElement.dataset.galleryTheme !== 'dark') state.wrongThemeFrames++;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (const refresh of [false, true]) {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/assets/entry.client-*.js', async route => { await gate; await route.continue(); });
    try {
      if (refresh) await page.reload({ waitUntil: 'commit' });
      else await page.goto('/editing/selection/', { waitUntil: 'commit' });
      await expect(page.locator('.manual-fallback')).toBeAttached();
      await expect(page.locator('.manual-fallback')).toBeHidden();
      await expect(page.getByRole('status', { name: 'Loading manual' })).toBeVisible();
    } finally { release(); }
    await ready(page);
    await expect(page.locator('.manual-fallback')).toBeHidden();
    expect(await page.evaluate(() => (window as Window & { manualBootCheck?: { fallbackFrames: number; wrongThemeFrames: number } }).manualBootCheck)).toEqual({ fallbackFrames: 0, wrongThemeFrames: 0 });
    await page.unroute('**/assets/entry.client-*.js');
  }
});

test('the first Cell view waits for the preferred display font', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*.woff2', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-gallery-font-status', 'loading');
    await expect(page.locator('[data-manual-cell-ui]')).toBeHidden();
    await expect(page.locator('.manual-fallback')).toBeHidden();
    await expect(page.getByRole('status', { name: 'Loading manual' })).toBeVisible();
  } finally { release(); }
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-gallery-font', 'fusion-mono');
});

test('a stalled bootstrap reveals readable text and keeps it stable if scripts arrive late', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/entry.client-*.js', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/terminal/', { waitUntil: 'commit' });
    await expect(page.getByRole('status', { name: 'Loading manual' })).toBeVisible();
    await expect(page.locator('.manual-fallback')).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('article')).toContainText('bun add -g @chardesk/cli');
  } finally { release(); }
  await expect(page.locator('[data-manual-cell-ui]')).toBeAttached();
  await expect(page.locator('.manual-fallback')).toBeVisible();
  await expect(page.locator('[data-manual-cell-ui]')).toBeHidden();
});

test('navigation preserves the Cell interface without reloading or exposing the HTML fallback', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const documents: string[] = [];
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url());
  });
  await page.evaluate(() => {
    const state = { fallbackFrames: 0 };
    Object.assign(window, { manualNavigationCheck: state });
    const sample = () => {
      const fallback = document.querySelector<HTMLElement>('.manual-fallback');
      if (fallback && getComputedStyle(fallback).display !== 'none') state.fallbackFrames++;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await clickCellTarget(page.getByRole('navigation', { name: 'Manual', exact: true }).getByRole('link', { name: 'Terminal canvas', exact: true }));
  await expect(page).toHaveURL(/\/terminal\/$/);
  await expect(page.getByRole('heading', { name: 'Terminal canvas', level: 1 })).toBeVisible();
  expect(documents).toEqual([]);
  await clickCellTarget(page.getByRole('navigation', { name: 'On this page', exact: true }).getByRole('link', { name: 'Terminal compatibility', exact: true }));
  await expect(page).toHaveURL(/#terminal-compatibility$/);
  const header = await page.locator('.gallery-header').elementHandle();
  await clickCellTarget(page.getByRole('navigation', { name: 'Manual', exact: true }).getByRole('link', { name: 'Selection', exact: true }));
  await expect(page.getByRole('heading', { name: 'Selection', level: 1 })).toBeVisible();
  expect(await header!.evaluate(node => node.isConnected)).toBe(true);
  await clickCellTarget(page.locator('[data-cell-probe="manual-article"]').getByRole('link', { name: 'search', exact: true }));
  await expect(page.getByRole('heading', { name: 'Finding content', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Selection', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/terminal\/#terminal-compatibility$/);
  await clickCellTarget(page.getByRole('link', { name: 'Manual', exact: true }));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/terminal\/#terminal-compatibility$/);
  await expect(page.getByRole('heading', { name: 'Terminal canvas', level: 1 })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();
  expect(documents).toEqual([]);
  expect(await page.evaluate(() => (window as Window & { manualNavigationCheck?: { fallbackFrames: number } }).manualNavigationCheck?.fallbackFrames)).toBe(0);
});

test('slow navigation keeps the current canvas readable until the next page is ready', async ({ page }) => {
  await page.goto('/terminal/'); await ready(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/editing/selection/_.data*', async route => { requested = true; await gate; await route.continue(); });
  try {
    await clickCellTarget(page.getByRole('navigation', { name: 'Manual', exact: true }).getByRole('link', { name: 'Selection', exact: true }));
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByRole('heading', { name: 'Terminal canvas', level: 1 })).toBeVisible();
    await expect(page.locator('.manual-fallback')).toBeHidden();
    await expect(page.locator('[data-cell-probe="manual-article"] canvas').first()).toBeVisible();
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Selection', level: 1 })).toBeVisible();
  await expect(page.locator('.manual-fallback')).toBeHidden();
});

test('Cell search finds an alias and navigates to the actual section', async ({ page }) => {
  await page.goto('/');
  const documents: string[] = [];
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
  await openSearch(page);
  const search = page.getByRole('textbox', { name: 'Search the manual' });
  await search.fill('copy');
  await expect(page.getByRole('link', { name: /Selection ·/ }).first()).toBeVisible();
  await search.fill('save');
  await expect(page.getByRole('link', { name: /Sessions ·/ }).first()).toBeVisible();
  await search.evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing: true })));
  await expect(page).toHaveURL(/\/$/);
  await clickCellTarget(page.getByRole('link', { name: /Sessions ·/ }).first());
  await expect(page).toHaveURL(/files\/sessions\/#/);
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Sessions', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Manual' }).locator('a[aria-current="page"]')).toHaveAccessibleName('Sessions');
  await expect(search).toHaveCount(0);
  await openSearch(page);
  await page.getByRole('textbox', { name: 'Search the manual' }).fill('selection');
  await expect(page.getByRole('link', { name: /Selection ·/ }).first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Search the manual' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Selection', level: 1 })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search the manual' })).toHaveCount(0);
  expect(documents).toEqual([]);
});

test('search supports keyboard opening, network recovery and dismissal', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.route('**/api/search', route => route.abort());
  await page.keyboard.press('Control+k');
  const search = page.getByRole('textbox', { name: 'Search the manual' });
  await expect(search).toBeFocused();
  await search.fill('复制');
  await expect.poll(() => searchText(page)).toContain('Search unavailable');
  await page.unroute('**/api/search');
  await clickCellTarget(page.getByRole('button', { name: 'Retry', exact: true }));
  await expect(page.getByRole('link', { name: /Selection ·/ }).first()).toBeVisible();
  await search.fill('zzzz-no-such-topic');
  await expect.poll(() => searchText(page)).toContain('No results');
  await search.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Search the manual' })).toHaveCount(0);
});

test('mobile uses the portal Accordion and persists its shared theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editing/selection/'); await ready(page);
  await clickCellTarget(page.getByRole('button', { name: /Browse documentation:/ }));
  await clickCellTarget(page.getByRole('link', { name: 'Terminal canvas', exact: true }));
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Terminal canvas', exact: true, level: 1 })).toBeVisible();
  await clickCellTarget(page.getByRole('button', { name: /^(Dark|Light)$/ }));
  const theme = await page.locator('html').getAttribute('data-gallery-theme');
  await page.reload(); await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-gallery-theme', theme!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the shared code block copies its actual source', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as Window & { copied?: string }).copied = text; } } }));
  await page.goto('/terminal/'); await ready(page);
  await clickCellTarget(page.getByRole('button', { name: 'Copy code', exact: true }).first());
  await expect.poll(() => page.evaluate(() => (window as Window & { copied?: string }).copied)).toContain('bun add -g @chardesk/cli');
});

test('browser Find and print use the same-source HTML fallback and return to the portal', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/editing/selection/'); await ready(page);
  await expect(page.locator('.manual-fallback')).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.manual-fallback')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Control+f');
  await expect(page.locator('.manual-fallback')).toBeVisible();
  await page.getByRole('button', { name: 'Back to the manual', exact: true }).click();
  await ready(page); await expect(page.locator('.manual-fallback')).toBeHidden();
  expect(errors).toEqual([]);
});

test('deep links remain readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto('/agents/connect/');
  await expect(page.getByRole('heading', { name: 'Connect an Agent', exact: true })).toBeVisible();
  await expect(page.locator('article')).toContainText('npx -y @chardesk/mcp');
  await expect(page.locator('#manual-navigation')).toBeVisible();
  await context.close();
});

test('a failed bootstrap preserves readable content and normal navigation', async ({ page }) => {
  await page.route('**/assets/entry.client-*.js', route => route.fulfill({ status: 503, contentType: 'application/javascript', headers: { 'Cache-Control': 'no-store' }, body: '' }));
  await page.goto('/editing/selection/');
  await expect(page.locator('.manual-fallback')).toBeVisible();
  await expect(page.locator('article')).toContainText('Select content');
  await page.getByRole('link', { name: 'Typing and pasting', exact: true }).click();
  await expect(page).toHaveURL(/editing\/input\//);
  await expect(page.getByRole('heading', { name: 'Typing and pasting', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('article')).toContainText('Type text');
});

test('missing pages offer a recovery link and are not indexed', async ({ page }) => {
  await page.goto('/does-not-exist/');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

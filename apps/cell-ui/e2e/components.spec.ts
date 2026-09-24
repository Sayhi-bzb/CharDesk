import { expect, test } from "@playwright/test";
import { cellPoint, ownerBounds, readCellPixel, readCellProbe } from "./helpers/cell-probe";
import { galleryFontSelect } from "./helpers/gallery-font-select";

const navigationLinks = [
  ["Accordion", "#/components/accordion"],
  ["Alert", "#/components/alert"],
  ["Badge", "#/components/badge"],
  ["Button", "#/components/button"],
  ["Checkbox", "#/components/checkbox"],
  ["Combobox", "#/components/combobox"],
  ["Dialog", "#/components/dialog"],
  ["Input", "#/components/input"],
  ["Progress", "#/components/progress"],
  ["Radio", "#/components/radio"],
  ["ScrollArea", "#/components/scroll-area"],
  ["Select", "#/components/select"],
  ["Separator", "#/components/separator"],
  ["Slider", "#/components/slider"],
  ["Spinner", "#/components/spinner"],
  ["Table", "#/components/table"],
  ["Tabs", "#/components/tabs"],
  ["Text", "#/components/text"],
  ["TextArea", "#/components/text-area"],
  ["Toggle", "#/components/toggle"],
  ["Tooltip", "#/components/tooltip"],
] as const;

test("component catalog drives concise, addressable documentation", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Cell UI" });
  await expect(page.getByRole("heading", { name: "Introduction", level: 1 })).toBeVisible();
  await expect(page.locator(".gallery-brand")).toHaveAttribute("href", "#/guides/introduction");
  await expect(nav.getByRole("group", { name: "Sections" }).getByRole("link")).toHaveText([
    "Introduction", "Philosophy", "Classic Macintosh", "Markdown", "Installation", "Integration", "Theming", "Testing",
  ]);
  await page.goto("/#/components/button");
  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();
  const group = nav.getByRole("group", { name: "Components" });
  await expect(nav.getByRole("group")).toHaveCount(2);
  for (const [name, href] of navigationLinks) {
    await expect(group.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(nav.getByRole("link", { name: "Button", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Appearance examples" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "View source" })).toBeVisible();
  await expect(page.getByRole("link", { name: "react.tsx" })).toHaveAttribute(
    "href", "https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx",
  );
  await expect(page.getByRole("link", { name: "button.ts" })).toHaveAttribute(
    "href", "https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/button.ts",
  );
  await expect(page.getByRole("heading", { name: "Installation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "API" })).toBeVisible();
  const toc = page.getByRole("navigation", { name: "On This Page" });
  await expect(toc.getByRole("link")).toHaveText(["Installation", "Usage", "View source", "API"]);
  await expect(toc.getByRole("link", { name: "Installation" })).toHaveAttribute("href", "#/components/button?section=installation");
  await expect(page.getByRole("tablist", { name: "Installation method" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Configure the registry" })).toBeVisible();
  await expect(page.getByText("npx shadcn@latest add @chardesk/cell-ui")).toBeVisible();
  await expect(page.locator("#usage + .docs-code")).toContainText("@/lib/cell-ui/browser");
  await expect(page.locator("#usage + .docs-code")).not.toContainText("@chardesk/cell-ui");
  const codeBlocks = page.locator(".docs-code");
  await expect(codeBlocks).toHaveCount(2);
  for (const codeBlock of await codeBlocks.all()) {
    await expect(codeBlock).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    for (const side of ["top", "right", "bottom", "left"] as const) {
      await expect(codeBlock).toHaveCSS(`border-${side}-width`, "2px");
    }
    await expect(codeBlock).toHaveCSS("border-top-style", "solid");
    await expect(codeBlock.locator("pre")).toHaveCSS("overflow-x", "auto");
    await expect(codeBlock.getByRole("button", { name: "Copy" })).toHaveCount(1);
  }
  await expect(page.locator(".docs-table-wrap td").first()).toHaveCSS("border-bottom-width", "2px");
  await expect(page.locator(".docs-preview canvas")).toHaveCount(1);
  await expect(galleryFontSelect(page).locator("canvas")).toHaveCount(1);
  await expect(page.locator("#core, #complex, #editor, #overlay, #virtualization")).toHaveCount(0);

  await nav.getByRole("link", { name: "Tabs", exact: true }).click();
  await expect(page).toHaveURL(/#\/components\/tabs$/);
  await expect(page.getByRole("heading", { name: "Tabs", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Tabs", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-cell-probe="component-tabs"]')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();

  const widePreviewBounds = await page.locator(".docs-preview").boundingBox();
  const wideHostBounds = await page.locator(".component-playground").boundingBox();
  const widePlaygroundBounds = await page.locator('[data-cell-probe="component-button"]').boundingBox();
  expect(widePreviewBounds).not.toBeNull();
  expect(wideHostBounds).not.toBeNull();
  expect(widePlaygroundBounds).not.toBeNull();
  expect(wideHostBounds!.x).toBeCloseTo(widePreviewBounds!.x, 4);
  expect(wideHostBounds!.x + wideHostBounds!.width).toBeCloseTo(
    widePreviewBounds!.x + widePreviewBounds!.width,
    4,
  );
  expect(widePlaygroundBounds!.x).toBeCloseTo(wideHostBounds!.x, 4);
  const wideRemainder = wideHostBounds!.x + wideHostBounds!.width
    - widePlaygroundBounds!.x - widePlaygroundBounds!.width;
  expect(wideRemainder).toBeGreaterThanOrEqual(0);
  expect(wideRemainder).toBeLessThan(9);
  const widePlayground = await readCellProbe(page.locator('[data-cell-probe="component-button"]'));
  expect(widePlayground.viewport).toEqual({
    width: Math.floor(wideHostBounds!.width / 9),
    height: 9,
  });
  const wideDivider = widePlayground.cells.find(
    (cell) => cell.ownerId === "component-button-playground-divider-0",
  );
  expect(wideDivider?.x).toBe(Math.floor((widePlayground.viewport.width - 1) / 2));
  expect(widePlayground.text).not.toContain("Props");
  expect(widePlayground.text).toContain("variant");
  expect(widePlayground.text).toContain("disabled");

  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(async () => (await readCellProbe(
    page.locator('[data-cell-probe="component-button"]'),
  )).viewport).toEqual({ width: 32, height: 19 });
  const narrowPlayground = await readCellProbe(page.locator('[data-cell-probe="component-button"]'));
  const narrowLines = narrowPlayground.text.split("\n");
  expect(narrowLines.some((line) => line.includes("[ ] disabled"))).toBe(true);
  expect(narrowLines.some((line) => line.includes("variant"))).toBe(true);
  const narrowPreviewBounds = await page.locator(".docs-preview").boundingBox();
  const narrowHostBounds = await page.locator(".component-playground").boundingBox();
  const narrowPlaygroundBounds = await page.locator('[data-cell-probe="component-button"]').boundingBox();
  expect(narrowPreviewBounds).not.toBeNull();
  expect(narrowHostBounds).not.toBeNull();
  expect(narrowPlaygroundBounds).not.toBeNull();
  expect(narrowHostBounds!.x).toBeCloseTo(narrowPreviewBounds!.x, 4);
  expect(narrowHostBounds!.x + narrowHostBounds!.width).toBeCloseTo(
    narrowPreviewBounds!.x + narrowPreviewBounds!.width,
    4,
  );
  const narrowRemainder = narrowHostBounds!.x + narrowHostBounds!.width
    - narrowPlaygroundBounds!.x - narrowPlaygroundBounds!.width;
  expect(narrowRemainder).toBeGreaterThanOrEqual(0);
  expect(narrowRemainder).toBeLessThan(9);
  for (const [slug, probeId] of [
    ["select", "component-select"],
    ["combobox", "component-combobox"],
    ["slider", "component-slider"],
    ["checkbox", "component-checkbox"],
    ["input", "component-input"],
    ["scroll-area", "component-scroll-area"],
  ] as const) {
    await page.goto(`/#/components/${slug}`);
    await expect.poll(async () => (await readCellProbe(
      page.locator(`[data-cell-probe="${probeId}"]`),
    )).viewport).toEqual({ width: 32, height: 15 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("desktop navigation scrolls independently and reveals its active link", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 320 });
  await page.goto("/#/guides/introduction");
  const nav = page.getByRole("navigation", { name: "Cell UI" });
  expect(await nav.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  await nav.hover();
  const pageY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 160);
  await expect.poll(() => nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);

  await page.mouse.move(700, 200);
  await page.mouse.wheel(0, 160);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pageY);
  await expect.poll(() => nav.evaluate((element) => element.getBoundingClientRect().top)).toBe(64);

  await nav.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await nav.hover();
  const edgeY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 160);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(edgeY);

  await page.goto("/#/components/tooltip");
  const active = nav.getByRole("link", { name: "Tooltip", exact: true });
  await expect(active).toHaveAttribute("aria-current", "page");
  await expect.poll(() => active.evaluate((element) => {
    const navBounds = element.closest("nav")!.getBoundingClientRect();
    const linkBounds = element.getBoundingClientRect();
    return linkBounds.top >= Math.max(navBounds.top, 0) - 1
      && linkBounds.bottom <= Math.min(navBounds.bottom, window.innerHeight) + 1;
  })).toBe(true);

  await page.setViewportSize({ width: 390, height: 640 });
  await expect(nav).toHaveCSS("overflow-y", "visible");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("TOC labels stay on one line and navigation ends with the page", async ({ page }) => {
  for (const width of [1280, 1050, 720, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/#/guides/introduction");
    const nav = page.getByRole("navigation", { name: "Cell UI" });
    const toc = page.getByRole("navigation", { name: "On This Page" });
    expect(await toc.getByRole("link").evaluateAll((links) => links.every((link) => link.getClientRects().length === 1))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    if (width <= 720) {
      await expect(nav).toHaveCSS("overflow-y", "visible");
      continue;
    }

    await expect(nav).toHaveCSS("scrollbar-width", "none");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const navBounds = await nav.boundingBox();
    const mainBounds = await page.locator("main.docs-page").boundingBox();
    expect(navBounds).not.toBeNull();
    expect(mainBounds).not.toBeNull();
    expect(navBounds!.y + navBounds!.height).toBeCloseTo(mainBounds!.y + mainBounds!.height, 0);
  }
});

test("header and navigation share a shell and meet without hiding section targets", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  for (const width of [1280, 1050]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/#/guides/introduction");
    await expect.poll(() => page.locator(".gallery-header__inner").evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(32);
    await expect.poll(() => page.getByRole("navigation", { name: "Cell UI" }).evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(80);
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector(".gallery-header")!.getBoundingClientRect();
      const inner = document.querySelector(".gallery-header__inner")!.getBoundingClientRect();
      const nav = document.querySelector(".gallery-nav")!.getBoundingClientRect();
      const toc = document.querySelector(".gallery-toc")!.getBoundingClientRect();
      return [nav.left - inner.left, nav.top - header.bottom, toc.top - header.bottom].map(Math.round);
    })).toEqual([0, 0, 0]);
    await page.goto("/#/guides/introduction?section=progress");
    await page.reload();
    const header = page.locator(".gallery-header");
    const nav = page.getByRole("navigation", { name: "Cell UI" });
    const heading = page.getByRole("heading", { name: "Show progress in text" });
    await expect(header).toHaveCSS("position", "sticky");
    await expect.poll(() => header.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(0);
    await expect.poll(() => page.evaluate(() => [8, window.innerWidth - 8].every((x) =>
      document.elementFromPoint(x, 8)?.closest(".gallery-header") !== null))).toBe(true);
    await expect.poll(() => nav.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(64);
    await expect.poll(() => heading.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBeGreaterThanOrEqual(72);
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector(".gallery-header")!.getBoundingClientRect();
      const inner = document.querySelector(".gallery-header__inner")!.getBoundingClientRect();
      const nav = document.querySelector(".gallery-nav")!.getBoundingClientRect();
      return [nav.left - inner.left, nav.top - header.bottom].map(Math.round);
    })).toEqual([0, 0]);
    if (width === 1280) {
      await expect(header).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await header.getByRole("button", { name: "Dark" }).click();
    }
    await expect(header).toHaveCSS("background-color", "rgb(0, 0, 0)");

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => header.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(0);
    await expect.poll(() => page.evaluate(() => [8, window.innerWidth - 8].every((x) =>
      document.elementFromPoint(x, 8)?.closest(".gallery-header") !== null))).toBe(true);
    const navBounds = await nav.boundingBox();
    const mainBounds = await page.locator("main.docs-page").boundingBox();
    expect(navBounds!.y + navBounds!.height).toBeCloseTo(mainBounds!.y + mainBounds!.height, 0);
  }

  for (const width of [720, 390, 320]) {
    await page.setViewportSize({ width, height: 640 });
    await page.goto("/#/guides/introduction");
    await expect(page.locator(".gallery-header")).toBeAttached();
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector(".gallery-header")!.getBoundingClientRect();
      const inner = document.querySelector(".gallery-header__inner")!.getBoundingClientRect();
      const nav = document.querySelector(".gallery-nav")!.getBoundingClientRect();
      return [nav.left - inner.left, nav.top - header.bottom].map(Math.round);
    })).toEqual([0, 0]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }

  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/#/guides/introduction?section=progress");
  await page.reload();
  const header = page.locator(".gallery-header");
  await expect(header).toHaveCSS("position", "static");
  await expect.poll(() => header.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThan(0);
  await expect.poll(() => page.getByRole("heading", { name: "Show progress in text" }).evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("keyboard focus reveals navigation links in a short viewport", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 320 });
  await page.goto("/#/guides/introduction");
  const nav = page.getByRole("navigation", { name: "Cell UI" });
  const links = nav.getByRole("link");
  if (browserName === "webkit") {
    // WebKit's default Tab policy skips links; explicit focus still exercises reveal.
    await links.last().focus();
  } else {
    await links.first().focus();
    for (let index = 1; index < await links.count(); index += 1) await page.keyboard.press("Tab");
  }
  await expect(links.last()).toBeFocused();
  expect(await nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test("installation shows copyable package-manager commands and registry setup", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { sessionStorage.setItem("copied-command", value); } },
    });
  });
  await page.goto("/#/components/button");
  const installation = page.locator("#installation").locator("xpath=..");
  const managers = installation.getByRole("tablist", { name: "Package manager" });
  await expect(installation.getByRole("tablist")).toHaveCount(1);
  await expect(managers.getByRole("tab", { name: "npm", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(installation.getByRole("link", { name: "Configure the registry" })).toHaveAttribute(
    "href", "#/guides/installation?section=configure",
  );
  const commands = {
    pnpm: "pnpm dlx",
    npm: "npx",
    yarn: "yarn dlx",
    bun: "bunx",
  } as const;
  for (const [manager, prefix] of Object.entries(commands)) {
    await managers.getByRole("tab", { name: manager, exact: true }).click();
    const command = `${prefix} shadcn@latest add @chardesk/cell-ui`;
    const panel = installation.getByRole("tabpanel", { name: `${manager} installation command` });
    await expect(panel).toContainText(command);
    await panel.getByRole("button").click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("copied-command"))).toBe(command);
  }
  await managers.getByRole("tab", { name: "bun" }).focus();
  await page.keyboard.press("Home");
  await expect(managers.getByRole("tab", { name: "pnpm" })).toHaveAttribute("aria-selected", "true");
  await expect(installation.getByRole("link", { name: "Configure the registry" })).toBeVisible();
  await installation.getByRole("link", { name: "Configure the registry" }).click();
  await expect(page.getByRole("heading", { name: "Configure" })).toBeVisible();
  await expect(page.locator("#configure + p + .docs-code")).toContainText("https://sayhi-bzb.github.io/CharDesk/{name}.json");
  await expect(page.getByText("npx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui")).toBeVisible();
});

test("on-page navigation survives direct load, component changes, and browser history", async ({ page }) => {
  await page.goto("/#/components/button?section=usage");
  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();
  const toc = page.getByRole("navigation", { name: "On This Page" });
  await expect(toc.getByRole("link", { name: "Usage" })).toHaveAttribute("aria-current", "location");
  await expect(page.locator("#usage")).toBeInViewport();
  await toc.getByRole("link", { name: "API" }).click();
  await expect(page).toHaveURL(/#\/components\/button\?section=api$/);
  await expect(page.locator("#api")).toBeInViewport();
  await page.reload();
  await expect(page.locator("#api")).toBeInViewport();
  await page.goBack();
  await expect(toc.getByRole("link", { name: "Usage" })).toHaveAttribute("aria-current", "location");
  await page.getByRole("navigation", { name: "Cell UI" }).getByRole("link", { name: "Tabs", exact: true }).click();
  await expect(page).toHaveURL(/#\/components\/tabs$/);
  await expect(page.getByRole("heading", { name: "Tabs", level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toc.getByRole("link", { name: "Installation" })).toBeVisible();
  await toc.getByRole("link", { name: "Installation" }).click();
  await expect(page.locator("#installation")).toBeInViewport();
});

test("remaining foundational component pages support direct loading", async ({ page }) => {
  for (const slug of ["text", "text-area", "table"]) {
    await page.goto(`/#/components/${slug}`);
    await expect(page.locator(".docs-page__header").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Cell UI" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "API" })).toBeVisible();
  }
  for (const slug of ["box", "grid"]) {
    await page.goto(`/#/components/${slug}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
});

test("guide sections, direct links, and agent Markdown stay addressable", async ({ page, request }) => {
  for (const slug of ["introduction", "philosophy", "classic-macintosh", "markdown", "installation", "integration", "theming", "testing"]) {
    await page.goto(`/#/guides/${slug}`);
    await expect(page.getByRole("navigation", { name: "Cell UI" }).getByRole("link", { name: slug === "classic-macintosh" ? "Classic Macintosh" : slug[0]!.toUpperCase() + slug.slice(1), exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".docs-page__header").getByRole("heading", { level: 1 })).toBeVisible();
    const markdown = await request.get(`/guides/${slug}.md`);
    expect(markdown.ok()).toBe(true);
    expect(await markdown.text()).toContain("# ");
  }
  await page.goto("/#/guides/installation?section=manual");
  await expect(page.locator("#manual")).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "On This Page" }).getByRole("link", { name: "Manual" })).toHaveAttribute("aria-current", "location");
  const index = await request.get("/llms.txt");
  expect(index.ok()).toBe(true);
  expect(await index.text()).not.toContain("/components/box.md");
  expect(await index.text()).not.toContain("/components/grid.md");
  expect(await index.text()).toContain("/components/table.md");
  expect(await index.text()).toContain("/components/alert.md");
  expect(await index.text()).toContain("/guides/philosophy.md");
  expect(await index.text()).toContain("/guides/classic-macintosh.md");
  for (const slug of ["text", "slider", "text-area", "table"]) {
    const response = await request.get(`/components/${slug}.md`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain("## API");
  }
});

test("Philosophy connects three principles to Introduction and the design authority", async ({ page, request }) => {
  await page.goto("/#/guides/introduction");
  await page.getByRole("link", { name: "Read the philosophy" }).click();
  await expect(page).toHaveURL(/#\/guides\/philosophy$/u);
  await expect(page.getByRole("heading", { name: "Philosophy", level: 1 })).toBeVisible();
  await expect(page.locator(".docs-page__header")).toContainText("UI as Text is the goal");
  const toc = page.getByRole("navigation", { name: "On This Page" });
  await expect(toc.getByRole("link")).toHaveText([
    "Everything is Cell", "Input Becomes Command", "State & Projections",
  ]);
  await expect(toc.getByRole("link", { name: "Every Input becomes a Command" }))
    .toHaveAttribute("title", "Every Input becomes a Command");
  await expect(page.getByRole("link", { name: "Cell-native design contract" })).toHaveAttribute(
    "href", "https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/cell-ui/design.mdx",
  );
  await expect(page.getByRole("link", { name: "Explore the visual philosophy" })).toHaveAttribute(
    "href", "#/guides/classic-macintosh",
  );
  await expect(page.locator("#one-state-many-projections").locator("xpath=..")).toContainText(
    "Applications own business values",
  );
  await expect(page.locator("#one-state-many-projections").locator("xpath=..")).toContainText(
    "ordinary Cell Range copy preserves visible Unicode",
  );
  await toc.getByRole("link", { name: "One State, Many Projections" }).click();
  await expect(page.locator("#one-state-many-projections")).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const markdown = await request.get("/guides/philosophy.md");
  expect(markdown.ok()).toBe(true);
  const markdownText = await markdown.text();
  expect(markdownText).toContain("UI as Text is the goal");
  expect(markdownText).toContain("A complete UI-as-text export is a future projection");
  expect(markdownText).toContain("## One State, Many Projections");
  expect(markdownText.match(/^## /gmu)).toHaveLength(3);
});

test("Philosophy TOC stays within its column and reveals the current section", async ({ page }) => {
  for (const width of [1280, 1050, 720, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/#/guides/philosophy");
    const toc = page.getByRole("navigation", { name: "On This Page" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await toc.getByRole("link").evaluateAll((links) => links.every((link) => {
      const parent = link.closest("nav")!.getBoundingClientRect();
      const bounds = link.getBoundingClientRect();
      return bounds.left >= parent.left && bounds.right <= parent.right;
    }))).toBe(true);
    const first = toc.getByRole("link").first();
    await first.evaluate((element) => { element.textContent = "A very long table of contents label that must not widen the page"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(first).toHaveCSS("text-overflow", "ellipsis");
  }

  await page.setViewportSize({ width: 1280, height: 320 });
  await page.goto("/#/guides/philosophy?section=one-state-many-projections");
  await page.reload();
  const toc = page.getByRole("navigation", { name: "On This Page" });
  const links = toc.getByRole("link");
  const active = toc.getByRole("link", { name: "One State, Many Projections" });
  await expect(toc).toHaveCSS("overflow-y", "auto");
  await expect(links).toHaveCount(3);
  expect(await toc.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await expect(active).toHaveAttribute("aria-current", "location");
  expect(await links.evaluateAll((elements) => elements.every((element) => {
    const bounds = element.closest("nav")!.getBoundingClientRect();
    const link = element.getBoundingClientRect();
    return link.top >= bounds.top - 1 && link.bottom <= bounds.bottom + 1;
  }))).toBe(true);
  await links.first().focus();
  await active.focus();
  await expect(active).toBeFocused();
  await expect.poll(() => active.evaluate((element) => {
    const bounds = element.closest("nav")!.getBoundingClientRect();
    const link = element.getBoundingClientRect();
    return link.top >= bounds.top - 1 && link.bottom <= bounds.bottom + 1;
  })).toBe(true);
});

test("Classic Macintosh guide keeps its Cell window stable across input and themes", async ({ page, request }) => {
  await page.goto("/#/guides/philosophy");
  await page.getByRole("link", { name: "Explore the visual philosophy" }).click();
  await expect(page).toHaveURL(/#\/guides\/classic-macintosh$/u);
  await expect(page.getByRole("heading", { name: "Classic Macintosh", level: 1 })).toBeVisible();
  const toc = page.getByRole("navigation", { name: "On This Page" });
  await expect(toc.getByRole("link")).toHaveText([
    "Direct manipulation", "Immediate feedback", "Perceptual stability", "Forgiving and in control",
    "Few modes", "Black-and-white first", "Consistent grammar", "Cell-native, modern host",
  ]);
  await expect(page.getByRole("link", { name: "Macintosh design standard" })).toHaveAttribute(
    "href", "https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/cell-ui/macintosh.mdx",
  );
  const surface = page.getByLabel("Classic Macintosh example");
  const sound = surface.getByRole("checkbox", { name: "Sound" });
  await expect(sound).toHaveAttribute("aria-checked", "true");
  const before = ownerBounds(await readCellProbe(surface), "mac-window");
  await sound.focus();
  await page.keyboard.press("Space");
  await expect(sound).toHaveAttribute("aria-checked", "false");
  await surface.locator("canvas").first().scrollIntoViewIfNeeded();
  const apply = ownerBounds(await readCellProbe(surface), "mac-apply");
  const point = await cellPoint(surface, apply.x + (apply.width - 1) / 2, apply.y + (apply.height - 1) / 2);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Status: Saved");
  await surface.getByRole("button", { name: "Reset settings" }).focus();
  await page.keyboard.press("Enter");
  await expect(sound).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Status: Ready");
  expect(ownerBounds(await readCellProbe(surface), "mac-window")).toEqual(before);
  const light = JSON.stringify(await readCellPixel(surface, 0, 0));
  await page.locator(".gallery-header").getByRole("button", { name: "Dark" }).click();
  await expect.poll(async () => JSON.stringify(await readCellPixel(surface, 0, 0))).not.toBe(light);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const markdown = await request.get("/guides/classic-macintosh.md");
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).toContain("## Black-and-white first");
});

test("Introduction shows interactive Cell examples and matching agent content", async ({ page, request }) => {
  await page.goto("/#/guides/introduction");
  const toc = page.getByRole("navigation", { name: "On This Page" });
  await expect(toc.getByRole("link")).toHaveText([
    "Why Cells?", "Compose a settings panel", "Show progress in text", "Edit Unicode in place", "Make it yours",
  ]);
  await expect(page.locator("#philosophy").locator("xpath=..")).toContainText(
    "Option (⌥) + Command (⌘) and drag on macOS, or Alt and drag on Windows/Linux",
  );

  const settings = page.getByLabel("Settings example");
  const theme = settings.getByRole("button", { name: "Theme" });
  await theme.evaluate((element: HTMLElement) => element.click());
  await settings.getByRole("option", { name: "Light" }).evaluate((element: HTMLElement) => element.click());
  await expect(settings.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(settings)).text).toContain("Light");
  const sound = settings.getByRole("checkbox", { name: "Sound" });
  await expect(sound).toHaveAttribute("aria-checked", "true");
  await sound.focus();
  await page.keyboard.press("Space");
  await expect(sound).toHaveAttribute("aria-checked", "false");

  const progress = page.getByLabel("Progress example");
  await expect.poll(async () => (await readCellProbe(progress)).text).toContain("Uploading files");
  await progress.locator("canvas").first().scrollIntoViewIfNeeded();
  const startBounds = ownerBounds(await readCellProbe(progress), "intro-progress-start");
  const startPoint = await cellPoint(progress,
    startBounds.x + (startBounds.width - 1) / 2,
    startBounds.y + (startBounds.height - 1) / 2);
  await page.mouse.click(startPoint.x, startPoint.y);
  await expect.poll(async () => (await readCellProbe(progress)).text).toContain("Restart");
  await expect.poll(async () => (await readCellProbe(progress)).text, { timeout: 10000 }).toContain("Upload complete");

  const notes = page.getByLabel("Unicode notes example");
  const editor = notes.getByRole("textbox", { name: "Notes" });
  await editor.fill("世界 👋 and Cells");
  await expect.poll(async () => (await readCellProbe(notes)).text).toContain("世界 👋 and Cells");

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const markdown = await request.get("/guides/introduction.md");
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).toContain("## Compose a settings panel");
  expect(await markdown.text()).toContain("useCellTextState");
  expect(await markdown.text()).toContain("Option (⌥) + Command (⌘) and drag on macOS, or Alt and drag on Windows/Linux");
  expect(await markdown.text()).toContain("[Installation](https://ui.chardesk.com/#/guides/installation)");
});

test("guide prose and code use the same content width", async ({ page }) => {
  await page.goto("/#/guides/integration");
  const section = page.locator("#surface").locator("xpath=..");
  const prose = section.locator(":scope > p");
  const code = section.locator(":scope > .docs-code");
  await expect(prose).toContainText("CellSurface retains the runtime");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const proseBounds = await prose.boundingBox();
    const codeBounds = await code.boundingBox();
    expect(proseBounds).not.toBeNull();
    expect(codeBounds).not.toBeNull();
    expect(proseBounds!.x).toBeCloseTo(codeBounds!.x, 4);
    expect(proseBounds!.width).toBeCloseTo(codeBounds!.width, 4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(code.locator("pre")).toHaveCSS("overflow-x", "auto");
  }
});

test("unknown component routes fail honestly", async ({ page }) => {
  for (const slug of ["missing", "list", "menu", "tree", "overlay", "range-slider"]) {
    await page.goto(`/#/components/${slug}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Introduction" })).toHaveAttribute("href", "#/guides/introduction");
  }
});

test("Gallery DOM contours and dividers stay 2px without narrow overflow", async ({ page }) => {
  await page.goto("/#/components/button");
  const codeBlocks = page.locator(".docs-code");
  for (const codeBlock of await codeBlocks.all()) {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      await expect(codeBlock).toHaveCSS(`border-${side}-width`, "2px");
    }
  }
  await expect(page.locator(".docs-table-wrap td").first()).toHaveCSS("border-bottom-width", "2px");

  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320);
});

test("Text and Box expose Cell-native content and local variants", async ({ page }) => {
  await page.goto("/#/__fixtures/text");
  const text = await readCellProbe(page.locator('[data-cell-probe="component-text"]'));
  for (const line of [
    "◆ Plain text · READY",
    "→ Unicode: 世界 👋",
    "↔ Move: ← ↑ ↓ →",
    "✓ Status: PASS · IDLE",
    "∞ Math: ≠ ≤ ≥ ± × ÷",
    "▓ Signal: ░▒▓█",
    "⣿ Cell: \ue0b0 \uee03 \uf5ee",
    "Legacy: \u{1fb95} \u{1fbb0} \u{1fbc5}",
    "↳ Wraps on integer Cell",
  ]) expect(text.text).toContain(line);
  const frameCells = text.cells.filter((cell) => cell.ownerId === "component-text-frame");
  expect(new Set(frameCells.map((cell) => cell.x)).size).toBe(36);
  expect(new Set(frameCells.map((cell) => cell.y)).size).toBe(14);
  const wrappedRows = new Set(text.cells
    .filter((cell) => cell.ownerId === "component-text-wrap" && cell.text !== " ")
    .map((cell) => cell.y));
  expect(wrappedRows.size).toBeGreaterThan(1);

  await page.goto("/#/__fixtures/box");
  const boxSurface = page.getByLabel("Box component");
  const initialBox = await readCellProbe(boxSurface);
  expect(initialBox.text).toContain("Block");
  expect(initialBox.text).toContain("variant");
  expect(initialBox.cells.some((cell) => cell.ownerId?.includes("divider"))).toBe(true);
});

test("Separator keeps orientation interactive", async ({ page }) => {
  await page.goto("/#/components/separator");
  const surface = page.getByLabel("Separator component");
  const direction = page.getByRole("button", { name: "direction", exact: true });
  const separator = page.getByRole("separator");
  const initial = await readCellProbe(surface);
  const separatorCells = async () => (await readCellProbe(surface)).cells
    .filter((cell) => cell.ownerId === "component-separator-line");
  expect((await separatorCells()).map((cell) => cell.text).join("")).toBe("─".repeat(20));
  await expect(separator).toHaveAttribute("aria-orientation", "horizontal");
  await expect(page.getByRole("button", { name: "variant", exact: true })).toBeAttached();
  await direction.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "vertical", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(separator).toHaveAttribute("aria-orientation", "vertical");
  await expect.poll(async () => (await separatorCells()).map((cell) => cell.text).join(""))
    .toBe("│".repeat(5));
  expect((await readCellProbe(surface)).viewport).toEqual(initial.viewport);
});

test("Input edits Unicode through the real textbox and Cell frame", async ({ page }) => {
  await page.goto("/#/components/input");
  const surface = page.getByLabel("Input component");
  const input = surface.getByRole("textbox", { name: "File name" });
  const disabled = page.getByRole("checkbox", { name: "disabled" });

  await expect(page.getByRole("heading", { name: "Input", level: 1 })).toBeVisible();
  await expect(input).toHaveValue("notes.txt");
  const initial = await readCellProbe(surface);
  expect(initial.viewport.height).toBe(7);
  expect(initial.text).toContain("File name");
  expect(initial.text).toContain("> notes.txt");
  expect(initial.text).toMatch(/\[ \] disabled/);
  const idleCells = initial.cells.filter((cell) => cell.ownerId === "component-input-field");
  expect(idleCells).toHaveLength(30);
  expect(idleCells[0]?.text).toBe(">");
  expect(idleCells[1]?.text).toBe(" ");
  expect(new Set(idleCells.map((cell) => cell.y)).size).toBe(1);
  expect(idleCells.some((cell) => /^[┌┐└┘╭╮╰╯─│]$/u.test(cell.text))).toBe(false);
  const idleBackground = idleCells[0]!.style.backgroundColor;
  expect(idleCells.every((cell) => cell.style.backgroundColor === idleBackground)).toBe(true);

  await input.click();
  await input.press("ControlOrMeta+A");
  await expect.poll(async () => (await readCellProbe(surface)).cells.find((cell) =>
    cell.ownerId === "component-input-field" && cell.text === "n"
  )?.style.backgroundColor).not.toBe(idleBackground);
  await input.fill("世界 👋");
  await expect(input).toHaveValue("世界 👋");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("> 世界 👋");
  const active = await readCellProbe(surface);
  const activeCells = active.cells.filter((cell) => cell.ownerId === "component-input-field");
  expect(activeCells).toHaveLength(30);
  expect(activeCells.every((cell) => (
    cell.style.backgroundColor !== undefined
    && cell.style.backgroundColor !== idleBackground
  ))).toBe(true);

  await input.press("End");
  await input.press("x");
  await expect(input).toHaveValue("世界 👋x");
  await input.press("Control+z");
  await expect(input).toHaveValue("世界 👋");
  const restored = await readCellProbe(surface);

  const surfaceBounds = await surface.boundingBox();
  const metrics = restored.presentation!.metrics;
  await page.mouse.click(
    surfaceBounds!.x + 2.5 * metrics.cellWidth,
    surfaceBounds!.y + 2.5 * metrics.cellHeight,
  );
  await expect(surface).toHaveAttribute("data-cell-focused", "component-input-field");
  await expect(surface).not.toHaveAttribute("data-cell-active-focus");
  await expect.poll(async () => (await readCellProbe(surface)).activeFocusId).toBeNull();
  const dormantCells = (await readCellProbe(surface)).cells
    .filter((cell) => cell.ownerId === "component-input-field");
  expect(dormantCells).toHaveLength(30);
  expect(dormantCells.every((cell) => cell.style.backgroundColor === idleBackground)).toBe(true);

  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(input).toHaveJSProperty("disabled", true);
  await expect(disabled).toHaveAttribute("aria-checked", "true");
});

test("Button Playground drives its semantic API through Cell controls", async ({ page }) => {
  await page.goto("/#/components/button");
  const surface = page.getByLabel("Button component");
  const save = page.getByRole("button", { name: "Save document" });
  const disabled = page.getByRole("checkbox", { name: "disabled" });

  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();
  await expect(save).not.toHaveAttribute("aria-disabled");
  await expect(page.getByRole("button", { name: "variant" })).toBeAttached();
  await expect(page.getByRole("button", { name: "padding L/R" })).toHaveCount(0);
  await expect(disabled).toHaveAttribute("aria-checked", "false");

  const initial = await readCellProbe(surface);
  expect(initial.viewport.height).toBe(9);
  const baseCanvas = surface.locator("canvas:not([data-cell-overlay-root])");
  const initialSurfaceBounds = await surface.boundingBox();
  const initialHostBounds = await page.locator(".component-playground").boundingBox();
  expect(initial.text).toContain("variant");
  expect(initial.text).toContain("Save");
  expect(initial.text).toContain("[ ] disabled");
  expect(initial.cells.some((cell) => (
    cell.ownerId === "component-button-playground-controls-scroll" && "█▀▄".includes(cell.text)
  ))).toBe(false);

  const indicatorCell = initial.cells.find((cell) => cell.ownerId === "component-button-disabled");
  const disabledCells = initial.cells.filter((cell) => (
    cell.ownerId?.startsWith("component-button-disabled")
  ));
  expect(disabledCells.filter((cell) => cell.style.backgroundColor !== undefined)).toHaveLength(0);
  const initialCanvasBounds = await surface.locator("canvas").boundingBox();
  expect(indicatorCell).toBeDefined();
  expect(initialCanvasBounds).not.toBeNull();
  await page.mouse.move(
    initialCanvasBounds!.x + (indicatorCell!.x + 0.5) * initialCanvasBounds!.width / initial.viewport.width,
    initialCanvasBounds!.y + (indicatorCell!.y + 0.5) * initialCanvasBounds!.height / initial.viewport.height,
  );
  await expect(surface).toHaveAttribute("data-cell-hovered", "component-button-disabled");

  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-cell-press-active", "component-button-disabled");
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-cell-press-active");
  await expect(disabled).toHaveAttribute("aria-checked", "true");
  expect((await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId?.startsWith("component-button-disabled") && cell.style.bold
  ))).toHaveLength(0);

  await page.mouse.move(
    initialCanvasBounds!.x + 0.5 * initialCanvasBounds!.width / initial.viewport.width,
    initialCanvasBounds!.y + 0.5 * initialCanvasBounds!.height / initial.viewport.height,
  );
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await expect.poll(async () => (await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId?.startsWith("component-button-disabled")
      && cell.style.backgroundColor !== undefined
  )).length).toBe(0);
  await expect(surface).toHaveAttribute("data-cell-focused", "component-button-disabled");
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");

  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(disabled).toHaveAttribute("aria-checked", "false");

  expect((await surface.boundingBox())?.height).toBe(initialSurfaceBounds?.height);
  expect((await page.locator(".component-playground").boundingBox())?.height).toBe(initialHostBounds?.height);

  const configured = await readCellProbe(surface);
  const saveCell = configured.cells.find((cell) => cell.ownerId === "component-button-save");
  const canvasBounds = await baseCanvas.boundingBox();
  expect(saveCell).toBeDefined();
  expect(canvasBounds).not.toBeNull();
  const savePoint = {
    x: canvasBounds!.x + (saveCell!.x + 0.5) * canvasBounds!.width / configured.viewport.width,
    y: canvasBounds!.y + (saveCell!.y + 0.5) * canvasBounds!.height / configured.viewport.height,
  };
  await page.mouse.move(savePoint.x, savePoint.y);
  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-cell-press-active", "component-button-save");
  expect((await readCellProbe(surface)).text).toContain(" Save ");
  expect((await readCellProbe(surface)).cells.some((cell) => (
    cell.ownerId === "component-button-save" && cell.style.backgroundColor !== undefined
  ))).toBe(true);
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-cell-press-active");
  expect((await readCellProbe(surface)).text).toContain(" Save ");
  expect((await readCellProbe(surface)).text).not.toContain("Saved");

  await page.reload();
  const reloadedSurface = page.getByLabel("Button component");
  await reloadedSurface.focus();
  await expect(page.getByRole("button", { name: "Save document" })).toBeFocused();
  await page.keyboard.down("Enter");
  await expect(reloadedSurface).toHaveAttribute("data-cell-press-active", "component-button-save");
  await page.keyboard.up("Enter");
  await expect(reloadedSurface).not.toHaveAttribute("data-cell-press-active");
  expect((await readCellProbe(reloadedSurface)).text).toContain("Save");
  expect((await readCellProbe(reloadedSurface)).text).not.toContain("Saved");

  await page.reload();
  const disabledSurface = page.getByLabel("Button component");
  await page.getByRole("checkbox", { name: "disabled" }).evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("button", { name: "Save document" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "Save document" }).evaluate((element: HTMLElement) => element.click());
  expect((await readCellProbe(disabledSurface)).text).toContain("Save");
  await expect(disabledSurface).not.toHaveAttribute("data-cell-press-active");
});

test("Select opens a Cell listbox and commits only explicit activation", async ({ page }) => {
  await page.goto("/#/components/select");
  const surface = page.getByLabel("Select component");
  const trigger = surface.getByRole("button", { name: "Theme" });
  const disabled = page.getByRole("checkbox", { name: "disabled" });
  const initialSurfaceBounds = await surface.boundingBox();
  const initialHostBounds = await page.locator(".component-playground").boundingBox();

  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "variant", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "dropdown frame", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "border shape", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "value" })).toHaveCount(0);
  const defaultProbe = await readCellProbe(surface);
  const elevatedBackground = defaultProbe.cells.find((cell) => cell.ownerId === "component-select-trigger" && cell.text === " ")?.style.backgroundColor;
  expect(elevatedBackground).toBeTruthy();
  await surface.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.down("Enter");
  await expect(surface).toHaveAttribute("data-cell-press-active", "component-select-trigger");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.up("Enter");
  await expect(surface).not.toHaveAttribute("data-cell-press-active");
  await expect(surface.getByRole("listbox", { name: "Theme options" })).toBeAttached();
  await expect(surface.getByRole("option")).toHaveCount(3);
  await expect(surface.getByRole("option", { name: "Dark" })).toHaveAttribute("aria-selected", "true");
  await expect(surface.getByRole("option", { name: "Dark" })).toBeFocused();
  const borderless = await readCellProbe(surface);
  const borderlessOverlay = borderless.overlays.find(
    (overlay) => overlay.rootId === "component-select-content",
  );
  expect(borderlessOverlay?.bounds.height).toBe(3);
  expect(borderlessOverlay?.text).toContain("Light");
  expect(borderlessOverlay?.text).toContain("Dark");
  expect(borderlessOverlay?.text).toContain("System");
  expect(borderlessOverlay?.text).not.toMatch(/[┌┐└┘│─]/u);
  expect(borderlessOverlay?.cells.find((cell) => cell.text === " " && cell.ownerId === "component-select-light")?.style.backgroundColor)
    .toBe(elevatedBackground);
  expect(borderless.overlayViewport.height).toBe(borderless.viewport.height + 3);
  expect((await surface.boundingBox())?.height).toBe(initialSurfaceBounds?.height);
  expect((await page.locator(".component-playground").boundingBox())?.height)
    .toBe(initialHostBounds?.height);

  await page.keyboard.press("ArrowDown");
  await expect(surface.getByRole("option", { name: "System" })).toBeFocused();
  await expect(surface.getByRole("option", { name: "Dark" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(surface.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect((await readCellProbe(surface)).text).toContain("Dark");

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(surface.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("System");

  await trigger.evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "Light" })
    .evaluate((element: HTMLElement) => element.click());
  await expect(surface.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Light");

  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(trigger).toHaveAttribute("aria-disabled", "true");
  await trigger.evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
});

test("Checkbox Playground keeps direct checked interaction and its disabled prop", async ({ page }) => {
  await page.goto("/#/components/checkbox");
  const surface = page.getByLabel("Checkbox component");
  const autosave = page.getByRole("checkbox", { name: "Autosave" });
  const disabled = page.getByRole("checkbox", { name: "disabled" });

  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "checked" })).toHaveCount(0);
  await expect(autosave).toHaveAttribute("aria-checked", "true");
  await expect(disabled).toHaveAttribute("aria-checked", "false");
  expect((await readCellProbe(surface)).text).toContain("[x] Autosave");
  expect((await readCellProbe(surface)).text).not.toMatch(/\bchecked\b/u);

  await surface.focus();
  await expect(autosave).toBeFocused();
  await page.keyboard.down("Space");
  await expect(surface).toHaveAttribute("data-cell-press-active", "component-checkbox-autosave");
  await expect(autosave).toHaveAttribute("aria-checked", "false");
  await page.keyboard.up("Space");
  await expect(surface).not.toHaveAttribute("data-cell-press-active");

  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(disabled).toHaveAttribute("aria-checked", "true");
  await expect(autosave).toHaveAttribute("aria-disabled", "true");
  await autosave.evaluate((element: HTMLElement) => element.click());
  await expect(autosave).toHaveAttribute("aria-checked", "false");
});

test("Slider Playground keeps direct value interaction and its disabled prop", async ({ page }) => {
  await page.goto("/#/components/slider");
  const surface = page.getByLabel("Slider component");
  const volume = page.getByRole("slider", { name: "Volume" });
  const range = page.getByRole("checkbox", { name: "range" });
  const disabled = page.getByRole("checkbox", { name: "disabled" });

  await expect(page.getByRole("slider")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "step" })).toHaveCount(0);
  await expect(volume).toHaveAttribute("aria-valuemin", "0");
  await expect(volume).toHaveAttribute("aria-valuemax", "100");
  await expect(volume).toHaveAttribute("aria-valuenow", "50");
  await expect(volume).toHaveAttribute("aria-valuetext", "50 percent");
  await expect(volume).toHaveAttribute("aria-orientation", "horizontal");
  await expect(range).toHaveAttribute("aria-checked", "false");
  await expect(disabled).toHaveAttribute("aria-checked", "false");

  const initial = await readCellProbe(surface);
  expect(initial.text).toContain("Volume");
  expect(initial.text).not.toMatch(/\b(?:value|step)\b/u);
  expect(initial.text).toMatch(/\[ \] range/);
  expect(initial.text).toMatch(/\[ \] disabled/);
  const volumeThumb = initial.cells.find((cell) => (
    cell.ownerId === "component-slider-volume" && cell.text === "┃"
  ));
  const volumeTrack = initial.cells.find((cell) => (
    cell.ownerId === "component-slider-volume" && "━─".includes(cell.text)
  ));
  const canvasBounds = await surface.locator("canvas").boundingBox();
  expect(volumeThumb).toBeDefined();
  expect(volumeTrack).toBeDefined();
  expect(canvasBounds).not.toBeNull();
  await page.mouse.move(
    canvasBounds!.x + (volumeTrack!.x + 0.5) * canvasBounds!.width / initial.viewport.width,
    canvasBounds!.y + (volumeTrack!.y + 0.5) * canvasBounds!.height / initial.viewport.height,
  );
  await expect.poll(async () => (await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId === "component-slider-volume" && cell.text === "█"
  )).length).toBe(1);
  const hovered = await readCellProbe(surface);
  expect(hovered.cells.find((cell) => cell.text === "█" && cell.ownerId === "component-slider-volume"))
    .toMatchObject({ x: volumeThumb!.x, y: volumeThumb!.y });
  expect(hovered.cells.filter((cell) => (
    cell.ownerId === "component-slider-volume" && cell.style.backgroundColor !== undefined
  ))).toHaveLength(0);
  const thumbX = canvasBounds!.x
    + (volumeThumb!.x + 0.5) * canvasBounds!.width / initial.viewport.width;
  const thumbY = canvasBounds!.y
    + (volumeThumb!.y + 0.5) * canvasBounds!.height / initial.viewport.height;
  const twoCells = 2 * canvasBounds!.width / initial.viewport.width;
  await page.mouse.move(thumbX, thumbY);
  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-cell-manipulating", "true");
  await expect.poll(async () => (await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId === "component-slider-volume" && cell.text === "█"
  )).length).toBe(1);
  await page.mouse.move(thumbX + twoCells, thumbY);
  await expect.poll(async () => (await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId === "component-slider-volume" && cell.text === "█"
  )).length).toBe(1);
  await page.mouse.move(thumbX, thumbY);
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-cell-manipulating");
  await expect(volume).toHaveAttribute("aria-valuenow", "52");
  await expect.poll(async () => (await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId === "component-slider-volume" && cell.text === "█"
  )).length).toBe(1);
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await readCellProbe(surface)).cells.some((cell) => (
    cell.ownerId === "component-slider-volume" && cell.text === "┃"
  ))).toBe(true);

  await volume.focus();
  await page.keyboard.press("ArrowRight");
  await expect(volume).toHaveAttribute("aria-valuenow", "53");
  const keyboardFrame = await readCellProbe(surface);
  expect(keyboardFrame.cells.filter((cell) => cell.ownerId === "component-slider-volume" && cell.text === "█")).toHaveLength(1);
  expect(keyboardFrame.cells.filter((cell) => cell.ownerId === "component-slider-volume"
    && (cell.style.backgroundColor !== undefined || cell.style.bold))).toHaveLength(0);
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");

  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(disabled).toHaveAttribute("aria-checked", "true");
  await expect(volume).toHaveAttribute("aria-disabled", "true");
  await volume.focus();
  await page.keyboard.press("ArrowRight");
  await expect(volume).toHaveAttribute("aria-valuenow", "53");

  await disabled.evaluate((element: HTMLElement) => element.click());
  await range.evaluate((element: HTMLElement) => element.click());
  await expect(range).toHaveAttribute("aria-checked", "true");
  const group = page.getByRole("group", { name: "Volume" });
  const start = page.getByRole("slider", { name: "Minimum volume" });
  const end = page.getByRole("slider", { name: "Maximum volume" });
  await expect(group).toBeAttached();
  await expect(page.getByRole("slider")).toHaveCount(2);
  await expect(start).toHaveAttribute("aria-valuenow", "30");
  await expect(start).toHaveAttribute("aria-valuemax", "70");
  await expect(end).toHaveAttribute("aria-valuemin", "30");
  await expect(end).toHaveAttribute("aria-valuenow", "70");
  const interval = await readCellProbe(surface);
  expect(interval.text).toContain("30–70");
  expect(interval.text).toMatch(/\[x\] range/);
  expect(interval.cells.some((cell) => (
    cell.ownerId === "component-slider-start" && cell.text === "┃"
  ))).toBe(true);
  expect(interval.cells.some((cell) => (
    cell.ownerId === "component-slider-end" && cell.text === "┃"
  ))).toBe(true);
  expect(interval.cells.some((cell) => (
    cell.ownerId === "component-slider-range-control" && cell.text === "━"
  ))).toBe(true);

  await start.focus();
  await page.keyboard.press("ArrowRight");
  await expect(start).toHaveAttribute("aria-valuenow", "31");
  await expect(end).toHaveAttribute("aria-valuemin", "31");
  await page.keyboard.press("Tab");
  await expect(end).toBeFocused();

  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(start).toHaveAttribute("aria-disabled", "true");
  await expect(end).toHaveAttribute("aria-disabled", "true");
  await start.focus();
  await page.keyboard.press("ArrowRight");
  await expect(start).toHaveAttribute("aria-valuenow", "31");
});

test("Cell Range clears when Preview focus moves outside its Surface", async ({ page }) => {
  await page.goto("/#/__fixtures/text");
  const surface = page.getByLabel("Text component");
  const canvas = surface.locator("canvas");
  const probe = await readCellProbe(surface);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const selectRange = async () => {
    await page.keyboard.down("Alt");
    await page.keyboard.down("Meta");
    await page.mouse.move(bounds!.x + bounds!.width / probe.viewport.width / 2, bounds!.y + bounds!.height / probe.viewport.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Meta");
    await page.keyboard.up("Alt");
    await expect(surface).toHaveAttribute("data-cell-range");
  };

  await selectRange();
  await page.getByRole("heading", { name: "Cell UI Fixture", level: 1 }).click();
  await expect(surface).not.toHaveAttribute("data-cell-range");

  await selectRange();
  await page.getByRole("button", { name: /^(Dark|Light)$/ }).click();
  await expect(surface).not.toHaveAttribute("data-cell-range");
});

test("ScrollArea responds to keyboard, wheel, and thumb drag without scrolling the page", async ({ page }) => {
  await page.goto("/#/components/scroll-area");
  const surface = page.getByLabel("ScrollArea component");
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  await surface.focus();
  const visibleRows = (text: string) => [...text.matchAll(/\d{2} {2}Row \d+/gu)]
    .map(([label]) => label);
  const thumbGlyphs = (probe: Awaited<ReturnType<typeof readCellProbe>>) => probe.cells
    .filter((cell) => cell.ownerId === "component-scroll-area" && "█▀▄".includes(cell.text))
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((cell) => cell.text);
  const sizingInitial = await readCellProbe(surface);
  expect(visibleRows(sizingInitial.text)).toEqual([
    "01  Row 1",
    "02  Row 2",
    "03  Row 3",
    "04  Row 4",
  ]);
  expect(thumbGlyphs(sizingInitial)).toEqual(["█", "▀"]);

  expect(sizingInitial.cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "┌┐└┘╭╮╰╯─│".includes(cell.text)
  ))).toBe(false);

  const initial = sizingInitial;

  await page.keyboard.press("PageDown");
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(initial.text);
  const paged = await readCellProbe(surface);
  const pageY = await page.evaluate(() => window.scrollY);
  const wheelTarget = paged.cells.find((cell) => (
    cell.ownerId === "component-scroll-area" && "█▀▄".includes(cell.text)
  ));
  const wheelBounds = await canvas.boundingBox();
  expect(wheelTarget).toBeDefined();
  expect(wheelBounds).not.toBeNull();
  await canvas.hover({
    position: {
      x: (wheelTarget!.x + 0.5) * wheelBounds!.width / paged.viewport.width,
      y: (wheelTarget!.y + 0.5) * wheelBounds!.height / paged.viewport.height,
    },
  });
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(paged.text);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);

  const beforeDrag = await readCellProbe(surface);
  const thumb = beforeDrag.cells.find((cell) => "█▀▄".includes(cell.text)
    && cell.ownerId === "component-scroll-area");
  expect(thumb).toBeDefined();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const cellWidth = bounds!.width / beforeDrag.viewport.width;
  const cellHeight = bounds!.height / beforeDrag.viewport.height;
  await page.mouse.move(bounds!.x + (thumb!.x + 0.5) * cellWidth, bounds!.y + (thumb!.y + 0.5) * cellHeight);
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + (thumb!.x + 0.5) * cellWidth,
    bounds!.y + Math.min(beforeDrag.viewport.height - 1.5, thumb!.y + 2.5) * cellHeight,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(beforeDrag.text);

  await expect(page.getByRole("button", { name: "frame", exact: true })).toBeAttached();
});

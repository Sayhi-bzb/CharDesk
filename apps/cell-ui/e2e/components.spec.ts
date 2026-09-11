import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";
import { galleryFontSelect } from "./helpers/gallery-font-select";

const navigationGroups = [
  {
    name: "Components",
    links: [
      ["Button", "#/components/button"],
      ["Select", "#/components/select"],
      ["Combobox", "#/components/combobox"],
      ["Slider", "#/components/slider"],
      ["Checkbox", "#/components/checkbox"],
      ["Input", "#/components/input"],
      ["ScrollArea", "#/components/scroll-area"],
      ["Toggle", "#/components/toggle"],
      ["Progress", "#/components/progress"],
      ["Radio", "#/components/radio"],
      ["Accordion", "#/components/accordion"],
      ["Dialog", "#/components/dialog"],
    ],
  },
  {
    name: "Primitives",
    links: [
      ["Text", "#/components/text"],
      ["Box", "#/components/box"],
      ["Separator", "#/components/separator"],
    ],
  },
  {
    name: "Collections",
    links: [["List", "#/components/list"]],
  },
] as const;

test("component catalog drives concise, addressable documentation", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Cell UI" });
  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();
  await expect(page.locator(".gallery-brand")).toHaveAttribute("href", "#/components/button");
  await expect(nav.getByRole("link")).toHaveCount(16);
  for (const groupDefinition of navigationGroups) {
    const group = nav.getByRole("group", { name: groupDefinition.name });
    await expect(group).toBeVisible();
    await expect(group.getByRole("link")).toHaveText(groupDefinition.links.map(([name]) => name));
    for (const [name, href] of groupDefinition.links) {
      await expect(group.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
  }
  await expect(nav.getByRole("link", { name: "Button", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Distribution" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "API" })).toBeVisible();
  await expect(page.getByText("private workspace package", { exact: false })).toBeVisible();
  await expect(page.getByText("not published to npm", { exact: false })).toBeVisible();
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

  await nav.getByRole("link", { name: "Box", exact: true }).click();
  await expect(page).toHaveURL(/#\/components\/box$/);
  await expect(page.getByRole("heading", { name: "Box", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Box", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-cell-probe="component-box"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "variant", exact: true })).toBeAttached();
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
    height: 7,
  });
  const wideDivider = widePlayground.cells.find(
    (cell) => cell.ownerId === "component-button-playground-divider-0",
  );
  expect(wideDivider?.x).toBe(Math.floor((widePlayground.viewport.width - 1) / 2));
  expect(widePlayground.text).not.toContain("Props");
  expect(widePlayground.text).toContain("variant");
  expect(widePlayground.text).toContain("default");

  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(async () => (await readCellProbe(
    page.locator('[data-cell-probe="component-button"]'),
  )).viewport).toEqual({ width: 32, height: 15 });
  const narrowPlayground = await readCellProbe(page.locator('[data-cell-probe="component-button"]'));
  const narrowLines = narrowPlayground.text.split("\n");
  expect(narrowLines[9]).toContain("   variant");
  expect(narrowLines[10]).toContain("   default");
  expect(narrowLines[11]).toContain("   size");
  expect(narrowLines[12]).toContain("   default");
  expect(narrowLines[13]).toContain("   [ ] disabled");
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

test("unknown component routes fail honestly", async ({ page }) => {
  await page.goto("/#/components/missing");
  await expect(page.getByRole("heading", { name: "Component not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Button" })).toHaveAttribute("href", "#/components/button");
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

test("Text and Box expose Cell-native content and layout", async ({ page }) => {
  await page.goto("/#/components/text");
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
  expect(text.viewport).toEqual({ width: 36, height: 14 });
  const wrappedRows = new Set(text.cells
    .filter((cell) => cell.ownerId === "component-text-wrap" && cell.text !== " ")
    .map((cell) => cell.y));
  expect(wrappedRows.size).toBeGreaterThan(1);

  await page.goto("/#/components/box");
  const boxSurface = page.getByLabel("Box component");
  const boxVariant = page.getByRole("button", { name: "variant", exact: true });
  const boxPreview = async () => (await readCellProbe(boxSurface)).cells
    .filter((cell) => cell.ownerId === "component-box-preview");
  const initialBox = await readCellProbe(boxSurface);
  expect(initialBox.text).toContain("Block");
  expect(initialBox.text).toContain("variant");
  expect(initialBox.text).toContain("plain");
  expect((await boxPreview()).every((cell) => cell.style.backgroundColor === undefined)).toBe(true);
  await boxVariant.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "raised", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "variant options" })).toHaveCount(0);
  await expect.poll(async () => (await boxPreview()).some((cell) => (
    cell.style.backgroundColor === "rgb(230, 230, 230)"
  ))).toBe(true);
  await boxVariant.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "bordered", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "variant options" })).toHaveCount(0);
  const borderShape = page.getByRole("button", { name: "border shape", exact: true });
  await expect(borderShape).toBeAttached();
  expect((await readCellProbe(boxSurface)).text).toContain("┌──────────────────┐");
  await borderShape.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "rounded", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "border shape options" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(boxSurface)).text).toContain("╭──────────────────╮");
  await boxVariant.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "plain", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "variant options" })).toHaveCount(0);
  await expect(borderShape).toHaveCount(0);
});

test("Separator Playground switches themed variants without changing its geometry", async ({ page }) => {
  await page.goto("/#/components/separator");
  const surface = page.getByLabel("Separator component");
  const variant = page.getByRole("button", { name: "variant", exact: true });
  const direction = page.getByRole("button", { name: "direction", exact: true });
  const separator = page.getByRole("separator");
  const initial = await readCellProbe(surface);
  const separatorCells = async () => (await readCellProbe(surface)).cells
    .filter((cell) => cell.ownerId === "component-separator-line");
  expect((await separatorCells()).map((cell) => cell.text).join("")).toBe("─".repeat(20));
  expect(initial.text).toContain("───────");
  await expect(separator).toHaveAttribute("aria-orientation", "horizontal");

  await variant.evaluate((element: HTMLElement) => element.click());
  for (const [name, sample] of [["line", "───────"], ["slash", "///////"], ["double", "═══════"], ["dots", "·······"]] as const) {
    await expect(page.getByRole("option", { name, exact: true })).toBeAttached();
    expect((await readCellProbe(surface)).overlays.find((overlay) => (
      overlay.rootId === "component-separator-variant-content"
    ))?.text).toContain(sample);
  }
  await page.getByRole("option", { name: "line", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "variant options" })).toHaveCount(0);

  const choose = async (trigger: typeof variant, option: string) => {
    await trigger.evaluate((element: HTMLElement) => element.click());
    await page.getByRole("option", { name: option, exact: true })
      .evaluate((element: HTMLElement) => element.click());
    await expect(page.getByRole("option", { name: option, exact: true })).toHaveCount(0);
  };
  for (const [name, glyph] of [["slash", "/"], ["double", "═"], ["dots", "·"], ["line", "─"]] as const) {
    await choose(variant, name);
    await expect.poll(async () => (await separatorCells()).map((cell) => cell.text).join(""))
      .toBe(glyph.repeat(20));
    expect((await readCellProbe(surface)).viewport).toEqual(initial.viewport);
  }

  await choose(variant, "slash");
  await choose(direction, "vertical");
  await expect(separator).toHaveAttribute("aria-orientation", "vertical");
  await expect.poll(async () => (await separatorCells()).map((cell) => cell.text).join(""))
    .toBe("/".repeat(5));
  await choose(variant, "double");
  await expect.poll(async () => (await separatorCells()).map((cell) => cell.text).join(""))
    .toBe("║".repeat(5));
  expect((await readCellProbe(surface)).viewport).toEqual(initial.viewport);
});

test("Input edits Unicode through the real textbox and Cell frame", async ({ page }) => {
  await page.goto("/#/components/input");
  const surface = page.getByLabel("Input component");
  const input = page.getByRole("textbox", { name: "File name" });
  const disabled = page.getByRole("checkbox", { name: "disabled" });

  await expect(page.getByRole("heading", { name: "Input", level: 1 })).toBeVisible();
  await expect(input).toHaveValue("notes.txt");
  const initial = await readCellProbe(surface);
  expect(initial.viewport.height).toBe(7);
  expect(initial.text).toContain("File name");
  expect(initial.text).toContain(" notes.txt");
  expect(initial.text).toMatch(/\[ \] disabled/);
  const idleCells = initial.cells.filter((cell) => cell.ownerId === "component-input-field");
  expect(idleCells).toHaveLength(30);
  expect(new Set(idleCells.map((cell) => cell.y)).size).toBe(1);
  expect(idleCells.some((cell) => /^[┌┐└┘╭╮╰╯─│]$/u.test(cell.text))).toBe(false);
  const idleBackground = idleCells[0]!.style.backgroundColor;
  expect(idleCells.every((cell) => cell.style.backgroundColor === idleBackground)).toBe(true);

  await input.fill("世界 👋");
  await expect(input).toHaveValue("世界 👋");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain(" 世界 👋");
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
  const variant = page.getByRole("button", { name: "variant" });
  const size = page.getByRole("button", { name: "size" });
  const disabled = page.getByRole("checkbox", { name: "disabled" });

  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();
  await expect(save).not.toHaveAttribute("aria-disabled");
  await expect(variant).toHaveAttribute("aria-expanded", "false");
  await expect(size).toHaveAttribute("aria-expanded", "false");
  await expect(disabled).toHaveAttribute("aria-checked", "false");

  const initial = await readCellProbe(surface);
  expect(initial.viewport.height).toBe(7);
  const baseCanvas = surface.locator("canvas:not([data-cell-overlay-root])");
  const initialSurfaceBounds = await surface.boundingBox();
  const initialHostBounds = await page.locator(".component-playground").boundingBox();
  const initialLines = initial.text.split("\n");
  expect(initialLines[1]).toContain("variant");
  expect(initialLines[2]).toContain("default");
  expect(initialLines[3]).toContain("Save");
  expect(initialLines[3]).toContain("size");
  expect(initialLines[4]).toContain("default");
  expect(initialLines[5]).toContain("[ ] disabled");
  expect(initial.cells.some((cell) => (
    cell.ownerId === "component-button-playground-controls-scroll" && "█▀▄".includes(cell.text)
  ))).toBe(false);

  const indicatorCell = initial.cells.find((cell) => cell.ownerId === "component-button-disabled");
  const initialCanvasBounds = await surface.locator("canvas").boundingBox();
  expect(indicatorCell).toBeDefined();
  expect(initialCanvasBounds).not.toBeNull();
  await page.mouse.move(
    initialCanvasBounds!.x + (indicatorCell!.x + 0.5) * initialCanvasBounds!.width / initial.viewport.width,
    initialCanvasBounds!.y + (indicatorCell!.y + 0.5) * initialCanvasBounds!.height / initial.viewport.height,
  );
  await expect.poll(async () => (await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId?.startsWith("component-button-disabled")
      && cell.style.backgroundColor !== undefined
  )).length).toBe(12);

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
  await expect.poll(async () => (await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId?.startsWith("component-button-disabled")
      && cell.style.backgroundColor !== undefined
  )).length).toBe(0);
  await expect(surface).toHaveAttribute("data-cell-focused", "component-button-disabled");
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");

  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(disabled).toHaveAttribute("aria-checked", "false");

  await variant.evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "variant options" })).toBeAttached();
  const opened = await readCellProbe(surface);
  expect(opened.viewport).toEqual(initial.viewport);
  expect(opened.overlayViewport).toEqual({
    width: initial.viewport.width,
    height: initial.viewport.height + 3,
  });
  expect(opened.overlays).toHaveLength(1);
  expect(opened.overlays[0]!.rootId).toBe("component-button-variant-content");
  expect(opened.overlays[0]!.text).toContain("default");
  expect(opened.overlays[0]!.text).toContain("outline");
  expect(opened.overlays[0]!.text).toContain("ghost");
  expect(opened.overlays[0]!.cells.some((cell) => "█▀▄".includes(cell.text))).toBe(false);
  expect(opened.text.split("\n")[2]).toContain("default      ▴");
  expect(opened.cells.some((cell) => (
    cell.ownerId === "component-button-playground-controls-scroll" && "█▀▄".includes(cell.text)
  ))).toBe(false);
  await expect(surface.locator('[data-cell-overlay-root="component-button-variant-content"]')).toHaveCount(1);
  expect((await surface.boundingBox())?.height).toBe(initialSurfaceBounds?.height);
  expect((await page.locator(".component-playground").boundingBox())?.height).toBe(initialHostBounds?.height);
  const outlineRow = opened.overlays[0]!.text.split("\n")
    .findIndex((line) => line.includes("outline"));
  const outlineColumn = opened.overlays[0]!.text.split("\n")[outlineRow]!.indexOf("outline");
  const baseCanvasBounds = await baseCanvas.boundingBox();
  expect(outlineRow).toBeGreaterThanOrEqual(0);
  expect(outlineColumn).toBeGreaterThanOrEqual(0);
  expect(baseCanvasBounds).not.toBeNull();
  await page.mouse.click(
    baseCanvasBounds!.x + (
      opened.overlays[0]!.bounds.x + outlineColumn + 0.5
    ) * opened.presentation!.metrics.cellWidth,
    baseCanvasBounds!.y + (
      opened.overlays[0]!.bounds.y + outlineRow + 0.5
    ) * opened.presentation!.metrics.cellHeight,
  );
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("[ Save ]");
  await expect(page.getByRole("listbox", { name: "variant options" })).toHaveCount(0);

  await size.evaluate((element: HTMLElement) => element.click());
  const sizeOpened = await readCellProbe(surface);
  const sizeOverlay = sizeOpened.overlays.find(
    (overlay) => overlay.rootId === "component-button-size-content",
  );
  const sizeLines = sizeOverlay?.text.split("\n") ?? [];
  const largeRow = sizeLines.findIndex((line) => line.includes("lg"));
  const largeColumn = sizeLines[largeRow]?.indexOf("lg") ?? -1;
  expect(largeRow).toBeGreaterThanOrEqual(0);
  expect(largeColumn).toBeGreaterThanOrEqual(0);
  await page.mouse.click(
    baseCanvasBounds!.x + (
      sizeOverlay!.bounds.x + largeColumn + 0.5
    ) * sizeOpened.presentation!.metrics.cellWidth,
    baseCanvasBounds!.y + (
      sizeOverlay!.bounds.y + largeRow + 0.5
    ) * sizeOpened.presentation!.metrics.cellHeight,
  );
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("[  Save  ]");
  await expect(page.getByRole("listbox", { name: "size options" })).toHaveCount(0);

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
  expect((await readCellProbe(surface)).text).toContain("[  Save  ]");
  expect((await readCellProbe(surface)).cells.some((cell) => (
    cell.ownerId === "component-button-save" && cell.style.backgroundColor !== undefined
  ))).toBe(true);
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-cell-press-active");
  expect((await readCellProbe(surface)).text).toContain("[  Save  ]");
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
  const trigger = page.getByRole("button", { name: "Theme" });
  const contentVariant = page.getByRole("button", { name: "content variant", exact: true });
  const disabled = page.getByRole("checkbox", { name: "disabled" });
  const initialSurfaceBounds = await surface.boundingBox();
  const initialHostBounds = await page.locator(".component-playground").boundingBox();

  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(contentVariant).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "border shape", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "border" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "value" })).toHaveCount(0);
  await surface.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.down("Enter");
  await expect(surface).toHaveAttribute("data-cell-press-active", "component-select-trigger");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.up("Enter");
  await expect(surface).not.toHaveAttribute("data-cell-press-active");
  await expect(page.getByRole("listbox", { name: "Theme options" })).toBeAttached();
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("option", { name: "Dark" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "Dark" })).toBeFocused();
  const borderless = await readCellProbe(surface);
  const borderlessOverlay = borderless.overlays.find(
    (overlay) => overlay.rootId === "component-select-content",
  );
  expect(borderlessOverlay?.bounds.height).toBe(3);
  expect(borderlessOverlay?.text).toContain("Light");
  expect(borderlessOverlay?.text).toContain("Dark");
  expect(borderlessOverlay?.text).toContain("System");
  expect(borderlessOverlay?.text).not.toMatch(/[┌┐└┘│─]/u);
  expect(borderless.overlayViewport.height).toBe(borderless.viewport.height + 3);
  expect((await surface.boundingBox())?.height).toBe(initialSurfaceBounds?.height);
  expect((await page.locator(".component-playground").boundingBox())?.height)
    .toBe(initialHostBounds?.height);

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "System" })).toBeFocused();
  await expect(page.getByRole("option", { name: "Dark" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect((await readCellProbe(surface)).text).toContain("Dark");

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("System");

  await trigger.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "Light" })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Light");

  await contentVariant.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "bordered", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "content variant options" })).toHaveCount(0);
  const borderShape = page.getByRole("button", { name: "border shape", exact: true });
  await expect(borderShape).toBeAttached();
  await trigger.evaluate((element: HTMLElement) => element.click());
  const bordered = await readCellProbe(surface);
  const borderedOverlay = bordered.overlays.find(
    (overlay) => overlay.rootId === "component-select-content",
  );
  expect(borderedOverlay?.bounds.height).toBe(5);
  expect(borderedOverlay?.text).toContain("┌");
  expect(borderedOverlay?.text).toContain("│");
  expect(borderedOverlay?.text).toContain("└");
  expect(bordered.overlayViewport.height).toBe(bordered.viewport.height + 5);
  expect((await surface.boundingBox())?.height).toBe(initialSurfaceBounds?.height);
  expect((await page.locator(".component-playground").boundingBox())?.height)
    .toBe(initialHostBounds?.height);
  await page.keyboard.press("Escape");

  await borderShape.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "rounded", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "border shape options" })).toHaveCount(0);
  await trigger.evaluate((element: HTMLElement) => element.click());
  const roundedProbe = await readCellProbe(surface);
  const roundedOverlay = roundedProbe.overlays.find(
    (overlay) => overlay.rootId === "component-select-content",
  );
  expect(roundedOverlay?.text).toContain("╭");
  expect(roundedOverlay?.text).toContain("╰");
  expect(roundedOverlay?.text).not.toContain("┌");
  await page.keyboard.press("Escape");

  await contentVariant.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "raised", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "content variant options" })).toHaveCount(0);
  await expect(borderShape).toHaveCount(0);

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
  await page.goto("/#/components/text");
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
  await page.getByRole("heading", { name: "Text", level: 1 }).click();
  await expect(surface).not.toHaveAttribute("data-cell-range");

  await selectRange();
  await page.getByRole("button", { name: /^(Dark|Light)$/ }).click();
  await expect(surface).not.toHaveAttribute("data-cell-range");
});

test("List shares focus, selection, disabled state, and semantic actions", async ({ page }) => {
  await page.goto("/#/components/list");
  const surface = page.getByLabel("List component");
  const beta = page.getByRole("option", { name: "Beta" });
  const disabled = page.getByRole("option", { name: "Disabled" });
  await expect(page.getByRole("option")).toHaveCount(4);
  await expect(beta).toHaveAttribute("aria-selected", "true");
  await expect(disabled).toHaveAttribute("aria-disabled", "true");

  await surface.focus();
  await expect(beta).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Gamma" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "Alpha" }).evaluate((element: HTMLElement) => element.click());
  await expect(surface).toHaveAttribute("data-cell-focused", "component-list-alpha");
  await expect(page.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
});

test("ScrollArea responds to keyboard, wheel, and thumb drag without scrolling the page", async ({ page }) => {
  await page.goto("/#/components/scroll-area");
  const surface = page.getByLabel("ScrollArea component");
  const canvas = surface.locator("canvas");
  const variant = page.getByRole("button", { name: "variant", exact: true });
  await canvas.scrollIntoViewIfNeeded();
  await surface.focus();
  const surfaceBounds = await surface.boundingBox();
  const hostBounds = await page.locator(".component-playground").boundingBox();
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

  const beforeBorder = await readCellProbe(surface);
  await variant.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "bordered", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "variant options" })).toHaveCount(0);
  const borderShape = page.getByRole("button", { name: "border shape", exact: true });
  await expect(borderShape).toBeAttached();
  const bordered = await readCellProbe(surface);
  expect(visibleRows(bordered.text)).toEqual(visibleRows(beforeBorder.text));
  expect(thumbGlyphs(bordered)).toEqual(thumbGlyphs(beforeBorder));
  expect(bordered.cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "┌┐└┘─│".includes(cell.text)
  ))).toBe(true);
  expect((await surface.boundingBox())?.height).toBe(surfaceBounds?.height);
  expect((await page.locator(".component-playground").boundingBox())?.height)
    .toBe(hostBounds?.height);

  await borderShape.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "rounded", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "border shape options" })).toHaveCount(0);
  expect((await readCellProbe(surface)).cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "╭╮╰╯".includes(cell.text)
  ))).toBe(true);

  await variant.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "plain", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "variant options" })).toHaveCount(0);
  await expect(borderShape).toHaveCount(0);
  expect((await readCellProbe(surface)).cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "┌┐└┘╭╮╰╯".includes(cell.text)
  ))).toBe(false);

});

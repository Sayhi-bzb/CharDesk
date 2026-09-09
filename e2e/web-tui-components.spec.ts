import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";
import { galleryFontSelect } from "./helpers/gallery-font-select";

const navigationGroups = [
  {
    name: "Components",
    links: [
      ["Button", "#/components/button"],
      ["Select", "#/components/select"],
      ["Slider", "#/components/slider"],
      ["Checkbox", "#/components/checkbox"],
      ["Input", "#/components/input"],
      ["ScrollArea", "#/components/scroll-area"],
      ["Toggle", "#/components/toggle"],
      ["Progress", "#/components/progress"],
      ["Radio", "#/components/radio"],
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
  await page.goto("/exp/web-tui/");
  const nav = page.getByRole("navigation", { name: "Cell UI" });
  await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();
  await expect(page.locator(".gallery-brand")).toHaveAttribute("href", "#/components/button");
  await expect(nav.getByRole("link")).toHaveCount(13);
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
  const centeredPreviewBounds = await page.locator(".docs-preview").boundingBox();
  const centeredDemoBounds = await page.locator('[data-cell-probe="component-box"]').boundingBox();
  expect(centeredPreviewBounds).not.toBeNull();
  expect(centeredDemoBounds).not.toBeNull();
  const centeredLeftGap = centeredDemoBounds!.x - centeredPreviewBounds!.x;
  const centeredRightGap = centeredPreviewBounds!.x + centeredPreviewBounds!.width
    - centeredDemoBounds!.x - centeredDemoBounds!.width;
  expect(Math.abs(centeredLeftGap - centeredRightGap)).toBeLessThanOrEqual(1);
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
  expect(widePlayground.text).toContain("variant    default");

  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(async () => (await readCellProbe(
    page.locator('[data-cell-probe="component-button"]'),
  )).viewport).toEqual({ width: 32, height: 15 });
  const narrowPlayground = await readCellProbe(page.locator('[data-cell-probe="component-button"]'));
  const narrowLines = narrowPlayground.text.split("\n");
  expect(narrowLines[10]).toContain("   variant");
  expect(narrowLines[11]).toContain("   size");
  expect(narrowLines[12]).toContain("   disabled");
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
    ["slider", "component-slider"],
    ["checkbox", "component-checkbox"],
    ["input", "component-input"],
    ["scroll-area", "component-scroll-area"],
  ] as const) {
    await page.goto(`/exp/web-tui/#/components/${slug}`);
    await expect.poll(async () => (await readCellProbe(
      page.locator(`[data-cell-probe="${probeId}"]`),
    )).viewport).toEqual({ width: 32, height: 15 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("unknown component routes fail honestly", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/missing");
  await expect(page.getByRole("heading", { name: "Component not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Button" })).toHaveAttribute("href", "#/components/button");
});

test("Gallery DOM contours and dividers stay 2px without narrow overflow", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/button");
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
  await page.goto("/exp/web-tui/#/components/text");
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

  await page.goto("/exp/web-tui/#/components/box");
  const box = await readCellProbe(page.locator('[data-cell-probe="component-box"]'));
  expect(box.text).toContain("Nested boxes");
  expect(box.text).toContain("Left");
  expect(box.text).toContain("Right");
  expect(box.cells.filter((cell) => cell.text === "┌").length).toBe(3);
});

test("Input edits Unicode through the real textbox and Cell frame", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/input");
  const surface = page.getByLabel("Input component");
  const input = page.getByRole("textbox", { name: "File name" });
  const disabled = page.getByRole("checkbox", { name: "disabled" });
  const rounded = page.getByRole("checkbox", { name: "rounded" });

  await expect(page.getByRole("heading", { name: "Input", level: 1 })).toBeVisible();
  await expect(input).toHaveValue("notes.txt");
  const initial = await readCellProbe(surface);
  expect(initial.viewport.height).toBe(7);
  expect(initial.text).toContain("File name");
  expect(initial.text).toContain("┌────────────────────────────┐");
  expect(initial.text).toContain("│notes.txt");
  expect(initial.text).toMatch(/disabled\s+\[ \]/);
  expect(initial.text).toMatch(/rounded\s+\[ \]/);

  await input.fill("世界 👋");
  await expect(input).toHaveValue("世界 👋");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("│世界 👋");
  await rounded.evaluate((element: HTMLElement) => element.click());
  await expect(rounded).toHaveAttribute("aria-checked", "true");
  await expect(input).toHaveValue("世界 👋");
  expect((await readCellProbe(surface)).cells.some((cell) => (
    cell.ownerId === "component-input-field" && "╭╮╰╯".includes(cell.text)
  ))).toBe(true);

  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(input).toHaveJSProperty("disabled", true);
  await expect(disabled).toHaveAttribute("aria-checked", "true");
});

test("Button Playground drives its semantic API through Cell controls", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/button");
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
  expect(initialLines[2]).toContain("variant    default");
  expect(initialLines[3]).toContain("Save");
  expect(initialLines[3]).toContain("size       default");
  expect(initialLines[4]).toContain("disabled   [ ]");
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
    cell.ownerId === "component-button-disabled" && cell.style.backgroundColor !== undefined
  )).length).toBe(5);

  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-cell-press-active", "component-button-disabled");
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-cell-press-active");
  await expect(disabled).toHaveAttribute("aria-checked", "true");
  expect((await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId === "component-button-disabled" && cell.style.bold
  ))).toHaveLength(0);

  await page.mouse.move(
    initialCanvasBounds!.x + 0.5 * initialCanvasBounds!.width / initial.viewport.width,
    initialCanvasBounds!.y + 0.5 * initialCanvasBounds!.height / initial.viewport.height,
  );
  await expect.poll(async () => (await readCellProbe(surface)).cells.filter((cell) => (
    cell.ownerId === "component-button-disabled" && cell.style.backgroundColor !== undefined
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
    height: initial.viewport.height + 5,
  });
  expect(opened.overlays).toHaveLength(1);
  expect(opened.overlays[0]!.rootId).toBe("component-button-variant-content");
  expect(opened.overlays[0]!.text).toContain("default");
  expect(opened.overlays[0]!.text).toContain("outline");
  expect(opened.overlays[0]!.text).toContain("ghost");
  expect(opened.overlays[0]!.cells.some((cell) => "█▀▄".includes(cell.text))).toBe(false);
  expect(opened.text.split("\n")[2]).toContain("variant    default      ▴");
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
  await page.goto("/exp/web-tui/#/components/select");
  const surface = page.getByLabel("Select component");
  const trigger = page.getByRole("button", { name: "Theme" });
  const border = page.getByRole("checkbox", { name: "border" });
  const disabled = page.getByRole("checkbox", { name: "disabled" });
  const rounded = page.getByRole("checkbox", { name: "rounded" });
  const initialSurfaceBounds = await surface.boundingBox();
  const initialHostBounds = await page.locator(".component-playground").boundingBox();

  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(border).toHaveAttribute("aria-checked", "false");
  await expect(rounded).toHaveAttribute("aria-checked", "false");
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

  await border.evaluate((element: HTMLElement) => element.click());
  await expect(border).toHaveAttribute("aria-checked", "true");
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

  await rounded.evaluate((element: HTMLElement) => element.click());
  await expect(rounded).toHaveAttribute("aria-checked", "true");
  await trigger.evaluate((element: HTMLElement) => element.click());
  const roundedProbe = await readCellProbe(surface);
  const roundedOverlay = roundedProbe.overlays.find(
    (overlay) => overlay.rootId === "component-select-content",
  );
  expect(roundedOverlay?.text).toContain("╭");
  expect(roundedOverlay?.text).toContain("╰");
  expect(roundedOverlay?.text).not.toContain("┌");
  await page.keyboard.press("Escape");

  await disabled.evaluate((element: HTMLElement) => element.click());
  await expect(trigger).toHaveAttribute("aria-disabled", "true");
  await trigger.evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "Theme options" })).toHaveCount(0);
});

test("Checkbox Playground keeps direct checked interaction and its disabled prop", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/checkbox");
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
  await page.goto("/exp/web-tui/#/components/slider");
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
  expect(initial.text).toMatch(/range\s+\[ \]/);
  expect(initial.text).toMatch(/disabled\s+\[ \]/);
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
  expect(interval.text).toMatch(/range\s+\[x\]/);
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
  await page.goto("/exp/web-tui/#/components/text");
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
  await page.goto("/exp/web-tui/#/components/list");
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
  await page.goto("/exp/web-tui/#/components/scroll-area");
  const surface = page.getByLabel("ScrollArea component");
  const canvas = surface.locator("canvas");
  const border = page.getByRole("checkbox", { name: "border" });
  const rounded = page.getByRole("checkbox", { name: "rounded" });
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

  await border.evaluate((element: HTMLElement) => element.click());
  await expect(border).toHaveAttribute("aria-checked", "false");
  const borderless = await readCellProbe(surface);
  expect(visibleRows(borderless.text)).toEqual(visibleRows(sizingInitial.text));
  expect(thumbGlyphs(borderless)).toEqual(thumbGlyphs(sizingInitial));
  expect(borderless.cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "┌┐└┘╭╮╰╯─│".includes(cell.text)
  ))).toBe(false);
  expect((await surface.boundingBox())?.height).toBe(surfaceBounds?.height);
  expect((await page.locator(".component-playground").boundingBox())?.height)
    .toBe(hostBounds?.height);

  await border.evaluate((element: HTMLElement) => element.click());
  await expect(border).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await canvas.scrollIntoViewIfNeeded();
  await surface.focus();
  const initial = await readCellProbe(surface);

  await page.keyboard.press("PageDown");
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(initial.text);
  const paged = await readCellProbe(surface);
  const pageY = await page.evaluate(() => window.scrollY);
  await canvas.hover({ position: { x: 80, y: 50 } });
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

  await rounded.evaluate((element: HTMLElement) => element.click());
  await expect(rounded).toHaveAttribute("aria-checked", "true");
  expect((await readCellProbe(surface)).cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "╭╮╰╯".includes(cell.text)
  ))).toBe(true);

  await border.evaluate((element: HTMLElement) => element.click());
  await expect(border).toHaveAttribute("aria-checked", "false");
  expect((await readCellProbe(surface)).cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "┌┐└┘╭╮╰╯".includes(cell.text)
  ))).toBe(false);

});

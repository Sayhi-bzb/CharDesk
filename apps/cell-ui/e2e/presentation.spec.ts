import { expect, test, type Page } from "@playwright/test";
import { cellPoint, ownerBounds, readCellProbe } from "./helpers/cell-probe";

const choosePresentation = async (page: Page, value: "Rich" | "Text") => {
  const trigger = page.getByRole("button", { name: "presentation" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const option = page.getByRole("option", { name: value });
  await expect(option).toBeAttached();
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
};

const chooseConfig = async (page: Page, label: string, value: string) => {
  const trigger = page.getByRole("button", { name: label, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const option = page.getByRole("option", { name: value, exact: true });
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
};

test("Button switches locally between interactive Rich and Text presentations", async ({ page }) => {
  await page.goto("/#/components/button");
  const surface = page.locator('[data-cell-probe="component-button"]');
  const save = surface.getByRole("button", { name: "Save document" });
  await expect(page.locator(".gallery-appearance-controls").getByRole("button", { name: "presentation" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Rich");
  await choosePresentation(page, "Text");
  await expect.poll(async () => (await readCellProbe(surface)).cells.some((cell) =>
    cell.ownerId === "component-button-save" && cell.text === "[")).toBe(true);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("[ Save ]");
  const presentationTrigger = surface.getByRole("button", { name: "presentation" });
  await presentationTrigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("[ Save ]");
  await save.focus();
  await expect(save).toBeFocused();
  await choosePresentation(page, "Rich");
  await expect.poll(async () => (await readCellProbe(surface)).cells.some((cell) =>
    cell.ownerId === "component-button-save" && cell.text === "[")).toBe(false);
  await page.goto("/#/components/badge");
  await expect.poll(async () => (await readCellProbe(page.locator('[data-cell-probe="component-badge"]'))).text).toContain("Rich");
  await page.goto("/#/components/button");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Rich");
  await choosePresentation(page, "Text");
  await page.reload();
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Rich");
});

test("Button content selector keeps its complete Text label on one row", async ({ page }) => {
  await page.goto("/#/components/button");
  const surface = page.locator('[data-cell-probe="component-button"]');
  await choosePresentation(page, "Text");
  await chooseConfig(page, "content", "icon + text");
  const triggerId = "component-button-content-trigger";
  const wide = await readCellProbe(surface);
  const triggerCells = wide.cells.filter((cell) => cell.ownerId === triggerId);
  expect(new Set(triggerCells.map((cell) => cell.y)).size).toBe(1);
  expect(wide.text).toContain("[ icon + text ▾ ]");

  await page.setViewportSize({ width: 180, height: 700 });
  const narrow = await readCellProbe(surface);
  expect(new Set(narrow.cells.filter((cell) => cell.ownerId === triggerId).map((cell) => cell.y)).size)
    .toBeLessThanOrEqual(1);
});

test("text Select exposes navigation and selection as distinct glyphs", async ({ page }) => {
  await page.goto("/#/components/select");
  const surface = page.locator('[data-cell-probe="component-select"]');
  await choosePresentation(page, "Text");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("[");
  const trigger = surface.getByRole("button", { name: "Theme" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const probe = await readCellProbe(surface);
  expect(probe.text).toContain("┌");
  expect(probe.text).toContain("✓");
  const dropdown = probe.overlays.find((overlay) => overlay.rootId === "component-select-content");
  expect(dropdown).toBeDefined();
  expect(dropdown!.bounds.y + dropdown!.bounds.height).toBeLessThanOrEqual(probe.overlayViewport.height);
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("Text and Badge expose the same local presentation selector", async ({ page }) => {
  for (const component of ["text", "badge", "text-area"]) {
    await page.goto(`/#/components/${component}`);
    await choosePresentation(page, "Text");
    const surface = page.locator(`[data-cell-probe="component-${component}"]`);
    await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Text");
    if (component === "text-area") {
      const editor = surface.getByRole("textbox", { name: "Notes" });
      await expect(editor).toBeAttached();
      await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Hello, 世界");
      const idle = await readCellProbe(surface);
      const bounds = ownerBounds(idle, "notes");
      const border = idle.cells.find((cell) => cell.x === bounds.x && cell.y === bounds.y)!;
      const inside = idle.cells.find((cell) => cell.x === bounds.x + 1 && cell.y === bounds.y + 1)!;
      await editor.focus();
      await expect.poll(async () => {
        const cells = (await readCellProbe(surface)).cells;
        const activeBorder = cells.find((cell) => cell.x === border.x && cell.y === border.y);
        const activeInside = cells.find((cell) => cell.x === inside.x && cell.y === inside.y);
        return activeBorder?.style.color === border.style.color
          && activeBorder?.style.backgroundColor === border.style.backgroundColor
          && activeInside?.style.backgroundColor !== inside.style.backgroundColor;
      }).toBe(true);
      await editor.fill("Edited 世界");
      await choosePresentation(page, "Rich");
      await expect(editor).toHaveValue("Edited 世界");
      await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Edited 世界");
    }
  }
});

test("TextArea keeps variant and Rich frame choices across presentations", async ({ page }) => {
  await page.goto("/#/components/text-area");
  const surface = page.locator('[data-cell-probe="component-text-area"]');
  const editor = surface.getByRole("textbox", { name: "Notes" });
  const initial = await readCellProbe(surface);
  expect(initial.cells.some((cell) => cell.ownerId === "notes" && cell.text === "┌")).toBe(false);
  const bounds = ownerBounds(initial, "notes");
  const first = initial.cells.find((cell) => cell.ownerId === "notes" && cell.text === "H")!;
  expect({ x: first.x, y: first.y }).toEqual({ x: bounds.x + 1, y: bounds.y });
  await expect(surface.getByRole("button", { name: "variant", exact: true })).toBeAttached();
  await expect(surface.getByRole("button", { name: "frame", exact: true })).toBeAttached();
  await expect(surface.getByRole("button", { name: "border shape", exact: true })).toHaveCount(0);
  await chooseConfig(page, "frame", "bordered");
  await chooseConfig(page, "border shape", "rounded");
  expect((await readCellProbe(surface)).cells.some((cell) => cell.ownerId === "notes" && cell.text === "╭")).toBe(true);
  await editor.fill("Persisted");
  await choosePresentation(page, "Text");
  await expect(surface.getByRole("button", { name: "variant", exact: true })).toBeAttached();
  await expect(surface.getByRole("button", { name: "frame", exact: true })).toHaveCount(0);
  await expect(surface.getByRole("button", { name: "border shape", exact: true })).toHaveCount(0);
  expect((await readCellProbe(surface)).cells.some((cell) => cell.ownerId === "notes" && cell.text === "┌")).toBe(true);
  await chooseConfig(page, "variant", "ghost");
  await choosePresentation(page, "Rich");
  await expect(editor).toHaveValue("Persisted");
  const rich = await readCellProbe(surface);
  expect(rich.text).toContain("ghost");
  expect(rich.cells.some((cell) => cell.ownerId === "notes" && cell.text === "╭")).toBe(true);
});

test("TextArea previews its beginning on blur and restores editing context by focus method", async ({ page }) => {
  for (const presentation of ["Rich", "Text"] as const) {
    await page.goto("/#/components/text-area");
    if (presentation === "Text") await choosePresentation(page, "Text");
    const surface = page.locator('[data-cell-probe="component-text-area"]');
    const editor = surface.getByRole("textbox", { name: "Notes" });
    const value = Array.from({ length: 15 }, (_, index) => `Line-${String(index).padStart(2, "0")}`).join("\n");
    await editor.fill(value);
    await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Line-14");
    await surface.getByRole("button", { name: "variant", exact: true }).focus();
    await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Line-00");
    expect((await readCellProbe(surface)).text).not.toContain("Line-14");
    await editor.focus();
    await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Line-14");
    await surface.getByRole("button", { name: "variant", exact: true }).focus();
    const idleFirst = (await readCellProbe(surface)).cells.find((cell) => cell.ownerId === "notes" && cell.text === "L")!;
    const idlePoint = await cellPoint(surface, idleFirst.x, idleFirst.y);
    await page.mouse.move(idlePoint.x, idlePoint.y);
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => (await readCellProbe(surface)).cells
      .filter((cell) => cell.ownerId === "notes" && cell.y === idleFirst.y && cell.x >= idleFirst.x)
      .sort((left, right) => left.x - right.x)
      .map((cell) => cell.text).join("")).toContain("Line-01");
    await editor.focus();
    await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Line-14");
    await surface.getByRole("button", { name: "variant", exact: true }).focus();
    const first = (await readCellProbe(surface)).cells.find((cell) => cell.ownerId === "notes" && cell.text === "L")!;
    const point = await cellPoint(surface, first.x, first.y);
    await page.mouse.click(point.x, point.y);
    await expect(editor).toBeFocused();
    await expect.poll(async () => editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(0);
    await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Line-00");
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`TextArea scrollbar stays visible against its inverse surface (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const activeColor = scheme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
    const activeBackground = scheme === "light" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)";
    const thumbGlyphs = new Set(["█", "▀", "▄", "▐", "▌", "\u{1FB91}", "\u{1FB92}"]);
    for (const presentation of ["Rich", "Text"] as const) {
      await page.goto("/#/components/text-area");
      if (presentation === "Text") await choosePresentation(page, "Text");
      const surface = page.locator('[data-cell-probe="component-text-area"]');
      const editor = surface.getByRole("textbox", { name: "Notes" });
      await editor.fill(Array.from({ length: 12 }, () => "x".repeat(40)).join("\n"));
      await expect.poll(async () => (await readCellProbe(surface)).cells
        .filter((cell) => cell.ownerId === "notes" && thumbGlyphs.has(cell.text))
        .length).toBeGreaterThan(1);
      const probe = await readCellProbe(surface);
      const thumbs = probe.cells.filter((cell) => cell.ownerId === "notes" && thumbGlyphs.has(cell.text));
      const horizontalY = Math.max(...thumbs.map((cell) => cell.y));
      expect(thumbs.some((cell) => cell.y < horizontalY)).toBe(true);
      expect(thumbs.filter((cell) => cell.y === horizontalY).length).toBeGreaterThan(1);
      expect(thumbs.every((cell) => cell.style.color === activeColor
        && cell.style.backgroundColor === activeBackground)).toBe(true);
      await surface.getByRole("button", { name: "variant", exact: true }).focus();
      await expect.poll(async () => (await readCellProbe(surface)).cells
        .filter((cell) => cell.ownerId === "notes" && thumbGlyphs.has(cell.text))
        .some((cell) => cell.style.color !== activeColor)).toBe(true);
    }
  });
}

test("TextArea drag selection contrasts with its focused surface and hides on blur", async ({ page }) => {
  await page.goto("/#/components/text-area");
  const surface = page.locator('[data-cell-probe="component-text-area"]');
  const editor = surface.getByRole("textbox", { name: "Notes" });
  const initial = await readCellProbe(surface);
  const first = initial.cells.find((cell) => cell.ownerId === "notes" && cell.text === "H")!;
  const start = await cellPoint(surface, first.x, first.y);
  const end = await cellPoint(surface, first.x + 6, first.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => editor.evaluate((element: HTMLTextAreaElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
  }))).toEqual({ start: 0, end: 6 });
  await expect.poll(async () => {
    const probe = await readCellProbe(surface);
    const h = probe.cells.find((cell) => cell.ownerId === "notes" && cell.text === "H");
    const world = probe.cells.find((cell) => cell.ownerId === "notes" && cell.text === "世");
    return h?.style.backgroundColor !== world?.style.backgroundColor;
  }).toBe(true);
  const selected = await readCellProbe(surface);
  const glyph = (text: string) => selected.cells.find((cell) => cell.ownerId === "notes" && cell.text === text)!;
  expect(glyph("H").style.backgroundColor).not.toBe(glyph("世").style.backgroundColor);
  expect(glyph("H").style.underline).not.toBe(true);

  await page.getByRole("heading", { name: "TextArea", level: 1 }).click();
  await expect.poll(async () => {
    const probe = await readCellProbe(surface);
    return probe.cells.find((cell) => cell.ownerId === "notes" && cell.text === "H")?.style.backgroundColor;
  }).not.toBe(glyph("H").style.backgroundColor);
  await editor.focus();
  await expect.poll(async () => {
    const probe = await readCellProbe(surface);
    return probe.cells.find((cell) => cell.ownerId === "notes" && cell.text === "H")?.style.backgroundColor;
  }).toBe(glyph("H").style.backgroundColor);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect.poll(async () => editor.evaluate((element: HTMLTextAreaElement) => ({
    length: element.selectionEnd - element.selectionStart,
    direction: element.selectionDirection,
  }))).toEqual({ length: 1, direction: "backward" });
});

test("TextArea drag uses Cell offsets even when the pointer starts on its native caret textarea", async ({ page }) => {
  for (const origin of ["unfocused-caret", "focused-caret", "neighbor", "backward"] as const) {
    await page.goto("/#/components/text-area");
    const surface = page.locator('[data-cell-probe="component-text-area"]');
    const editor = surface.getByRole("textbox", { name: "Notes" });
    const first = (await readCellProbe(surface)).cells.find((cell) => cell.ownerId === "notes" && cell.text === "H")!;
    const start = await cellPoint(surface, first.x, first.y);
    const end = await cellPoint(surface, first.x + 5, first.y);
    if (origin !== "unfocused-caret") {
      await page.mouse.click(start.x, start.y);
      await page.keyboard.press("Home");
    }
    if (origin === "backward") await page.mouse.click(end.x, end.y);
    const from = origin === "backward" ? end : origin === "neighbor"
      ? await cellPoint(surface, first.x + 1, first.y) : start;
    const to = origin === "backward" ? start : end;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => editor.evaluate((element: HTMLTextAreaElement) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection,
    }))).toEqual({
      start: origin === "neighbor" ? 1 : 0,
      end: 5,
      direction: origin === "backward" ? "backward" : "forward",
    });
  }
});

test("TextInput caret-origin drag shares the Cell selection path", async ({ page }) => {
  await page.goto("/#/components/input");
  const surface = page.locator('[data-cell-probe="component-input"]');
  const editor = surface.getByRole("textbox", { name: "File name" });
  await editor.focus();
  await page.keyboard.press("Home");
  const first = (await readCellProbe(surface)).cells.find((cell) => cell.ownerId === "component-input-field" && cell.text === "n")!;
  const start = await cellPoint(surface, first.x, first.y);
  const end = await cellPoint(surface, first.x + 5, first.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => editor.evaluate((element: HTMLTextAreaElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
  }))).toEqual({ start: 0, end: 5 });
});

test("canceling an editor pointer drag freezes its Cell selection", async ({ page }) => {
  await page.goto("/#/components/text-area");
  const surface = page.locator('[data-cell-probe="component-text-area"]');
  const editor = surface.getByRole("textbox", { name: "Notes" });
  const first = (await readCellProbe(surface)).cells.find((cell) => cell.ownerId === "notes" && cell.text === "H")!;
  const start = await cellPoint(surface, first.x, first.y);
  const end = await cellPoint(surface, first.x + 5, first.y);
  await surface.evaluate((element) => element.addEventListener("pointerdown", (event) => {
    element.dataset.dragPointerId = String(event.pointerId);
  }));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect.poll(async () => editor.evaluate((element: HTMLTextAreaElement) =>
    element.selectionEnd)).toBe(5);
  const pointerId = Number(await surface.getAttribute("data-drag-pointer-id"));
  await surface.dispatchEvent("pointercancel", { pointerId });
  await page.mouse.move((await cellPoint(surface, first.x + 8, first.y)).x, end.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => editor.evaluate((element: HTMLTextAreaElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
  }))).toEqual({ start: 0, end: 5 });
});

test("Text hides character-ineffective controls but keeps color and glyph choices", async ({ page }) => {
  const cases: readonly { route: string; hidden: readonly string[]; visible: readonly string[]; checks?: readonly string[] }[] = [
    { route: "button", hidden: ["variant"], visible: ["content"], checks: ["disabled"] },
    { route: "progress", hidden: ["variant"], visible: [], checks: ["number", "indeterminate"] },
    { route: "table", hidden: ["variant"], visible: [] },
    { route: "tabs", hidden: ["variant"], visible: [] },
    { route: "alert", hidden: ["border"], visible: ["variant"] },
    { route: "dialog", hidden: ["border"], visible: ["variant"] },
    { route: "tooltip", hidden: ["border"], visible: ["variant"] },
    { route: "select", hidden: ["dropdown frame", "border shape"], visible: ["variant"] },
    { route: "combobox", hidden: ["dropdown frame", "border shape"], visible: ["variant"] },
    { route: "input", hidden: [], visible: ["variant"] },
    { route: "spinner", hidden: [], visible: ["variant"] },
    { route: "separator", hidden: [], visible: ["variant"] },
  ];
  for (const { route, hidden, visible, checks } of cases) {
    await page.goto(`/#/components/${route}`);
    await choosePresentation(page, "Text");
    const surface = page.locator(`[data-cell-probe="component-${route}"]`);
    for (const label of hidden) await expect(surface.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    for (const label of visible) await expect(surface.getByRole("button", { name: label, exact: true })).toBeAttached();
    for (const label of checks ?? []) {
      await expect(surface.getByRole("checkbox", { name: label, exact: true })).toBeAttached();
    }
  }
});

test("Rich choices survive Text and Box exposes only effective frame controls", async ({ page }) => {
  await page.goto("/#/components/button");
  const button = page.locator('[data-cell-probe="component-button"]');
  await chooseConfig(page, "variant", "ghost");
  await choosePresentation(page, "Text");
  await expect(button.getByRole("button", { name: "variant" })).toHaveCount(0);
  await choosePresentation(page, "Rich");
  await expect.poll(async () => (await readCellProbe(button)).text).toContain("ghost");

  await page.goto("/#/__fixtures/box");
  const box = page.locator('[data-cell-probe="component-box"]');
  await chooseConfig(page, "frame", "bordered");
  await chooseConfig(page, "border shape", "rounded");
  await choosePresentation(page, "Text");
  await expect(box.getByRole("button", { name: "frame", exact: true })).toBeAttached();
  await expect(box.getByRole("button", { name: "border shape" })).toHaveCount(0);
  expect((await readCellProbe(box)).text).toContain("┌");
  await chooseConfig(page, "variant", "surface");
  await expect(box.getByRole("button", { name: "frame", exact: true })).toHaveCount(0);
  await choosePresentation(page, "Rich");
  expect((await readCellProbe(box)).text).toContain("╭");
});

test("Text ScrollArea sizes its forced surface border without exposing inert frame controls", async ({ page }) => {
  await page.goto("/#/components/scroll-area");
  const surface = page.locator('[data-cell-probe="component-scroll-area"]');
  await chooseConfig(page, "variant", "surface");
  await choosePresentation(page, "Text");
  await expect(surface.getByRole("button", { name: "frame", exact: true })).toHaveCount(0);
  await expect(surface.getByRole("button", { name: "border shape" })).toHaveCount(0);
  const border = (await readCellProbe(surface)).cells.filter((cell) =>
    cell.ownerId === "component-scroll-area" && "┌─┐".includes(cell.text));
  const top = border.filter((cell) => cell.y === Math.min(...border.map((item) => item.y)));
  expect(top).toHaveLength(28);
  await choosePresentation(page, "Rich");
  expect((await readCellProbe(surface)).cells.some((cell) =>
    cell.ownerId === "component-scroll-area" && cell.text === "┌")).toBe(false);
});

test("Text vertical ScrollArea rail keeps its Unicode texture through keyboard and thumb drag", async ({ page }) => {
  await page.goto("/#/components/scroll-area");
  const surface = page.locator('[data-cell-probe="component-scroll-area"]');
  await choosePresentation(page, "Text");
  const railCells = async () => (await readCellProbe(surface)).cells
    .filter((cell) => cell.ownerId === "component-scroll-area"
      && "\u{1FB90}\u{1FB91}\u{1FB92}█".includes(cell.text));
  await expect.poll(async () => (await railCells()).map((cell) => cell.text)).toContain("\u{1FB90}");
  const initial = await railCells();
  const initialProbe = await readCellProbe(surface);
  for (let row = 1; row <= 4; row += 1) {
    expect(initialProbe.cells.find((cell) => cell.ownerId === `component-scroll-row-${row}` && cell.text === "]")?.x)
      .toBe(initial[0]!.x - 1);
  }
  expect(initial.some((cell) => cell.text === "\u{1FB91}" || cell.text === "\u{1FB92}")).toBe(true);
  const trackColors = new Set(initial.filter((cell) => cell.text === "\u{1FB90}").map((cell) => cell.style.color));
  const thumbColors = new Set(initial.filter((cell) => cell.text !== "\u{1FB90}").map((cell) => cell.style.color));
  expect(trackColors.size).toBe(1);
  expect(thumbColors.size).toBe(1);
  expect(trackColors).not.toEqual(thumbColors);
  expect((await readCellProbe(surface)).text).not.toMatch(/[▀▄]/u);

  await surface.getByRole("button", { name: "01  Row 1" }).focus();
  await page.keyboard.press("PageDown");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("05  Row 5");
  const afterKey = await railCells();
  expect(afterKey.map((cell) => cell.text)).not.toEqual(initial.map((cell) => cell.text));

  const canvas = surface.locator("canvas").first();
  const probe = await readCellProbe(surface);
  const thumb = afterKey.find((cell) => cell.text === "█")!;
  const bounds = (await canvas.boundingBox())!;
  const cellWidth = bounds.width / probe.viewport.width;
  const cellHeight = bounds.height / probe.viewport.height;
  await page.mouse.move(bounds.x + (thumb.x + 0.5) * cellWidth, bounds.y + (thumb.y + 0.5) * cellHeight);
  await page.mouse.down();
  await page.mouse.move(bounds.x + (thumb.x + 0.5) * cellWidth,
    bounds.y + Math.max(0.5, thumb.y - 2.5) * cellHeight, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await railCells()).map((cell) => cell.text)).not.toEqual(afterKey.map((cell) => cell.text));

  await choosePresentation(page, "Rich");
  expect((await readCellProbe(surface)).cells.some((cell) =>
    cell.ownerId === "component-scroll-area" && "\u{1FB90}\u{1FB91}\u{1FB92}".includes(cell.text))).toBe(false);
});

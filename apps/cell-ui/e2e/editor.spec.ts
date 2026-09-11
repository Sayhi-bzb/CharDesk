import { expect, test } from "@playwright/test";
import { copyCellRange, readCellMetrics, readCellProbe } from "./helpers/cell-probe";

for (const scheme of ["light", "dark"] as const) {
  test(`editor activity and borders follow actual focus, not input modality (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/#/__fixtures/all");
    const surface = page.locator('[data-cell-probe="editor"]');
    const canvas = surface.locator("canvas");
    const heading = page.getByRole("heading", { name: "Cell UI Fixtures", exact: true });
    const inverse = scheme === "light"
      ? { color: "rgb(255, 255, 255)", backgroundColor: "rgb(0, 0, 0)" }
      : { color: "rgb(0, 0, 0)", backgroundColor: "rgb(255, 255, 255)" };
    for (const [name, id] of [["File name", "editor-name"], ["Document", "editor-document"]]) {
      const input = surface.getByRole("textbox", { name, exact: true });
      await input.fill("");
      await heading.click();
      await canvas.scrollIntoViewIfNeeded();
      const idle = await readCellProbe(surface);
      const ownCells = idle.cells.filter((cell) => cell.ownerId === id);
      const corner = ownCells.find((cell) => cell.text === "┌")!;
      expect(corner).toBeDefined();
      const metrics = await readCellMetrics(surface);
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.click(bounds.x + (corner.x + 1.5) * metrics.cellWidth,
        bounds.y + (corner.y + 1.5) * metrics.cellHeight);
      await expect(input).toBeFocused();
      // No key event has occurred: every owned cell, including border and padding, is active.
      const assertActive = async () => {
        await expect.poll(async () => {
          const cells = (await readCellProbe(surface)).cells.filter((cell) => cell.ownerId === id);
          return cells.length >= ownCells.length && cells.every((cell) =>
            cell.style.color === inverse.color && cell.style.backgroundColor === inverse.backgroundColor);
        }).toBe(true);
      };
      await assertActive();
      await page.mouse.move(bounds.x + bounds.width + 10, bounds.y);
      await assertActive();
      await page.keyboard.type("x");
      await assertActive();
      await page.keyboard.press("Backspace");
      await assertActive();
      await expect(input).toHaveValue("");
      const assertIdle = async () => {
        await expect.poll(async () => (await readCellProbe(surface)).cells.filter((cell) => cell.ownerId === id))
          .toEqual(ownCells);
      };
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await assertIdle();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await assertActive();
      await heading.click();
      await assertIdle();
      expect((await readCellProbe(surface)).text).toBe(idle.text);
    }
    await surface.getByRole("textbox", { name: "File name", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(surface.getByRole("textbox", { name: "Document", exact: true })).toBeFocused();
    const tabbed = await readCellProbe(surface);
    expect(tabbed.cells.filter((cell) => cell.ownerId === "editor-document")
      .every((cell) => cell.style.color === inverse.color && cell.style.backgroundColor === inverse.backgroundColor)).toBe(true);
    expect(tabbed.cells.find((cell) => cell.ownerId === "editor-name" && cell.text === "┌")?.style.backgroundColor).toBeUndefined();
  });
}

test("Cell editor shares Unicode, composition, selection, and history across Canvas and textarea", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/#/__fixtures/all");
  await page.waitForLoadState("networkidle");
  expect(pageErrors).toEqual([]);

  const section = page.locator("#editor");
  const surface = section.getByLabel("Cell text editor");
  const canvas = surface.locator("canvas");
  const name = section.getByRole("textbox", { name: "File name" });
  const document = section.getByRole("textbox", { name: "Document" });
  await expect(name).toHaveValue("notes.txt");
  await expect(document).toHaveAttribute("aria-multiline", "true");

  await name.fill("A中🙂");
  await expect(canvas).toHaveAttribute("data-cell-text", /A中🙂/);
  await name.press("ArrowLeft");
  await expect(name).toHaveJSProperty("selectionStart", 2);

  await name.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    element.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "你" }));
  });
  await expect(canvas).toHaveAttribute("data-cell-text", /A中你🙂/);
  await name.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "你" }));
  });
  await name.press("Control+z");
  await expect(name).toHaveValue("A中🙂");

  await name.fill("abcdef");
  await canvas.scrollIntoViewIfNeeded();
  const { cellWidth, cellHeight } = await readCellMetrics(surface);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 3.5 * cellWidth, bounds!.y + 2.5 * cellHeight);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 6.5 * cellWidth, bounds!.y + 2.5 * cellHeight, { steps: 6 });
  await page.mouse.up();
  await expect(name).toHaveJSProperty("selectionStart", 2);
  await expect(name).toHaveJSProperty("selectionEnd", 5);

  await document.fill("你好 👋\nemoji: 👩‍💻");
  await expect(canvas).toHaveAttribute("data-cell-text", /你好 👋/);
  await expect(canvas).toHaveAttribute("data-cell-text", /emoji: 👩‍💻/);
  await expect(section.getByRole("textbox")).toHaveCount(2);
  expect(pageErrors).toEqual([]);
});

test("Cell range selects and copies the final rendered border", async ({ page }) => {
  await page.goto("/#/__fixtures/all");
  await page.waitForLoadState("networkidle");
  const section = page.locator("#editor");
  const surface = section.getByLabel("Cell text editor");
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const { cellWidth, cellHeight } = await readCellMetrics(surface);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(bounds!.x + 0.5 * cellWidth, bounds!.y + 1.5 * cellHeight);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 39.5 * cellWidth, bounds!.y + 3.5 * cellHeight, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");

  await expect(surface).toHaveAttribute("data-cell-range", "0,1,40,3");
  const expected = [
    "┌──────────────────────────────────────┐",
    "│notes.txt                             │",
    "└──────────────────────────────────────┘",
  ].join("\n");
  expect(await copyCellRange(surface)).toBe(expected);

  await surface.press("Escape");
  await expect(surface).not.toHaveAttribute("data-cell-range");
});

test("horizontal and vertical editor scroll cannot paint over chrome Cells", async ({ page }) => {
  await page.goto("/#/__fixtures/all");
  await page.waitForLoadState("networkidle");
  const section = page.locator("#editor");
  const surface = section.getByLabel("Cell text editor");
  const canvas = surface.locator("canvas");
  await section.getByRole("textbox", { name: "File name" }).fill("0123456789".repeat(5));
  await section.getByRole("textbox", { name: "Document" }).fill(
    Array.from({ length: 9 }, (_, index) => `${index}: ${"x".repeat(48)}`).join("\n")
  );

  const lines = (await canvas.getAttribute("data-cell-text"))!.split("\n");
  const border = `┌${"─".repeat(38)}┐`;
  const bottom = `└${"─".repeat(38)}┘`;
  expect(lines[1]).toBe(border);
  expect(lines[2]?.startsWith("│")).toBe(true);
  expect(lines[2]?.endsWith("│")).toBe(true);
  expect(lines[3]).toBe(bottom);
  expect(lines[5]).toBe(border);
  for (let row = 6; row <= 10; row += 1) {
    expect(lines[row]?.startsWith("│")).toBe(true);
    expect(lines[row]?.endsWith("│")).toBe(true);
  }
  expect(lines[11]).toBe(bottom);

  await canvas.scrollIntoViewIfNeeded();
  const { cellWidth, cellHeight } = await readCellMetrics(surface);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(bounds!.x + 0.5 * cellWidth, bounds!.y + 5.5 * cellHeight);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 39.5 * cellWidth, bounds!.y + 11.5 * cellHeight, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  const selected = (await copyCellRange(surface)).split("\n");
  expect(selected[0]).toBe(border);
  expect(selected.at(-1)).toBe(bottom);
});

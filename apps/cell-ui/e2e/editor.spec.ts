import { expect, test } from "@playwright/test";
import { cellPoint, copyCellRange, ownerBounds, ownerCells, readCellProbe } from "./helpers/cell-probe";

for (const scheme of ["light", "dark"] as const) {
  test(`editor activity and borders follow actual focus, not input modality (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/#/__fixtures/editor");
    const surface = page.locator('[data-cell-probe="editor"]');
    const canvas = surface.locator("canvas");
    const heading = page.getByRole("heading", { name: "Cell UI Fixture", exact: true });
    const inverse = scheme === "light"
      ? { color: "rgb(255, 255, 255)", backgroundColor: "rgb(0, 0, 0)" }
      : { color: "rgb(0, 0, 0)", backgroundColor: "rgb(255, 255, 255)" };
    for (const [name, id] of [["File name", "editor-name"], ["Document", "editor-document"]]) {
      const input = surface.getByRole("textbox", { name, exact: true });
      await input.fill("");
      await heading.click();
      await canvas.scrollIntoViewIfNeeded();
      const idle = await readCellProbe(surface);
      const ownCells = ownerCells(idle, id);
      const owned = ownerBounds(idle, id);
      const point = await cellPoint(surface, owned.x + Math.min(1, owned.width - 1),
        owned.y + Math.min(1, owned.height - 1));
      await page.mouse.click(point.x, point.y);
      await expect(input).toBeFocused();
      const bounds = (await canvas.boundingBox())!;
      // No key event has occurred: TextArea keeps its border idle while its inner Cells activate.
      const assertActive = async () => {
        await expect.poll(async () => {
          const cells = (await readCellProbe(surface)).cells.filter((cell) => cell.ownerId === id);
          return cells.length >= ownCells.length && cells.every((cell) => {
            const border = id === "editor-document" && (
              cell.x === owned.x || cell.x === owned.x + owned.width - 1
              || cell.y === owned.y || cell.y === owned.y + owned.height - 1
            );
            if (!border) return cell.style.color === inverse.color
              && cell.style.backgroundColor === inverse.backgroundColor;
            const idleCell = ownCells.find((item) => item.x === cell.x && item.y === cell.y);
            return cell.style.color === idleCell?.style.color
              && cell.style.backgroundColor === idleCell?.style.backgroundColor;
          });
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
    const documentBounds = ownerBounds(tabbed, "editor-document");
    expect(ownerCells(tabbed, "editor-document").every((cell) => {
      const border = cell.x === documentBounds.x || cell.x === documentBounds.x + documentBounds.width - 1
        || cell.y === documentBounds.y || cell.y === documentBounds.y + documentBounds.height - 1;
      return border
        ? cell.style.color !== inverse.color && cell.style.backgroundColor !== inverse.backgroundColor
        : cell.style.color === inverse.color && cell.style.backgroundColor === inverse.backgroundColor;
    })).toBe(true);
    expect(ownerCells(tabbed, "editor-name")[0]?.style.backgroundColor)
      .not.toBe(inverse.backgroundColor);
  });
}

test("Cell editor shares Unicode, composition, selection, and history across Canvas and textarea", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/#/__fixtures/editor");
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
  const filled = await readCellProbe(surface);
  const first = ownerCells(filled, "editor-name").find((cell) => cell.text === "a")!;
  const start = await cellPoint(surface, first.x + 2, first.y);
  const end = await cellPoint(surface, first.x + 5, first.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
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
  await page.goto("/#/__fixtures/editor");
  await page.waitForLoadState("networkidle");
  const section = page.locator("#editor");
  const surface = section.getByLabel("Cell text editor");
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const probe = await readCellProbe(surface);
  const editor = ownerBounds(probe, "editor-document");
  const start = await cellPoint(surface, editor.x, editor.y);
  const end = await cellPoint(surface, editor.x + editor.width - 1, editor.y + editor.height - 1);

  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");

  await expect(surface).toHaveAttribute(
    "data-cell-range",
    `${editor.x},${editor.y},${editor.width},${editor.height}`,
  );
  const copied = await copyCellRange(surface);
  expect(copied.split("\n")[0]).toBe(`┌${"─".repeat(editor.width - 2)}┐`);
  expect(copied.split("\n").at(-1)).toBe(`└${"─".repeat(editor.width - 2)}┘`);

  await surface.press("Escape");
  await expect(surface).not.toHaveAttribute("data-cell-range");
});

test("horizontal and vertical editor scroll cannot paint over chrome Cells", async ({ page }) => {
  await page.goto("/#/__fixtures/editor");
  await page.waitForLoadState("networkidle");
  const section = page.locator("#editor");
  const surface = section.getByLabel("Cell text editor");
  const canvas = surface.locator("canvas");
  await section.getByRole("textbox", { name: "File name" }).fill("0123456789".repeat(5));
  await section.getByRole("textbox", { name: "Document" }).fill(
    Array.from({ length: 9 }, (_, index) => `${index}: ${"x".repeat(48)}`).join("\n")
  );

  const before = await readCellProbe(surface);
  const area = ownerBounds(before, "editor-document");
  const lines = before.text.split("\n");
  const border = `┌${"─".repeat(area.width - 2)}┐`;
  const bottom = `└${"─".repeat(area.width - 2)}┘`;
  expect(lines[area.y]).toBe(border);
  for (let row = area.y + 1; row < area.y + area.height - 1; row += 1) {
    expect(lines[row]?.startsWith("│")).toBe(true);
    expect(lines[row]?.endsWith("│")).toBe(true);
  }
  expect(lines[area.y + area.height - 1]).toBe(bottom);

  await canvas.scrollIntoViewIfNeeded();
  const start = await cellPoint(surface, area.x, area.y);
  const end = await cellPoint(surface, area.x + area.width - 1, area.y + area.height - 1);
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  const selected = (await copyCellRange(surface)).split("\n");
  expect(selected[0]).toBe(border);
  expect(selected.at(-1)).toBe(bottom);
});

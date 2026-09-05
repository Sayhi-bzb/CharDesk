import { expect, test } from "@playwright/test";

test("Cell editor shares Unicode, composition, selection, and history across Canvas and textarea", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/exp/web-tui/");
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
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 3.5 * 9, bounds!.y + 2.5 * 19);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 6.5 * 9, bounds!.y + 2.5 * 19, { steps: 6 });
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
  await page.goto("/exp/web-tui/");
  await page.waitForLoadState("networkidle");
  const section = page.locator("#editor");
  const surface = section.getByLabel("Cell text editor");
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(bounds!.x + 0.5 * 9, bounds!.y + 1.5 * 19);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 39.5 * 9, bounds!.y + 3.5 * 19, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");

  await expect(surface).toHaveAttribute("data-cell-range", "0,1,40,3");
  const expected = [
    "┌──────────────────────────────────────┐",
    "│notes.txt                             │",
    "└──────────────────────────────────────┘",
  ].join("\n");
  await expect(section.getByLabel("Selected Cell text")).toHaveText(expected);
  const copied = await surface.evaluate((element) => {
    const clipboard = new DataTransfer();
    element.dispatchEvent(new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    }));
    return clipboard.getData("text/plain");
  });
  expect(copied).toBe(expected);

  await surface.press("Escape");
  await expect(surface).not.toHaveAttribute("data-cell-range");
});

test("horizontal and vertical editor scroll cannot paint over chrome Cells", async ({ page }) => {
  await page.goto("/exp/web-tui/");
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
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(bounds!.x + 0.5 * 9, bounds!.y + 5.5 * 19);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 39.5 * 9, bounds!.y + 11.5 * 19, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  const selected = (await section.getByLabel("Selected Cell text").textContent())!.split("\n");
  expect(selected[0]).toBe(border);
  expect(selected.at(-1)).toBe(bottom);
});

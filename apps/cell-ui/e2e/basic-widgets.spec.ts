import { expect, test, type Locator, type Page } from "@playwright/test";
import { canvasFor, cellPoint, readCellProbe, readCellText } from "./helpers/cell-probe";

async function clickCellOwner(page: Page, surface: Locator, id: string) {
  const canvas = canvasFor(surface).first();
  await canvas.scrollIntoViewIfNeeded();
  const frame = await readCellProbe(surface);
  const cell = frame.cells.find((cell) => cell.ownerId === id);
  expect(cell).toBeDefined();
  const point = await cellPoint(surface, cell!.x, cell!.y);
  await page.mouse.click(point.x, point.y);
}

test("Toggle keeps pressed state after mouse exit and supports keyboard release", async ({ page }) => {
  await page.goto("/#/components/toggle");
  const surface = page.locator('[data-cell-probe="component-toggle"]');
  const toggle = surface.getByRole("button", { name: "Bold", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await clickCellOwner(page, surface, "component-toggle-bold");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await page.mouse.click(1, 100);
  await expect(surface).not.toHaveAttribute("data-cell-activation-flash");
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  const idle = await readCellProbe(surface);
  expect(idle.text).toContain("● Bold");
  const toggleCells = idle.cells.filter((cell) => cell.ownerId === "component-toggle-bold");
  expect(toggleCells.every((cell) => cell.style.backgroundColor === "rgb(255, 255, 255)"
    || cell.style.backgroundColor === "rgb(230, 230, 230)")).toBe(true);
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await readCellText(surface)).toContain("○ Bold");
});

test("Radio mouse and arrow selection share one semantic group", async ({ page }) => {
  await page.goto("/#/components/radio");
  const surface = page.locator('[data-cell-probe="component-radio"]');
  const group = surface.getByRole("radiogroup", { name: "Appearance" });
  await expect(group.getByRole("radio")).toHaveCount(3);
  await clickCellOwner(page, surface, "component-radio-dark");
  await expect(group.getByRole("radio", { name: "Dark", exact: true })).toHaveAttribute("aria-checked", "true");
  // Focus exit cancels any optional confirmation before keyboard navigation.
  await page.mouse.click(1, 100);
  await group.getByRole("radio", { name: "Dark", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(group.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  await page.keyboard.press("ArrowDown");
  await expect(group.getByRole("radio", { name: "Light", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(await readCellText(surface)).toContain("(●) Light");
  await page.keyboard.press("Tab");
  await expect(surface.getByRole("button", { name: "presentation" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(surface.getByRole("checkbox", { name: "disabled", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(surface.getByRole("button", { name: "presentation" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(group.getByRole("radio", { name: "Light", exact: true })).toBeFocused();
});

test("Progress loads continuously, shows its number, and switches to indeterminate animation", async ({ page }) => {
  await page.clock.install();
  await page.goto("/#/components/progress");
  const surface = page.locator('[data-cell-probe="component-progress"]');
  const bar = surface.getByRole("progressbar");
  await expect(bar).toHaveAttribute("aria-valuenow", /\d+/);
  const initialValue = await bar.getAttribute("aria-valuenow");
  await expect.poll(() => bar.getAttribute("aria-valuenow")).not.toBe(initialValue);
  await expect(surface.getByRole("slider")).toHaveCount(0);
  const progressCells = async () => (await readCellProbe(surface)).cells
    .filter((cell) => cell.ownerId === "component-progress-bar")
    .sort((left, right) => left.x - right.x);
  await expect.poll(async () => (await progressCells()).map((cell) => cell.text).join(""))
    .toMatch(/^[█░]{20}$/);
  const number = surface.getByRole("checkbox", { name: "number" });
  await expect(number).toHaveAttribute("aria-checked", "false");
  await number.evaluate((element: HTMLElement) => element.click());
  await expect(number).toHaveAttribute("aria-checked", "true");
  const numberedText = async () => (await progressCells()).map((cell) => cell.text).join("");
  await expect.poll(numberedText).toMatch(/^[█░]{15} \d{1,3}% *$/);
  expect((await progressCells())).toHaveLength(20);
  const initialNumber = (await numberedText()).match(/\d{1,3}%/)?.[0];
  await expect.poll(async () => (await numberedText()).match(/\d{1,3}%/)?.[0])
    .not.toBe(initialNumber);
  await expect(surface.getByRole("button", { name: "variant" })).toBeAttached();
  await expect(number).toHaveAttribute("aria-checked", "true");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  const indeterminate = surface.getByRole("checkbox", { name: "indeterminate" });
  await expect(indeterminate).toHaveAttribute("aria-checked", "false");
  await indeterminate.evaluate((element: HTMLElement) => element.click());
  await expect(indeterminate).toHaveAttribute("aria-checked", "true");
  await expect(bar).not.toHaveAttribute("aria-valuenow");
  await expect(bar).not.toHaveAttribute("aria-valuemin");
  await expect(bar).not.toHaveAttribute("aria-valuemax");
  await expect.poll(numberedText).toMatch(/^[█░]{20}$/);
  const thumbOffsets = async () => {
    const cells = (await readCellProbe(surface)).cells
      .filter((cell) => cell.ownerId === "component-progress-bar");
    const trackStart = Math.min(...cells.map((cell) => cell.x));
    return cells.filter((cell) => cell.text === "█")
      .map((cell) => cell.x - trackStart)
      .sort((left, right) => left - right);
  };
  await page.clock.runFor(2_000);
  await expect.poll(async () => (await thumbOffsets()).some((offset) => offset >= 16)).toBe(true);
  await page.clock.runFor(500);
  await expect.poll(async () => (await thumbOffsets()).includes(0)).toBe(true);

  await indeterminate.evaluate((element: HTMLElement) => element.click());
  await expect(indeterminate).toHaveAttribute("aria-checked", "false");
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await page.clock.resume();
  await expect.poll(() => bar.getAttribute("aria-valuenow")).not.toBe("0");
  await expect.poll(numberedText).toMatch(/^[█░]{15} \d{1,3}% *$/);
});

test("Spinner switches Unicode sequences while retaining one Cell and an indeterminate name", async ({ page }) => {
  await page.goto("/#/components/spinner");
  const surface = page.locator('[data-cell-probe="component-spinner"]');
  const spinner = surface.getByRole("progressbar", { name: "Loading" });
  await expect(spinner).toBeAttached();
  await expect(spinner).not.toHaveAttribute("aria-valuenow");
  const glyph = async () => {
    const cells = (await readCellProbe(surface)).cells.filter((cell) => cell.ownerId === "component-spinner-indicator");
    expect(cells).toHaveLength(1);
    return cells[0]!.text;
  };
  await expect.poll(glyph).toMatch(/^[◐◓◑◒]$/u);
  const wheelGlyph = await glyph();
  await expect.poll(glyph).not.toBe(wheelGlyph);
  await surface.getByRole("button", { name: "variant" }).evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "dots" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(glyph).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/u);
  const dotsGlyph = await glyph();
  await expect.poll(glyph).not.toBe(dotsGlyph);
});

test("Spinner freezes on its first glyph with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/components/spinner");
  const surface = page.locator('[data-cell-probe="component-spinner"]');
  const glyph = async () => (await readCellProbe(surface)).cells
    .find((cell) => cell.ownerId === "component-spinner-indicator")?.text;
  await expect.poll(glyph).toBe("◐");
  await page.waitForTimeout(400);
  expect(await glyph()).toBe("◐");
});

test("Separator changes orientation through its Cell Select", async ({ page }) => {
  await page.goto("/#/components/separator");
  const surface = page.locator('[data-cell-probe="component-separator"]');
  await expect(surface.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
  await surface.getByRole("button", { name: "direction" }).evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "vertical" }).evaluate((element: HTMLElement) => element.click());
  await expect(surface.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
  expect((await readCellText(surface)).split("\n").filter((line) => line.includes("│")).length).toBeGreaterThanOrEqual(5);
});

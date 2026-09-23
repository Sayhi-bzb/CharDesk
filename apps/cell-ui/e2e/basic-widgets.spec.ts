import { expect, test, type Locator, type Page } from "@playwright/test";
import { readCellMetrics, readCellProbe, readCellText } from "./helpers/cell-probe";

async function clickCellOwner(page: Page, surface: Locator, id: string) {
  const canvas = surface.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const metrics = await readCellMetrics(surface);
  const frame = await readCellProbe(surface);
  const cell = frame.cells.find((cell) => cell.ownerId === id);
  expect(cell).toBeDefined();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + (cell!.x + 0.5) * metrics.cellWidth,
    bounds.y + (cell!.y + 0.5) * metrics.cellHeight);
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
  await page.getByRole("heading", { name: "Toggle", exact: true }).click();
  await expect(surface).not.toHaveAttribute("data-cell-activation-flash");
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  const idle = await readCellProbe(surface);
  expect(idle.text).toContain("● Bold");
  const toggleCells = idle.cells.filter((cell) => cell.ownerId === "component-toggle-bold");
  expect(toggleCells.every((cell) => cell.style.backgroundColor === undefined
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
  await page.getByRole("heading", { name: "Radio", exact: true }).click();
  await group.getByRole("radio", { name: "Dark", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(group.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  await page.keyboard.press("ArrowDown");
  await expect(group.getByRole("radio", { name: "Light", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(await readCellText(surface)).toContain("(●) Light");
  await page.keyboard.press("Tab");
  await expect(surface.getByRole("checkbox", { name: "disabled", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(group.getByRole("radio", { name: "Light", exact: true })).toBeFocused();
});

test("Progress loads continuously and switches to indeterminate animation", async ({ page }) => {
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
  const selectVariant = async (variant: "outline") => {
    await surface.getByRole("button", { name: "variant" })
      .evaluate((element: HTMLElement) => element.click());
    await surface.getByRole("option", { name: variant })
      .evaluate((element: HTMLElement) => element.click());
    await expect(surface).toHaveAttribute("data-cell-confirmation-phase", /[0-3]/);
    await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  };
  await expect.poll(async () => (await progressCells()).map((cell) => cell.text).join(""))
    .toMatch(/^[█░]{20}$/);
  await selectVariant("outline");
  await expect.poll(async () => {
    const cells = await progressCells();
    return cells.map((cell) => cell.text).join("");
  }).toMatch(/^\[[/-]{18}\]$/);
  const indeterminate = surface.getByRole("checkbox", { name: "indeterminate" });
  await expect(indeterminate).toHaveAttribute("aria-checked", "false");
  await indeterminate.evaluate((element: HTMLElement) => element.click());
  await expect(indeterminate).toHaveAttribute("aria-checked", "true");
  await expect(bar).not.toHaveAttribute("aria-valuenow");
  await expect(bar).not.toHaveAttribute("aria-valuemin");
  await expect(bar).not.toHaveAttribute("aria-valuemax");
  const thumbOffsets = async () => {
    const cells = (await readCellProbe(surface)).cells
      .filter((cell) => cell.ownerId === "component-progress-bar");
    const trackStart = Math.min(...cells.map((cell) => cell.x)) + 1;
    return cells.filter((cell) => cell.text === "/")
      .map((cell) => cell.x - trackStart)
      .sort((left, right) => left - right);
  };
  await expect.poll(async () => {
    const offsets = await thumbOffsets();
    return offsets.includes(0) && offsets.some((offset) => offset >= 14);
  }, { intervals: [40], timeout: 3_000 }).toBe(true);

  await indeterminate.evaluate((element: HTMLElement) => element.click());
  await expect(indeterminate).toHaveAttribute("aria-checked", "false");
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await expect.poll(() => bar.getAttribute("aria-valuenow")).not.toBe("0");
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

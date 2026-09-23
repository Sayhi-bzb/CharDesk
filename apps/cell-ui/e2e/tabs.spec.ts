import { expect, test } from "@playwright/test";
import { cellPoint, readCellProbe } from "./helpers/cell-probe";

test("Tabs switch one panel through pointer and keyboard without selecting a disabled tab", async ({ page }) => {
  await page.goto("/#/components/tabs");
  const surface = page.locator('[data-cell-probe="component-tabs"]');
  const code = surface.getByRole("tab", { name: "Code" });
  const preview = surface.getByRole("tab", { name: "Preview" });
  const settings = surface.getByRole("tab", { name: "Settings" });
  await expect(surface.getByRole("tablist", { name: "Views" })).toHaveAttribute("aria-orientation", "horizontal");
  await expect(code).toHaveAttribute("aria-selected", "true");
  await expect(settings).toHaveAttribute("aria-disabled", "true");
  await expect(surface.getByRole("tabpanel", { name: "Code" }))
    .toHaveAttribute("id", await code.getAttribute("aria-controls") ?? "");

  const previewCell = (await readCellProbe(surface)).cells.find((cell) =>
    cell.ownerId?.startsWith("component-tabs-preview/text") && cell.text === "P")!;
  const point = await cellPoint(surface, previewCell.x, previewCell.y);
  await page.mouse.click(point.x, point.y);
  await expect(preview).toHaveAttribute("aria-selected", "true");
  await expect(preview).toHaveAttribute("data-focused", "true");
  const switchedCells = (await readCellProbe(surface)).cells;
  expect(switchedCells.filter((cell) => cell.ownerId === "component-tabs-preview" && cell.text === " "))
    .toHaveLength(2);
  expect(switchedCells.find((cell) => cell.ownerId?.startsWith("component-tabs-preview/text"))?.style.backgroundColor)
    .toBeDefined();
  expect(switchedCells.find((cell) => cell.ownerId?.startsWith("component-tabs-code/text"))?.style.backgroundColor)
    .toBeUndefined();
  await expect(surface.getByRole("tabpanel", { name: "Preview" }))
    .toHaveAttribute("id", await preview.getAttribute("aria-controls") ?? "");
  await expect(surface.getByRole("tabpanel", { name: "Code" })).toHaveCount(0);

  await preview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(code).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(preview).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(code).toHaveAttribute("aria-selected", "true");
  await settings.evaluate((element: HTMLElement) => element.click());
  await expect(code).toHaveAttribute("aria-selected", "true");
  await expect(surface.getByRole("tabpanel")).toHaveCount(1);
  expect((await readCellProbe(surface)).text).not.toContain("│");
});

test("Tabs remain complete in light and dark themes and a narrow viewport", async ({ page }) => {
  await page.goto("/#/components/tabs");
  const surface = page.locator('[data-cell-probe="component-tabs"]');
  for (const scheme of ["light", "dark"] as const) {
    if (await page.locator(".gallery-page").getAttribute("data-gallery-theme") !== scheme) {
      await page.getByRole("button", { name: scheme === "dark" ? "Dark" : "Light" }).click();
    }
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", scheme);
    const frame = await readCellProbe(surface);
    expect(frame.text).toContain("Code");
    expect(frame.text).toContain("Preview");
    expect(frame.text).toContain("Settings");
    expect(frame.text).not.toContain("▬");
    const expected = await page.locator(".gallery-page").evaluate((element) => {
      const tokens = getComputedStyle(element);
      const probe = document.createElement("span");
      element.append(probe);
      const color = (name: string) => {
        probe.style.color = tokens.getPropertyValue(name).trim();
        return getComputedStyle(probe).color;
      };
      const colors = {
        selected: color("--cell-highlight"),
        selectedForeground: color("--cell-highlight-foreground"),
        inactive: color("--cell-foreground"),
        disabled: color("--cell-disabled-foreground"),
      };
      probe.remove();
      return colors;
    });
    const selectedGuards = frame.cells.filter((cell) =>
      cell.ownerId === "component-tabs-code" && cell.text === " ").sort((a, b) => a.x - b.x);
    expect(selectedGuards).toHaveLength(2);
    for (const guard of selectedGuards) {
      expect(guard.style).toMatchObject({
        color: expected.selectedForeground,
        backgroundColor: expected.selected,
      });
    }
    const previewLabel = frame.cells.find((cell) =>
      cell.ownerId?.startsWith("component-tabs-preview/text") && cell.text === "P")!;
    const disabledLabel = frame.cells.find((cell) =>
      cell.ownerId?.startsWith("component-tabs-settings/text") && cell.text === "S")!;
    expect(previewLabel.x - selectedGuards[1]!.x).toBe(4);
    expect(previewLabel.style.color).toBe(expected.inactive);
    expect(disabledLabel.style.color).toBe(expected.disabled);
  }

  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--cell-highlight", "rgb(12, 34, 56)");
    root.style.setProperty("--cell-highlight-foreground", "rgb(240, 241, 242)");
    root.style.setProperty("--cell-foreground", "rgb(210, 211, 212)");
    root.style.setProperty("--cell-muted-foreground", "rgb(90, 91, 92)");
    root.style.setProperty("--cell-disabled-foreground", "rgb(70, 71, 72)");
  });
  await page.getByRole("button", { name: "Light" }).click();
  await expect.poll(async () => {
    const cells = (await readCellProbe(surface)).cells;
    return {
      selected: cells.find((cell) => cell.ownerId === "component-tabs-code")?.style,
      inactive: cells.find((cell) => cell.ownerId?.startsWith("component-tabs-preview/text"))?.style.color,
      disabled: cells.find((cell) => cell.ownerId?.startsWith("component-tabs-settings/text"))?.style.color,
    };
  }).toMatchObject({
    selected: { color: "rgb(240, 241, 242)", backgroundColor: "rgb(12, 34, 56)" },
    inactive: "rgb(210, 211, 212)",
    disabled: "rgb(70, 71, 72)",
  });

  await page.setViewportSize({ width: 320, height: 640 });
  const frame = await readCellProbe(surface);
  for (const label of ["Code", "Preview", "Settings"]) {
    const cells = frame.cells.filter((cell) => cell.ownerId === `component-tabs-${label.toLowerCase()}`
      || cell.ownerId?.startsWith(`component-tabs-${label.toLowerCase()}/text`));
    expect(cells.map((cell) => cell.text).join("")).toContain(label);
    expect(Math.max(...cells.map((cell) => cell.x))).toBeLessThan(frame.viewport.width);
  }
  expect(frame.text).toContain('const greeting = "Hello";');
});

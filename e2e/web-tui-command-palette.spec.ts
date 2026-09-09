import { expect, test, type Locator, type Page } from "@playwright/test";

test("Palette text retains its surface background in both themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const surface = page.locator('[data-cell-probe="overlay"]');
  const canvas = surface.locator("canvas").first();
  for (const theme of ["light", "dark"] as const) {
    if (await page.locator(".gallery-page").getAttribute("data-gallery-theme") !== theme) {
      await page.getByRole("button", { name: theme === "light" ? "Light" : "Dark" }).click();
    }
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", theme);
    await page.evaluate((surfaceColor) => {
      document.documentElement.style.setProperty("--cell-surface", surfaceColor);
    }, theme === "light" ? "rgb(240, 240, 240)" : "rgb(35, 35, 35)");
    await page.getByRole("button", { name: theme === "light" ? "Dark" : "Light" }).click();
    await page.getByRole("button", { name: theme === "light" ? "Light" : "Dark" }).click();
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", theme);
    await surface.focus();
    const closed = await canvas.getAttribute("data-cell-text");
    await page.keyboard.press("Enter");
    await expect(surface.getByRole("dialog", { name: "Command palette" })).toHaveCount(1);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    const result = await surface.evaluate((element, scheme) => {
      const probe = (element as HTMLElement & {
        __chardeskCellProbeV4: { cells: { x: number; y: number; ownerId: string | null; style: { backgroundColor?: string } }[] };
      }).__chardeskCellProbeV4;
      const cells = probe.cells.filter((cell) => cell.ownerId === "palette-title" || cell.ownerId === "palette-hint");
      const target = element.querySelector<HTMLCanvasElement>(
        '[data-cell-overlay-root="command-palette"]'
      )!;
      const ctx = target.getContext("2d")!;
      const background = scheme === "light" ? "rgb(240, 240, 240)" : "rgb(35, 35, 35)";
      let holes = 0;
      for (const cell of cells) {
        const x = Math.round(cell.x * target.width / 36);
        const y = Math.round(cell.y * target.height / 12);
        const right = Math.round((cell.x + 1) * target.width / 36);
        const bottom = Math.round((cell.y + 1) * target.height / 12);
        const pixels = ctx.getImageData(x, y, right - x, bottom - y).data;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] === 0) holes++;
        }
      }
      return { count: cells.length, backgroundsMatch: cells.every((cell) => cell.style.backgroundColor === background), holes };
    }, theme);
    expect(result.count).toBeGreaterThan(0);
    expect(result.backgroundsMatch).toBe(true);
    expect(result.holes).toBe(0);
    const incremental = await canvas.evaluate((element) => element.toDataURL());
    await canvas.evaluate(async (element) => {
      element.style.width = `${element.getBoundingClientRect().width + 1}px`;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    expect(await canvas.evaluate((element) => element.toDataURL())).toBe(incremental);
    await page.keyboard.press("Escape");
    await expect(surface.getByRole("dialog")).toHaveCount(0);
    await expect(canvas).toHaveAttribute("data-cell-text", closed!);
  }
});

const clickCell = async (page: Page, canvas: Locator, x: number, y: number) => {
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Canvas is not visible.");
  await page.mouse.click(
    bounds.x + (x + 0.5) * bounds.width / 36,
    bounds.y + (y + 0.5) * bounds.height / 12,
  );
};

test("blank clicks and external blur cannot retain Palette pointer capture", async ({ page }) => {
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const surface = page.locator('[data-cell-probe="overlay"]');
  const canvas = surface.locator("canvas").first();
  const overlayCanvas = surface.locator('[data-cell-overlay-root="command-palette"]');
  const dialog = surface.getByRole("dialog", { name: "Command palette" });
  for (let cycle = 0; cycle < 3; cycle++) {
    await clickCell(page, canvas, 5, 0);
    await expect(dialog).toHaveCount(1);
    await clickCell(page, overlayCanvas, 34, 10);
    await expect(dialog).toHaveCount(0);
    await clickCell(page, canvas, 34, 10);
    await clickCell(page, canvas, 5, 0);
    await expect(dialog).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.locator("h1").click();
    await clickCell(page, canvas, 5, 0);
    await expect(dialog).toHaveCount(1);
    await page.keyboard.press("Escape");
  }
});

test("Command Palette owns its layer, focus scope, dismissal, and semantic actions", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/exp/web-tui/#/__fixtures/all");
  await page.waitForLoadState("networkidle");
  expect(pageErrors).toEqual([]);

  const section = page.locator("#overlay");
  const surface = section.getByLabel("Command palette workspace");
  const canvas = surface.locator("canvas").first();
  const overlayCanvas = surface.locator('[data-cell-overlay-root="command-palette"]');
  await surface.focus();
  await page.keyboard.press("Enter");

  const dialog = section.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(section.getByRole("menu", { name: "Commands" }))
    .toHaveAttribute("aria-activedescendant", "cell-semantic-open-file");
  await expect(surface).toHaveAttribute("data-cell-focused", "open-file");
  await expect(section.getByRole("menuitem", { name: "Open file" })).toBeFocused();
  await expect(canvas).toHaveAttribute("data-cell-text", /Commands/);

  await page.keyboard.press("ArrowDown");
  await expect(surface).toHaveAttribute("data-cell-focused", "new-file");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(surface).toHaveAttribute("data-cell-focused", "show-palette");
  await expect(section.getByRole("option", { name: "Open command palette" })).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(1);
  await clickCell(page, overlayCanvas, 7, 6);
  await expect(dialog).toHaveCount(0);

  await section.getByRole("option", { name: "Open command palette" }).dispatchEvent("click");
  await expect(dialog).toHaveCount(1);
  await section.getByRole("menuitem", { name: "Open file" }).dispatchEvent("click");
  await expect(dialog).toHaveCount(0);

  await section.getByRole("option", { name: "Open command palette" }).dispatchEvent("click");
  await expect(dialog).toHaveCount(1);
  await clickCell(page, overlayCanvas, 34, 10);
  await expect(dialog).toHaveCount(0);
  await expect(surface).toHaveAttribute("data-cell-focused", "show-palette");

  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(surface).toHaveAttribute("data-cell-focused", "show-palette");
});

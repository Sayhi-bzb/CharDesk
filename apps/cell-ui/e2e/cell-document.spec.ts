import { expect, test } from "@playwright/test";
import { cellPoint, readCellProbe, type BrowserCellProbe } from "./helpers/cell-probe";

test("Cell article keeps collapse, links, and responsive width", async ({ page }) => {
  await page.goto("/#/components/button");
  const article = page.locator('[data-cell-probe="article-button"]');
  await expect(article.getByRole("button", { name: "Show more" })).toBeVisible();
  await article.getByRole("button", { name: "Show more" }).evaluate((element: HTMLElement) => element.click());
  await expect(article.getByRole("button", { name: "Show less" })).toBeVisible();
  await expect(article.getByRole("link", { name: "Configure the registry" })).toHaveAttribute("href", "#/guides/installation?section=configure");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("narrow article tables and code reserve horizontal rails without phantom vertical rails", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/components/table");
  const article = page.locator('[data-cell-probe="article-table"]');
  await expect(article.getByRole("table").last()).toBeAttached();
  await expect.poll(async () => (await readCellProbe(article)).text).toContain("TableRow / TableCell");
  for (const id of ["article-table-2-api-table-scroll", "article-table-2-usage-scroll"]) {
    const ownedCells = (await readCellProbe(article)).cells.filter((cell) => cell.ownerId === id);
    const railRows = [...new Set(ownedCells.map((cell) => cell.y))]
      .filter((y) => ownedCells.filter((cell) => cell.y === y).length > 1);
    expect(railRows, id).toHaveLength(1);
  }
  await page.goto("/#/guides/installation?section=configure");
  const installation = page.locator('[data-cell-probe="installation-article"]');
  await expect(installation.getByRole("heading", { name: "Installation", level: 1 })).toBeAttached();
  const ownedInstallCells = (await readCellProbe(installation)).cells
    .filter((cell) => cell.ownerId === "installation-configure-code-scroll");
  const installRailRows = [...new Set(ownedInstallCells.map((cell) => cell.y))]
    .filter((y) => ownedInstallCells.filter((cell) => cell.y === y).length > 1);
  expect(installRailRows.length).toBeLessThanOrEqual(1);
});

test("code footer stays inside its surface and centered around the horizontal rail", async ({ page }) => {
  const centeredFooter = (frame: BrowserCellProbe) => {
    const toggle = frame.cells.filter((cell) => cell.ownerId === "article-combobox-2-usage-toggle");
    expect(toggle.length).toBeGreaterThan(0);
    const footer = frame.cells.filter((cell) => cell.y === toggle[0]!.y);
    expect(footer[0]?.ownerId).toContain("article-combobox-2-usage-footer/");
    expect(footer.at(-1)?.ownerId).toContain("article-combobox-2-usage-footer/");
    const surfaceCenter = (footer[0]!.x + footer.at(-1)!.x) / 2;
    const toggleCenter = (toggle[0]!.x + toggle.at(-1)!.x) / 2;
    expect(Math.abs(toggleCenter - surfaceCenter)).toBeLessThanOrEqual(1);
    return footer[0]!.y;
  };
  await page.goto("/#/components/combobox");
  const article = page.locator('[data-cell-probe="article-combobox"]');
  const snapshot = await readCellProbe(article);
  const codeLine = snapshot.text.split("\n").findIndex((line) => /20\s+viewport=\{\{/u.test(line));
  expect(codeLine).toBeGreaterThanOrEqual(0);
  const railCells = snapshot.cells.filter((cell) => cell.ownerId === "article-combobox-2-usage-scroll");
  const railRows = [...new Set(railCells.map((cell) => cell.y))]
    .filter((y) => railCells.filter((cell) => cell.y === y).length > 1);
  expect(railRows).toEqual([codeLine + 1]);
  const footerY = centeredFooter(snapshot);
  expect(footerY).toBe(railRows[0]! + 1);
  expect(snapshot.cells.find((cell) => cell.x === 0 && cell.y === footerY)?.style.backgroundColor)
    .toBe(snapshot.cells.find((cell) => cell.x === 0 && cell.y === codeLine)?.style.backgroundColor);

  await page.setViewportSize({ width: 390, height: 844 });
  centeredFooter(await readCellProbe(article));
  await article.getByRole("button", { name: "Show more" }).evaluate((element: HTMLElement) => element.click());
  await expect(article.getByRole("button", { name: "Show less" })).toBeVisible();
  centeredFooter(await readCellProbe(article));
});

test("Preview copy floats over the demo without changing its interactions", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { sessionStorage.setItem("preview-copy", value); } },
    });
  });
  for (const [route, probeId] of [
    ["/#/components/button", "component-button"],
    ["/#/guides/markdown", "markdown-example"],
  ] as const) {
    await page.goto(route);
    const article = page.locator(`[data-cell-probe="article-${route.split("/").at(-1)}"]`);
    const button = article.getByRole("button", { name: "Copy preview" });
    await expect(button).toBeVisible();
    const snapshot = await readCellProbe(article);
    const copyCell = snapshot.cells.find(({ ownerId }) => ownerId?.startsWith(`preview-copy-${probeId}`))!;
    expect(copyCell).toBeDefined();
    const preview = page.locator(`[data-cell-probe="${probeId}"]`);
    const [previewX, previewY] = (await preview.getAttribute("data-cell-probe-origin"))!.split(",").map(Number);
    expect(copyCell.x).toBeGreaterThan(previewX! + snapshot.viewport.width / 2);
    expect(copyCell.y).toBeLessThan(previewY! + 2);
    if (probeId === "component-button") {
      const point = await cellPoint(article, copyCell.x, copyCell.y);
      await page.mouse.click(point.x, point.y);
    } else {
      await button.focus();
      await page.keyboard.press("Enter");
    }
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("preview-copy")))
      .toContain(`cell-ui/probe@5  ${probeId}`);
  }
  const demo = page.locator('[data-cell-probe="markdown-example"]');
  await expect(demo.getByRole("link", { name: /Philosophy/u })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.locator(".gallery-header").getByRole("button", { name: "Dark" }).evaluate((element: HTMLElement) => element.click());
  const narrow = await readCellProbe(page.locator('[data-cell-probe="article-markdown"]'));
  expect(narrow.cells.find(({ ownerId }) => ownerId?.startsWith("preview-copy-markdown-example"))!.x)
    .toBeLessThan(narrow.viewport.width);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

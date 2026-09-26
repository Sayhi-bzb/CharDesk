import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("docs keep related controls together and one Cell row between sections", async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#/components/button");
    const article = page.locator('[data-cell-probe="article-button"]');
    const heading = article.getByRole("heading", { name: "Installation", level: 2 });
    const tabs = article.getByRole("tablist", { name: "Package manager" });
    const panel = article.getByRole("tabpanel", { name: "npm" });
    const [headingBounds, tabsBounds, panelBounds] = await Promise.all([
      heading.boundingBox(), tabs.boundingBox(), panel.boundingBox(),
    ]);
    expect(headingBounds).not.toBeNull();
    expect(tabsBounds).not.toBeNull();
    expect(panelBounds).not.toBeNull();
    expect(tabsBounds!.y - headingBounds!.y - headingBounds!.height).toBeLessThanOrEqual(1);
    expect(panelBounds!.y - tabsBounds!.y - tabsBounds!.height).toBeLessThanOrEqual(1);
    await expect(page.locator(".docs-page")).toHaveCSS("row-gap", "20px");

    const lines = (await readCellProbe(article)).text.split("\n");
    const usage = lines.findIndex((line) => line.includes("## Usage"));
    expect(usage).toBeGreaterThan(0);
    expect(lines[usage - 1]?.trim()).toBe("");
    expect(lines[usage - 2]?.trim()).not.toBe("");

    await page.goto("/#/guides/installation");
    const guide = page.locator('[data-cell-probe="installation-article"]');
    const guideLines = (await readCellProbe(guide)).text.split("\n");
    const configure = guideLines.findIndex((line) => line.includes("## Configure"));
    expect(configure).toBeGreaterThan(0);
    expect(guideLines[configure - 1]?.trim()).toBe("");
    expect(guideLines[configure - 2]?.trim()).not.toBe("");
    await expect(page.locator(".docs-page")).toHaveCSS("row-gap", "20px");
  }
});

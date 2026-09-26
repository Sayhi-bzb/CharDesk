import { expect, test } from "@playwright/test";
import { cellPoint, readCellProbe } from "./helpers/cell-probe";

test("Cell TSX examples keep highlighted source and exact copy across themes", async ({ page, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { sessionStorage.setItem("copied-code", value); } },
    });
  });
  await page.goto("/#/components/button");
  const article = page.locator('[data-cell-probe="article-button-2"]');
  const light = await readCellProbe(article);
  const usageRow = light.text.split("\n").findIndex((line) => line.includes('import { useState }'));
  expect(usageRow).toBeGreaterThan(0);
  expect(light.text).toContain("npx shadcn@latest add @chardesk/cell-ui");
  expect(light.cells.some(({ ownerId }) => ownerId?.includes("installation-command-numbers"))).toBe(false);
  const number = light.cells.find(({ ownerId, text }) => ownerId?.includes("usage-numbers") && text === "1");
  const code = light.cells.find(({ y, text }) => y === usageRow && text === "i");
  expect(number?.style.backgroundColor).toBeDefined();
  expect(number?.style.backgroundColor).toBe(code?.style.backgroundColor);
  expect(light.cells.some(({ y, style }) => y === usageRow && style.color === "#555555")).toBe(true);
  await article.getByRole("button", { name: "Copy code" }).last().evaluate((element: HTMLElement) => element.click());
  const copied = await page.evaluate(() => sessionStorage.getItem("copied-code"));
  expect(copied).toContain('import { useState } from "react";');
  expect(copied).toContain("</CellSurface>");
  const published = await request.get("/components/button.md");
  expect(await published.text()).toContain(copied!);
  await page.getByRole("button", { name: "Dark" }).evaluate((element: HTMLElement) => element.click());
  const dark = await readCellProbe(article);
  expect(dark.text).toContain('import { useState }');
  expect(dark.cells.some(({ y, style }) => y === usageRow && style.color === "#aaaaaa")).toBe(true);
  const darkNumber = dark.cells.find(({ ownerId, text }) => ownerId?.includes("usage-numbers") && text === "1");
  const darkCode = dark.cells.find(({ y, text }) => y === usageRow && text === "i");
  expect(darkNumber?.style.backgroundColor).toBe(darkCode?.style.backgroundColor);
});

test("long Cell examples fold to 20 lines, but copy preserves full source", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { sessionStorage.setItem("copied-code", value); } },
    });
  });
  await page.goto("/#/components/button");
  const article = page.locator('[data-cell-probe="article-button-2"]');
  const collapsed = await readCellProbe(article);
  expect(collapsed.text).toContain("Show more");
  expect(collapsed.text).not.toContain("</CellSurface>");
  await article.getByRole("button", { name: "Copy code" }).last().evaluate((element: HTMLElement) => element.click());
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("copied-code"))).toContain("</CellSurface>");
  await article.getByRole("button", { name: "Show more" }).evaluate((element: HTMLElement) => element.click());
  expect((await readCellProbe(article)).text).toContain("</CellSurface>");
  await article.getByRole("button", { name: "Show less" }).focus();
  await page.keyboard.press("Enter");
  await expect(article.getByRole("button", { name: "Show more" })).toBeVisible();
  await page.goto("/#/components/badge");
  await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
});

test("Cell line-number gutter stays fixed while narrow code scrolls horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/components/select");
  const article = page.locator('[data-cell-probe="article-select-2"]');
  const before = await readCellProbe(article);
  const codeRow = before.text.split("\n").findIndex((line) => line.includes("import"));
  const gutter = before.cells.find(({ x, y, text }) => x < 4 && y === codeRow && text === "1");
  expect(gutter).toBeDefined();
  await page.locator("#usage").scrollIntoViewIfNeeded();
  const point = await cellPoint(article, 15, codeRow);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(160, 0);
  await expect.poll(async () => (await readCellProbe(article)).text).not.toBe(before.text);
  const after = await readCellProbe(article);
  expect(after.cells.find(({ x, y }) => x === gutter!.x && y === gutter!.y)?.text).toBe("1");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

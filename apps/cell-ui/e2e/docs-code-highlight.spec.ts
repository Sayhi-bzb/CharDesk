import { expect, test } from "@playwright/test";
import { readCellProbe, type BrowserCellProbe } from "./helpers/cell-probe";

const asRgb = (hex: string) => `rgb(${hex.slice(1).match(/../gu)!
  .map((part) => Number.parseInt(part, 16)).join(", ")})`;

const colorAt = (snapshot: BrowserCellProbe, text: string, offset = 0) => {
  const lines = snapshot.text.split("\n");
  const y = lines.findIndex((line) => line.includes(text));
  if (y < 0) throw new Error(`Missing code text: ${text}`);
  const x = lines[y]!.indexOf(text) + offset;
  return snapshot.cells.find((cell) => cell.x === x && cell.y === y)?.style.color;
};

test("docs code blocks share Markdown syntax colors in light and dark themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#/guides/installation");
    const themeButton = page.locator(".gallery-header");
    if (await themeButton.getByRole("button", { name: "Light" }).count()) {
      await themeButton.getByRole("button", { name: "Light" })
        .evaluate((element: HTMLElement) => element.click());
    }
    await expect(themeButton.getByRole("button", { name: "Dark" })).toBeVisible();
    const installation = page.locator('[data-cell-probe="installation-article"]');
    await expect.poll(async () => colorAt(await readCellProbe(installation), '"@chardesk"', 1))
      .toBe(asRgb("#0550ae"));
    const lightInstallation = await readCellProbe(installation);
    expect(colorAt(lightInstallation, '"@/lib"', 1)).toBe(asRgb("#116329"));
    expect(colorAt(lightInstallation, "npx shadcn@latest", 0)).toBe(asRgb("#8250df"));

    await page.goto("/#/components/button");
    const usage = page.locator('[data-cell-probe="article-button"]');
    const lightUsage = await readCellProbe(usage);
    expect(colorAt(lightUsage, "import ", 0)).toBe(asRgb("#0550ae"));
    expect(colorAt(lightUsage, "npx shadcn@latest", 0)).toBe(asRgb("#8250df"));
    if (width > 720) expect(colorAt(lightUsage, "@/lib", 0)).toBe(asRgb("#116329"));
    await usage.getByRole("tab", { name: "pnpm", exact: true })
      .evaluate((element: HTMLElement) => element.click());
    await expect.poll(async () => colorAt(await readCellProbe(usage), "pnpm dlx shadcn@latest", 0))
      .toBe(asRgb("#8250df"));
    await usage.getByRole("tab", { name: "npm", exact: true })
      .evaluate((element: HTMLElement) => element.click());

    await themeButton.getByRole("button", { name: "Dark" }).focus();
    await page.keyboard.press("Enter");
    await expect(themeButton.getByRole("button", { name: "Light" })).toBeVisible();
    await expect.poll(async () => colorAt(await readCellProbe(usage), "import ", 0))
      .toBe(asRgb("#79c0ff"));
    const darkUsage = await readCellProbe(usage);
    expect(colorAt(darkUsage, "import ", 0)).toBe(asRgb("#79c0ff"));
    expect(colorAt(darkUsage, "npx shadcn@latest", 0)).toBe(asRgb("#d2a8ff"));
    if (width > 720) expect(colorAt(darkUsage, "@/lib", 0)).toBe(asRgb("#7ee787"));
    await page.goto("/#/guides/installation");
    const darkInstallation = await readCellProbe(page.locator('[data-cell-probe="installation-article"]'));
    expect(colorAt(darkInstallation, "npx shadcn@latest", 0)).toBe(asRgb("#d2a8ff"));

    await page.goto("/#/guides/markdown");
    const preview = page.locator('[data-cell-probe="markdown-example"]');
    const markdown = await readCellProbe(preview);
    expect(colorAt(markdown, "const ready", 0)).toBe(asRgb("#79c0ff"));

    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
});

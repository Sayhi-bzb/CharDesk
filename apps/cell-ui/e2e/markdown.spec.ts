import { expect, test } from "@playwright/test";
import { cellPoint, copyCellRange, readCellProbe } from "./helpers/cell-probe";

test("shared tone CSS tokens reach both Markdown and Badge through the Gallery theme", async ({ page }) => {
  await page.goto("/#/guides/markdown");
  await page.addStyleTag({ content: `.gallery-page {
    --cell-tone-info: #123456 !important;
    --cell-tone-info-surface: #ddeeff !important;
    --cell-tone-info-surface-foreground: #234567 !important;
  }` });
  await page.locator(".gallery-header").getByRole("button", { name: "Dark" }).evaluate((element: HTMLElement) => element.click());
  const markdown = page.getByLabel("Markdown example");
  await expect.poll(async () => (await readCellProbe(markdown)).cells
    .find((cell) => cell.ownerId?.includes("markdown-link"))?.style.color).toBe("rgb(18, 52, 86)");

  await page.evaluate(() => { window.location.hash = "#/components/badge"; });
  const badge = page.locator('[data-cell-probe="component-badge"]');
  await expect(badge).toBeVisible();
  await expect.poll(async () => (await readCellProbe(badge)).cells
    .find((cell) => cell.ownerId === "component-badge-info")?.style).toMatchObject({
    color: "rgb(35, 69, 103)", backgroundColor: "rgb(221, 238, 255)",
  });
});

test("Markdown guide renders Cell typography and activates a link through the shared input path", async ({ page, request }) => {
  await page.goto("/#/guides/markdown");
  await expect(page.getByRole("heading", { name: "Markdown", level: 1 })).toBeVisible();
  const article = page.locator('.cell-article-page [data-cell-probe^="article-markdown-"]');
  await expect(article.getByRole("heading", { level: 2 }))
    .toHaveText(["Preview", "Installation", "Usage", "View source", "API"]);
  await expect(page.getByRole("navigation", { name: "On This Page" }).getByRole("link"))
    .toHaveText(["Preview", "Installation", "Usage", "View source", "API"]);
  expect((await readCellProbe(article.last())).text).toContain("shadcn@latest add @chardesk/cell-ui");
  expect((await readCellProbe(article.last())).text).toContain("<Markdown source={source} />");
  await expect(article.getByRole("table")).toContainText("source");
  const surface = page.getByLabel("Markdown example");
  await expect(surface.getByRole("heading", { name: "Field Notes", level: 1 })).toBeVisible();
  await expect(surface.getByRole("heading", { name: "Checklist", level: 2 })).toBeVisible();
  const probe = await readCellProbe(surface);
  expect(probe.viewport).toEqual({ width: 44, height: 28 });
  expect(probe.text).not.toContain("Follow a link to inspect its command.");
  expect(probe.text).toContain("# Field Notes");
  expect(probe.text).toContain("## Checklist");
  expect(probe.text).toContain("☑ Build UI");
  expect(probe.text).toContain("structure");
  expect(probe.text).toContain("inline code");
  expect(probe.text).not.toContain("**structure**");
  expect(probe.text).toContain("1. Write Markdown");
  expect(probe.text).toContain("│ Source stays yours.");
  expect(probe.text).toContain("/////");
  expect(probe.text).toContain("Read Philosophy.");
  expect(probe.cells.some((cell) => cell.style.bold && cell.text === "s")).toBe(true);
  expect(probe.cells.some((cell) => cell.style.italic)).toBe(true);
  const inlineCodeRow = probe.text.split("\n").findIndex((line) => line.includes("inline code"));
  const inlineCodeX = probe.text.split("\n")[inlineCodeRow]!.indexOf("inline code");
  expect(probe.cells.find((cell) => cell.x === inlineCodeX && cell.y === inlineCodeRow)?.style.backgroundColor)
    .toBe("rgb(246, 248, 250)");
  expect(probe.cells.find((cell) => cell.x === 0 && cell.y === 0)?.style.color)
    .toBe("rgb(9, 105, 218)");
  const link = surface.getByRole("link", { name: /Philosophy/u });
  await expect(link).toHaveAttribute("data-href", "#/guides/philosophy");
  await expect(link).toHaveAttribute("href", "#/guides/philosophy");

  const linkCell = [...probe.cells].find((cell) => cell.ownerId?.includes("markdown-link"));
  expect(linkCell).toBeDefined();
  await surface.locator("canvas").first().scrollIntoViewIfNeeded();
  const point = await cellPoint(surface, linkCell!.x, linkCell!.y);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML, point)).toContain("canvas");
  await page.mouse.move(point.x, point.y);
  await expect(surface.locator("canvas").first()).toHaveCSS("cursor", "pointer");
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Opened 1: #/guides/philosophy");

  await link.focus();
  await page.keyboard.press("Enter");
  await expect(link).toBeFocused();
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Opened 2: #/guides/philosophy");
  await link.evaluate((element: HTMLElement) => element.click());
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Opened 3: #/guides/philosophy");
  await expect(page).toHaveURL(/#\/guides\/markdown$/u);
  await page.locator(".gallery-header").getByRole("button", { name: "Dark" }).evaluate((element: HTMLElement) => element.click());
  expect((await readCellProbe(surface)).text).toContain("Philosophy");
  const darkProbe = await readCellProbe(surface);
  expect(darkProbe.cells.find((cell) => cell.x === inlineCodeX && cell.y === inlineCodeRow)?.style.backgroundColor)
    .toBe("rgb(22, 27, 34)");
  const selectionStart = await cellPoint(surface, 0, 0);
  const selectionEnd = await cellPoint(surface, 25, linkCell!.y);
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(selectionStart.x, selectionStart.y);
  await page.mouse.down();
  await page.mouse.move(selectionEnd.x, selectionEnd.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  const copied = await copyCellRange(surface);
  expect(copied).toContain("# Field Notes");
  expect(copied).toContain("Philosophy");
  expect(copied).not.toContain("[Philosophy]");
  const installationLink = surface.getByRole("link", { name: /Installation/u });
  await installationLink.focus();
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Installation");
  await link.focus();
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Philosophy");
  const scrollPoint = await cellPoint(surface, 10, 10);
  await page.mouse.move(scrollPoint.x, scrollPoint.y);
  const scrollTo = async (content: string) => {
    for (let index = 0; index < 40; index++) {
      const before = (await readCellProbe(surface)).text;
      if (before.includes(content)) return;
      await page.mouse.wheel(0, 120);
      await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(before);
    }
    expect((await readCellProbe(surface)).text).toContain(content);
  };
  await scrollTo("│ Source stays yours.");
  await scrollTo("const ready = true;");
  await scrollTo("Element │ Cell output");
  await scrollTo("┼");
  await scrollTo("Link");
  await scrollTo("Old wording");
  const strikeProbe = await readCellProbe(surface);
  const strikeRow = strikeProbe.text.split("\n").findIndex((line) => line.includes("Old wording"));
  expect(strikeProbe.cells.find((cell) => cell.x === 0 && cell.y === strikeRow)?.style.strike).toBe(true);
  await scrollTo("[Image: Flow diagram]");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const markdown = await request.get("/guides/markdown.md");
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).toContain("## Installation\n");
  expect(await markdown.text()).toContain("## API\n");
  expect(await markdown.text()).toContain("## Preview source\n");
  expect(await markdown.text()).toContain("# Field Notes");
});

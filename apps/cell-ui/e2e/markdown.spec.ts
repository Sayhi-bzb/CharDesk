import { expect, test } from "@playwright/test";
import { cellPoint, copyCellRange, readCellProbe } from "./helpers/cell-probe";

test("Markdown guide renders Cell typography and activates a link through the shared input path", async ({ page, request }) => {
  await page.goto("/#/guides/markdown");
  await expect(page.getByRole("heading", { name: "Markdown", level: 1 })).toBeVisible();
  await expect(page.locator("main.docs-page > section.docs-section > h2, main.docs-page > section.docs-section > .docs-section__heading > h2"))
    .toHaveText(["Preview", "Installation", "Usage", "View source", "API"]);
  await expect(page.getByRole("navigation", { name: "On This Page" }).getByRole("link"))
    .toHaveText(["Preview", "Installation", "Usage", "View source", "API"]);
  await expect(page.getByRole("tabpanel", { name: "npm installation command" })).toContainText("shadcn@latest add @chardesk/cell-ui");
  await expect(page.locator("#usage + .docs-code")).toContainText("<Markdown source={source} />");
  await expect(page.locator("#api ~ .docs-table-wrap")).toContainText("source");
  const surface = page.getByLabel("Markdown example");
  const probe = await readCellProbe(surface);
  expect(probe.viewport).toEqual({ width: 44, height: 28 });
  expect(probe.text).not.toContain("Follow a link to inspect its command.");
  expect(probe.text).toContain("# Field Notes");
  expect(probe.text).toContain("[x] Build UI");
  expect(probe.text).toContain("`inline code`");
  expect(probe.text).toContain("1. Write Markdown");
  expect(probe.text).toContain("│ Source stays yours.");
  expect(probe.text).toContain("Philosophy ↗");
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
  await page.locator(".gallery-header").getByRole("button", { name: "Dark" }).click();
  expect((await readCellProbe(surface)).text).toContain("Philosophy ↗");
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
  expect(copied).not.toContain("[Philosophy](");
  const installationLink = surface.getByRole("link", { name: /Installation/u });
  await installationLink.focus();
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Installation ↗");
  await link.focus();
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("Philosophy ↗");
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
  await scrollTo("```ts");
  await scrollTo("│ Element");
  await scrollTo("[image: Flow diagram]");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const markdown = await request.get("/guides/markdown.md");
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).toContain("## Installation\n");
  expect(await markdown.text()).toContain("## API\n");
  expect(await markdown.text()).not.toContain("## Preview\n");
});

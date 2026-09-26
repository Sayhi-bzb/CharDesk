import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";
import { selectGalleryFont } from "./helpers/gallery-font-select";
import { xiaolaiFontRequest, xiaolaiStylesheetRequest } from "./helpers/xiaolai";

test("Xiaolai requests only the shards needed by rendered graphemes", async ({ page }) => {
  const shards: string[] = [];
  page.on("request", (request) => {
    const match = new URL(request.url()).pathname.match(xiaolaiFontRequest);
    if (match?.[1]) shards.push(match[1]);
  });

  await page.goto("/#/components/button");
  await selectGalleryFont(page, "xiaolai-mono");
  await expect(page.locator(".gallery-page")).toHaveAttribute(
    "data-gallery-font", "xiaolai-mono"
  );
  await expect.poll(() => shards).toContain("base.woff2");
  expect(shards.every((shard) => ["base.woff2", "supplementary.woff2"].includes(shard))).toBe(true);

  await page.evaluate(() => { window.location.hash = "/__fixtures/text"; });
  await expect(page.locator('[data-cell-probe="component-text"]')).toBeVisible();
  await expect.poll(() => shards).toContain("cjk-unified.woff2");
  expect(shards.every((shard) => ["base.woff2", "cjk-unified.woff2", "supplementary.woff2"].includes(shard))).toBe(true);
  await page.evaluate(() => {
    const sample = document.createElement("span");
    sample.textContent = "\u{1fb95}";
    document.querySelector("main")!.append(sample);
  });
  expect(shards.every((shard) => ["base.woff2", "cjk-unified.woff2", "supplementary.woff2"].includes(shard))).toBe(true);
});

test("local font failure and delayed retry preserve the active font and editing", async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(xiaolaiStylesheetRequest, async (route) => {
    requests += 1;
    if (requests === 1) return route.abort();
    await gate;
    await route.continue();
  });
  await page.goto("/#/__fixtures/editor");
  const gallery = page.locator(".gallery-page");
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  expect(requests).toBe(0);
  const input = page.getByRole("textbox", { name: "File name", exact: true });
  await input.fill("hello世界.txt");
  await input.press("Shift+ArrowLeft");
  const selection = await input.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd]);
  const surface = page.locator('[data-cell-probe="editor"]');
  const before = await readCellProbe(surface);
  await selectGalleryFont(page, "xiaolai-mono");
  await expect(gallery).toHaveAttribute("data-gallery-font-status", "error");
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  await selectGalleryFont(page, "xiaolai-mono");
  await expect(gallery).toHaveAttribute("data-gallery-font-status", "loading");
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  release();
  await expect(gallery).toHaveAttribute("data-gallery-font", "xiaolai-mono");
  await expect(gallery).toHaveAttribute("data-gallery-font-status", "idle");
  await expect(input).toHaveValue("hello世界.txt");
  expect(await input.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd])).toEqual(selection);
  const after = await readCellProbe(surface);
  expect(after.text).toBe(before.text);
  expect(after.viewport).toEqual(before.viewport);
  await selectGalleryFont(page, "maple");
  await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
});

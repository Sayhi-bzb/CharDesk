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
  await selectGalleryFont(page, "Xiaolai Mono");
  await expect(page.locator(".gallery-page")).toHaveAttribute(
    "data-gallery-font", "xiaolai-mono"
  );
  await expect.poll(() => [...new Set(shards)]).toEqual(["base.woff2"]);

  await page.getByRole("link", { name: "Text", exact: true }).click();
  await expect(page.getByText("Render text, Unicode, and Cell-native wrapping."))
    .toBeVisible();
  await expect.poll(() => [...new Set(shards)].sort()).toEqual([
    "base.woff2", "cjk-unified.woff2", "supplementary.woff2",
  ]);
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
  await page.goto("/#/__fixtures/all");
  await selectGalleryFont(page, "Fusion Pixel 12px Mono");
  const gallery = page.locator(".gallery-page");
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  expect(requests).toBe(0);
  const input = page.getByRole("textbox", { name: "File name", exact: true });
  await input.fill("hello世界.txt");
  await input.press("Shift+ArrowLeft");
  const selection = await input.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd]);
  const surface = page.locator('[data-cell-probe="editor"]');
  const before = await readCellProbe(surface);
  await selectGalleryFont(page, "Xiaolai Mono");
  await expect(gallery).toHaveAttribute("data-gallery-font-status", "error");
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  await selectGalleryFont(page, "Xiaolai Mono");
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
  await selectGalleryFont(page, "Maple Mono");
  await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
});

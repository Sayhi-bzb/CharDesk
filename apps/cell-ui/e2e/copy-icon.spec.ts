import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";
import { selectGalleryFont } from "./helpers/gallery-font-select";

test("docs copy controls use the Nerd Font icon across fonts", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { sessionStorage.setItem("copied-preview", value); } },
    });
  });
  await page.goto("/#/components/button");
  const article = page.locator('[data-cell-probe="article-button"]');
  const previewCopy = article.getByRole("button", { name: "Copy preview" });
  await expect(previewCopy).toBeVisible();
  for (const font of ["fusion-mono", "xiaolai-mono"] as const) {
    if (font !== "fusion-mono") await selectGalleryFont(page, font);
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-font", font);
    await expect.poll(async () => (await readCellProbe(article)).text).toContain("󰆏");
  }
  await previewCopy.evaluate((element: HTMLElement) => element.click());
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("copied-preview")))
    .toContain("cell-ui/probe@5  component-button");
});

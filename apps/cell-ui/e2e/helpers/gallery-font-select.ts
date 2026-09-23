import type { Page } from "@playwright/test";
import type { GalleryFont } from "../../src/font-options";

export const galleryFontSelect = (page: Page) =>
  page.locator('[data-cell-probe="gallery-font-select"]');

export const selectGalleryFont = async (page: Page, font: GalleryFont) => {
  const select = galleryFontSelect(page);
  await select.getByRole("button").evaluate((element: HTMLElement) => element.click());
  const options = select.getByRole("listbox", { name: "Fonts" });
  await options.locator(`[data-cell-semantic-id="gallery-font-option-${font}"]`)
    .evaluate((element: HTMLElement) => element.click());
  await options.waitFor({ state: "detached" });
};

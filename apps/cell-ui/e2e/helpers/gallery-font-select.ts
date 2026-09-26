import { expect, type Page } from "@playwright/test";
import type { GalleryFont } from "../../src/font-options";

export const galleryFontSelect = (page: Page) =>
  page.locator('[data-cell-probe="gallery-header"]');

export const selectGalleryFont = async (page: Page, font: GalleryFont) => {
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-font-status", /^(idle|error)$/);
  const select = galleryFontSelect(page);
  await select.locator('[data-cell-semantic-id="gallery-font-trigger"]').evaluate((element: HTMLElement) => element.click());
  const options = select.getByRole("listbox", { name: "Fonts" });
  await options.locator(`[data-cell-semantic-id="gallery-font-option-${font}"]`)
    .evaluate((element: HTMLElement) => element.click());
  await options.waitFor({ state: "detached" });
};

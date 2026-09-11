import type { Page } from "@playwright/test";

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const galleryFontSelect = (page: Page) =>
  page.locator('[data-cell-probe="gallery-font-select"]');

export const selectGalleryFont = async (page: Page, label: string) => {
  const select = galleryFontSelect(page);
  await select.getByRole("button").evaluate((element: HTMLElement) => element.click());
  const options = select.getByRole("listbox", { name: "Fonts" });
  await options.getByRole("option", { name: new RegExp(`^${escapePattern(label)}`) })
    .evaluate((element: HTMLElement) => element.click());
  await options.waitFor({ state: "detached" });
};

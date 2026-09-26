import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Input validation stays legible and accessible in both themes", async ({ page }) => {
  await page.goto("/#/components/input");
  const surface = page.locator('[data-cell-probe="component-input"]');
  const input = page.getByRole("textbox", { name: "File name" });
  const toggle = surface.getByRole("checkbox", { name: "invalid" });
  await expect(input).not.toHaveAttribute("aria-invalid");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await toggle.evaluate((element: HTMLElement) => element.click());
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAttribute("aria-describedby", "cell-semantic-component-input-frame-error");
    await expect(surface.getByRole("alert")).toHaveText("! File name is required");
    const probe = await readCellProbe(surface);
    expect(probe.text).toContain("! File name is required");
    await toggle.evaluate((element: HTMLElement) => element.click());
    await expect(input).not.toHaveAttribute("aria-invalid");
    await expect(surface.getByRole("alert")).toHaveCount(0);
  }
});

test("Button danger tone preserves its action and variant", async ({ page }) => {
  await page.goto("/#/components/button");
  const surface = page.locator('[data-cell-probe="component-button"]');
  const button = surface.getByRole("button", { name: "Save document" });
  await surface.getByRole("checkbox", { name: "danger" })
    .evaluate((element: HTMLElement) => element.click());
  const expected = await page.evaluate(() => getComputedStyle(document.documentElement)
    .getPropertyValue("--cell-tone-danger").trim());
  const rgb = `rgb(${[1, 3, 5].map((offset) => parseInt(expected.slice(offset, offset + 2), 16)).join(", ")})`;
  const probe = await readCellProbe(surface);
  expect(probe.cells.find((cell) => cell.ownerId === "component-button-save" && cell.text === " ")
    ?.style.backgroundColor).toBe(rgb);
  await expect(button).toBeEnabled();
});

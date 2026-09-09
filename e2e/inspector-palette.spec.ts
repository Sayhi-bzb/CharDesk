import { expect, test } from "@playwright/test"

test("Inspector consumes the dark preset palette without remapping ANSI colors", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("chardesk-host-theme", "dark")
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/")

  await expect(page.locator("html")).toHaveClass(/dark/)
  const inspector = page.getByTestId("canvas-inspector-panel")
  await expect(inspector).toBeVisible()
  await inspector.getByRole("tab", { name: "Presets" }).click()

  const darkPreset = inspector.getByRole("button", {
    name: "Pick preset color #fca5a5",
  })
  await expect(darkPreset).toBeVisible()
  await expect(
    inspector.getByRole("button", { name: "Pick preset color #7f1d1d" })
  ).toHaveCount(0)
  await expect(darkPreset.locator('[data-slot="color-swatch"]')).toHaveCSS(
    "border-top-color",
    /0\.2/
  )

  await inspector.getByRole("tab", { name: "ANSI 16" }).click()
  const ansiSwatches = inspector.locator(
    '[data-testid="color-palette-grid"] [data-slot="swatch-button"]'
  )
  await expect(ansiSwatches.nth(0)).toHaveAttribute(
    "aria-label",
    "Pick ANSI color #000000"
  )
  await expect(ansiSwatches.nth(8)).toHaveAttribute(
    "aria-label",
    "Pick ANSI color #808080"
  )
  await expect(
    inspector.getByRole("button", { name: "Pick ANSI color #000000" })
  ).toBeVisible()
  await expect(
    inspector.getByRole("button", { name: "Pick ANSI color #ffffff" })
  ).toBeVisible()
})

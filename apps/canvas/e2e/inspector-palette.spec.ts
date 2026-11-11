import { expect, test } from "@playwright/test"

for (const theme of ["light", "dark"] as const) {
  for (const [hasSelection, html] of [[false, false], [true, false], [false, true], [true, true]] as const) {
    test(`${html ? "HTML" : "Markdown"} paste keeps its accent after picking black (${theme}, selection=${hasSelection})`, async ({ page }) => {
      await page.addInitScript((theme) => {
        localStorage.setItem("chardesk-host-theme", theme)
      }, theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto("/")
      await expect(page.getByTestId("canvas-editor-surface")).toBeVisible()
      await page.evaluate(async (hasSelection) => {
        const { getApplicationEditorHost } = await import("../src/app/compositionRoot.ts")
        const host = getApplicationEditorHost()
        await host.canvas.ready
        host.canvas.commands.grid.replace([])
        host.canvas.commands.staticGrid.enterTextEdit({ x: 0, y: 0 })
        if (hasSelection) {
          const clipboardData = new DataTransfer()
          clipboardData.setData("text/plain", "**old**")
          await host.canvas.commands.selection.paste({ eventDataTransfer: clipboardData })
        }
      }, hasSelection)

      await page.getByTestId("canvas-inspector-panel")
        .getByRole("button", { name: "Pick ANSI color #000000", exact: true }).click()

      const input = page.getByRole("textbox")
      await input.focus()
      await input.evaluate((element, html) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData("text/plain", html ? "bold" : "**bold**")
        if (html) clipboardData.setData("text/html", '<p><strong style="color: black">bold</strong></p>')
        element.dispatchEvent(new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData,
        }))
      }, html)

      await expect.poll(() => page.evaluate(async () => {
        const { getApplicationEditorHost } = await import("../src/app/compositionRoot.ts")
        return [...getApplicationEditorHost().canvas.getState().contentSurface.reader.materialize().values()]
      })).toEqual([..."bold"].map((char) => ({
        char,
        color: theme === "light" ? "#0969da" : "#58a6ff",
        attrs: { bold: true },
      })))
    })
  }
}

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

  const presetSwatches = inspector.locator(
    '[data-testid="color-palette-grid"] [data-slot="swatch-button"]'
  )
  await expect(presetSwatches).toHaveCount(40)
  await expect(presetSwatches.first()).toHaveAttribute(
    "aria-label",
    "Pick preset color #000000"
  )
  await expect(presetSwatches.last()).toHaveAttribute(
    "aria-label",
    "Pick preset color #ffffff"
  )
  const darkPreset = inspector.getByRole("button", {
    name: "Pick preset color #450a0a",
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

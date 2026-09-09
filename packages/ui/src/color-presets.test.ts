import { describe, expect, it } from "vitest"

import { resolveColorPickerPalettes } from "./color-presets.js"

describe("resolveColorPickerPalettes", () => {
  it("publishes stable light and dark grids without changing ANSI values", () => {
    const light = resolveColorPickerPalettes("light")
    const dark = resolveColorPickerPalettes("dark")

    expect(light.presets).toHaveLength(40)
    expect(dark.presets).toHaveLength(40)
    expect(light.presets[0]).toBe("#7f1d1d")
    expect(dark.presets[0]).toBe("#fca5a5")
    expect(dark.presets).not.toEqual(light.presets)

    expect(dark.ansi16).toEqual(light.ansi16)
    expect(light.ansi16[0]).toBe("#000000")
    expect(dark.ansi16[0]).toBe("#000000")
  })
})

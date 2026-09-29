import { describe, expect, it } from "vitest"

import { resolveColorPickerPalettes } from "./color-presets.js"

describe("resolveColorPickerPalettes", () => {
  it("keeps both 40-color preset grids ordered from black to white without changing ANSI values", () => {
    const light = resolveColorPickerPalettes("light")
    const dark = resolveColorPickerPalettes("dark")

    expect(light.presets).toHaveLength(40)
    expect(dark.presets).toHaveLength(40)
    expect(light.presets[0]).toBe("#000000")
    expect(dark.presets[0]).toBe("#000000")
    expect(light.presets.at(-1)).toBe("#ffffff")
    expect(dark.presets.at(-1)).toBe("#ffffff")
    expect(new Set(light.presets).size).toBe(40)
    expect(new Set(dark.presets).size).toBe(40)
    expect(dark.presets).not.toEqual(light.presets)

    expect(dark.ansi16).toEqual(light.ansi16)
    expect(light.ansi16[0]).toBe("#000000")
    expect(dark.ansi16[0]).toBe("#000000")
  })
})

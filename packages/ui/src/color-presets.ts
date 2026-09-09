export type ColorPaletteAppearance = "light" | "dark"

const ANSI_STANDARD_COLORS = [
  "#000000", "#800000", "#008000", "#808000",
  "#000080", "#800080", "#008080", "#c0c0c0",
] as const

const ANSI_BRIGHT_COLORS = [
  "#808080", "#ff0000", "#00ff00", "#ffff00",
  "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
] as const

const LIGHT_COLOR_PRESETS = [
  "#7f1d1d", "#7c2d12", "#713f12", "#14532d", "#064e3b",
  "#164e63", "#1e3a8a", "#312e81", "#581c87", "#0f172a",
  "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#475569",
  "#f87171", "#fdba74", "#fde047", "#86efac", "#6ee7b7",
  "#67e8f9", "#93c5fd", "#a5b4fc", "#d8b4fe", "#94a3b8",
  "#fee2e2", "#ffedd5", "#fef9c3", "#dcfce7", "#ccfbf1",
  "#cffafe", "#dbeafe", "#e0e7ff", "#f3e8ff", "#f8fafc",
] as const

const DARK_COLOR_PRESETS = [
  "#fca5a5", "#fdba74", "#fde047", "#86efac", "#6ee7b7",
  "#67e8f9", "#93c5fd", "#a5b4fc", "#d8b4fe", "#cbd5e1",
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#94a3b8",
  "#991b1b", "#9a3412", "#854d0e", "#166534", "#065f46",
  "#155e75", "#1e40af", "#3730a3", "#6b21a8", "#475569",
  "#450a0a", "#431407", "#422006", "#052e16", "#022c22",
  "#083344", "#172554", "#1e1b4b", "#3b0764", "#0f172a",
] as const

const LIGHT_COLOR_PICKER_PALETTES = Object.freeze({
  ansi16: [...ANSI_STANDARD_COLORS, ...ANSI_BRIGHT_COLORS],
  presets: LIGHT_COLOR_PRESETS,
})

const DARK_COLOR_PICKER_PALETTES = Object.freeze({
  ansi16: [...ANSI_STANDARD_COLORS, ...ANSI_BRIGHT_COLORS],
  presets: DARK_COLOR_PRESETS,
})

export const resolveColorPickerPalettes = (appearance: ColorPaletteAppearance) =>
  appearance === "dark"
    ? DARK_COLOR_PICKER_PALETTES
    : LIGHT_COLOR_PICKER_PALETTES

export type TabsVariant = "underline" | "solid";

export const resolveTabsVariant = (value: unknown): TabsVariant =>
  value === "solid" ? "solid" : "underline";

export const TAB_UNDERLINE_GLYPH = "⎺";

import type { ButtonVariant } from "./button.js";
import type { CellBorderShape, CellFrame } from "./border.js";
import type { ProgressVariant } from "./progress.js";
import type { SurfaceVariant } from "./surface-variant.js";
import type { TableVariant } from "./table.js";
import type { TabsVariant } from "./tabs.js";
import type { WidgetKind } from "./types.js";

export type CellUiPresentation = "rich" | "text";

export const resolveCellUiPresentation = (value: CellUiPresentation | undefined): CellUiPresentation =>
  value === "text" ? "text" : "rich";

// Text keeps one readable character recipe; declared appearance remains intact for Rich.
export const presentedButtonVariant = (presentation: CellUiPresentation, variant: ButtonVariant): ButtonVariant =>
  presentation === "text" ? "outline" : variant;

export const presentedProgressVariant = (presentation: CellUiPresentation, variant: ProgressVariant): ProgressVariant =>
  presentation === "text" ? "outline" : variant;

export const presentedTableVariant = (presentation: CellUiPresentation, variant: TableVariant): TableVariant =>
  presentation === "text" ? "outline" : variant;

export const presentedTabsVariant = (presentation: CellUiPresentation, variant: TabsVariant): TabsVariant =>
  presentation === "text" ? "underline" : variant;

export const presentedFrame = (
  presentation: CellUiPresentation,
  kind: WidgetKind,
  variant: SurfaceVariant | null,
  requested: CellFrame,
  isDialog: boolean,
): CellFrame => presentation === "text" && (
  kind === "alert" || kind === "toast" || isDialog || kind === "tooltip" || kind === "text-area"
  || ((kind === "box" || kind === "overlay" || kind === "scroll-area") && variant === "surface")
  || kind === "select-content" || kind === "combobox-content"
) ? "bordered" : requested;

export const presentedBorderShape = (
  presentation: CellUiPresentation,
  frame: CellFrame,
  requested: unknown,
): CellBorderShape | null => frame !== "bordered" ? null
  : presentation === "text" ? "square"
    : requested === "square" || requested === "rounded" ? requested : null;

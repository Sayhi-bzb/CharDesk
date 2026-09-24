# Theming

Resolve one Cell theme into a browser palette and component recipes.

## Defaults

CLASSIC_MAC_LIGHT_THEME is the package default; CLASSIC_MAC_DARK_THEME inverts its hierarchy. resolveCellUiTheme(partial) applies overrides. Surface backgrounds are visual only and do not alter copied Cell text.

## CSS tokens

The /browser entry exports readCellCssTheme(element) and useCellCssTheme(ref, revision). Apply CSS changes before the hook's layout effect; bump revision after external stylesheet changes. Use --cell-background, --cell-foreground, --cell-surface, --cell-surface-elevated, --cell-border, and component tokens to override recipes.

## Surface and frame

Box, Overlay, ScrollArea, and TextArea separate variant (ghost or surface) from frame (none or bordered). Dialog and Tooltip use their own opaque variant and border recipe. Geometry belongs to CellLayoutStyle, not the theme.

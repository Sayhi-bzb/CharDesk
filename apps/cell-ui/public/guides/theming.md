# Theming

Resolve one Cell theme into a browser palette and component recipes.

## Defaults

CLASSIC_MAC_LIGHT_THEME is the package default; CLASSIC_MAC_DARK_THEME inverts its hierarchy. semanticColors gives info, success, warning, and danger each a text color, surface, and surface foreground. Markdown and Badge/Alert derive their defaults from it; Badge/Alert error maps to danger. resolveCellUiTheme(partial) accepts semanticColors, markdownColors, and badgeStyles overrides. Surface backgrounds do not alter copied Cell text.

## CSS tokens

The /browser entry exports readCellCssTheme(element) and useCellCssTheme(ref, revision). Shared --cell-tone-{info,success,warning,danger} tokens have optional -surface and -surface-foreground partners. Markdown's --cell-markdown-* and Badge's --cell-badge-* tokens override the matching shared role; otherwise the shared token, then the light or dark default, wins. Apply CSS changes before the hook's layout effect; bump revision after external stylesheet changes.

## Surface and frame

Box, ScrollArea, and TextArea separate variant (ghost or surface) from frame (none or bordered). Dialog and Tooltip use their own opaque variant and border recipe. Geometry belongs to CellLayoutStyle, not the theme.

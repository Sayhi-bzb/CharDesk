# Theming

Resolve one Cell theme into a browser palette and component recipes.

## Defaults

CLASSIC_MAC_LIGHT_THEME is the package default; CLASSIC_MAC_DARK_THEME inverts its hierarchy. Markdown uses the shared CharDesk reading palette within each theme. resolveCellUiTheme(partial) merges Markdown color overrides. Surface backgrounds do not alter copied Cell text.

## CSS tokens

The /browser entry exports readCellCssTheme(element) and useCellCssTheme(ref, revision). Markdown uses --cell-markdown-accent, --cell-markdown-link, --cell-markdown-quote, --cell-markdown-muted, --cell-markdown-code-foreground, and --cell-markdown-code-background. These affect Markdown only; other --cell-* tokens control components. Apply CSS changes before the hook's layout effect; bump revision after external stylesheet changes.

## Surface and frame

Box, ScrollArea, and TextArea separate variant (ghost or surface) from frame (none or bordered). Dialog and Tooltip use their own opaque variant and border recipe. Geometry belongs to CellLayoutStyle, not the theme.

# Theming

Resolve one Cell theme into a browser palette and component recipes.

## Defaults

CLASSIC_MAC_LIGHT_THEME is the package default; CLASSIC_MAC_DARK_THEME inverts its hierarchy. semanticColors gives info, success, warning, and danger each a text color, surface, and surface foreground. Link uses info text by default; Markdown prose and Badge/Alert also derive defaults from semanticColors. Explicit Link textStyle.color overrides that default. Markdown syntax uses codeKey, codeValue, codeCommand, and codeComment colors. Badge/Alert error maps to danger. resolveCellUiTheme(partial) accepts semanticColors, markdownColors, and badgeStyles overrides. Surface backgrounds do not alter copied Cell text.

## CSS tokens

The /browser entry exports readCellCssTheme(element) and useCellCssTheme(ref, revision). Shared --cell-tone-{info,success,warning,danger} tokens have optional -surface and -surface-foreground partners. Markdown's --cell-markdown-* and Badge's --cell-badge-* tokens override their roles; syntax uses --cell-markdown-code-{key,value,command,comment}. Apply CSS changes before the hook's layout effect; bump revision after external stylesheet changes.

## Surface and frame

Every ghost surface fills with the nearest parent background, falling back to the page background; surface uses the elevated background. Box, ScrollArea, TextArea, Dialog, and Tooltip share this rule. Frame and border remain independent. Geometry belongs to CellLayoutStyle, not the theme.

# Tooltip

Explain a Cell control on delayed hover or keyboard focus without changing its layout.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Button, Root, Text, Tooltip } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function TooltipExample() {
  return (
    <CellSurface viewport={{ width: 28, height: 7 }} onCommand={() => {}}>
      <Root>
        <Button id="save" label="Save document">
          <Text>Save</Text>
        </Button>
        <Tooltip targetId="save" text="Save current document" />
      </Root>
    </CellSurface>
  );
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [tooltip.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/tooltip.ts)
- [anchored-overlay.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/anchored-overlay.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `targetId` | `string` | Stable id of an existing focusable Cell control. |
| `text` | `string` | Non-empty, single-line supplementary text; clipped to the viewport. |
| `id?` | `string` | Optional stable tooltip owner and semantic identifier. |
| `variant?` | `"surface" \| "ghost"` | Opaque elevated or base surface; surface by default. |
| `border?` | `"none" \| "square" \| "rounded"` | Independent Cell border; omitted uses the theme border shape. |

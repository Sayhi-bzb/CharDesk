# Button

Trigger one action through keyboard, pointer, or assistive input.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import { Box, Button, Root, Text, type WidgetCommand } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

const svgIcons = {
  saveIcon: (
    <svg
      width={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  ),
};

export function ButtonExample() {
  const [focusedId, setFocusedId] = useState("save");
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
  };
  return (
    <CellSurface
      viewport={{ width: 24, height: 3 }}
      svgIcons={svgIcons}
      focusedId={focusedId}
      onCommand={dispatch}
    >
      <Root id="root">
        <Button
          id="save"
          label="Save document"
          variant="solid"
          focused={focusedId === "save"}
        >
          <Box id="saveIcon" style={{ width: 2, height: 1 }} />
          <Text>Save</Text>
        </Button>
      </Root>
    </CellSurface>
  );
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [button.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/button.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `id?` | `string` | Stable focus and activate command target. |
| `label?` | `string` | Accessible name; descendant text is the fallback. |
| `variant?` | `"solid" \| "surface" \| "outline" \| "ghost"` | Local visual recipe; overrides the global recipe and otherwise defaults to solid. |
| `tone?` | `"danger"` | Use the shared danger color for an explicitly destructive action; neutral by default. |
| `disabled?` | `boolean` | Prevents focus, hover, and activation. |
| `focused?` | `boolean` | Controlled logical focus state. |
| `children?` | `ReactNode` | Cell-native button content. |
| `CellSurface.svgIcons?` | `Record<WidgetId, ReactElement<SVGProps<SVGSVGElement>>>` | Trusted browser-only SVGs keyed by Cell node ID. Decorative: absent from copied text and headless output. |
| `style?` | `CellLayoutStyle` | Layout and horizontal padding; defaults to one content Cell per side. |
| `textStyle?` | `CellTextStyle` | Base foreground, background, and emphasis. |

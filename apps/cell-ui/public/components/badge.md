# Badge

Show a compact state label, optionally acting as a command target.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Badge, Root, Text } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function BadgeExample() {
  return <CellSurface viewport={{ width: 22, height: 1 }} onCommand={() => {}}>
    <Root style={{ direction: "row", gap: 1 }}>
      <Badge tone="success"><Text>Done</Text></Badge>
      <Badge id="retry" tone="error" interactive><Text>Retry</Text></Badge>
    </Root>
  </CellSurface>;
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [badge.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/badge.ts)
- [theme.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/theme.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `tone?` | `"neutral" \| "info" \| "success" \| "warning" \| "error"` | Semantic color pair; neutral by default. |
| `interactive?` | `boolean` | Opt in to focus, pointer, keyboard, and assistive activation; false by default. |
| `id?` | `string` | Required non-empty command target when interactive. |
| `label?` | `string` | Accessible name override; descendant text is the fallback. |
| `disabled?` | `boolean` | Disables an interactive Badge. |
| `style?` | `CellLayoutStyle` | Cell layout; one content Cell is reserved on each side by default. |

# Alert

Keep a status or warning visible beside the work it describes.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
  Root,
  Text,
} from "@/lib/cell-ui";

export function AlertExample() {
  return (
    <Root>
      <Alert tone="warning">
        <AlertTitle>Unsaved changes</AlertTitle>
        <AlertDescription>Changes are stored locally.</AlertDescription>
        <Button id="save">
          <Text>Save now</Text>
        </Button>
      </Alert>
    </Root>
  );
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [alert.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/alert.ts)
- [semantics.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/semantics.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `tone?` | `"info" \| "success" \| "warning" \| "error"` | Status meaning; info by default. Warning and error announce as alerts. |
| `variant?` | `"surface" \| "ghost"` | Status-colored surface by default; ghost keeps tone text, icon, and border without a fill. |
| `border?` | `"none" \| "square" \| "rounded"` | None by default; framed borders use the tone's foreground color. |
| `style?` | `CellLayoutStyle` | Width and layout overrides; default maximum width is 44 Cells. |
| `children` | `Cell primitives` | One AlertTitle, optional AlertDescription, and optional Button in order. |

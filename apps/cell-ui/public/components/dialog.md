# Dialog

A named Cell dialog with shared overlay placement and focus management.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import { Root, Button, Text, Dialog, DialogTitle, DialogDescription, DialogFooter } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function DialogExample() {
  const [open, setOpen] = useState(false);
  return <CellSurface viewport={{ width: 48, height: 14 }} onCommand={(command) => {
    if (command.type === "activate" && command.targetId === "open") setOpen(true);
    if ((command.type === "dismiss" && command.targetId === "dialog")
      || (command.type === "activate" && command.targetId === "close")) setOpen(false);
  }}><Root>
    <Button id="open"><Text>Open dialog</Text></Button>
    {open && <Dialog id="dialog">
      <DialogTitle>Continue?</DialogTitle>
      <DialogDescription>This is a preview confirmation.</DialogDescription>
      <DialogFooter><Button id="close"><Text>Close</Text></Button></DialogFooter>
    </Dialog>}
  </Root></CellSurface>;
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [interaction.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/interaction.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `id` | `string` | Required stable dismiss-command target. |
| `variant?` | `"surface" \| "ghost"` | Both are opaque: surface uses the elevated surface token; ghost uses the base surface token. |
| `border?` | `"none" \| "square" \| "rounded"` | Independent Cell border; omitted uses the theme border shape. |
| `modal` | `boolean` | Trap focus and exclude background semantics; default true. |
| `closeOnOutsideClick` | `boolean` | Request dismissal on outside pointer down; default true. |
| `initialFocusId` | `string` | Preferred available content control on opening. |
| `children` | `Cell primitives` | One direct Title, optional direct Description, and composable content/Footer. |

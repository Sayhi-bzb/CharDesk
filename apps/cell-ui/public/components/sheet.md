# Sheet

Open a modal Cell panel from the viewport edge without replacing the work surface.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import { Button, Root, Text } from "@/lib/cell-ui";
import { CellOverlayHost, CellSheet, CellSurface } from "@/lib/cell-ui/browser";

export function SheetExample() {
  const [open, setOpen] = useState(false);
  return (
    <CellOverlayHost>
      <CellSurface
        viewport={{ width: 24, height: 2 }}
        onCommand={(command) => {
          if (command.type === "activate" && command.targetId === "sheet-trigger") {
            setOpen(true);
          }
        }}
      >
        <Root>
          <Button id="sheet-trigger" label="Open sheet">
            <Text>Settings</Text>
          </Button>
        </Root>
      </CellSurface>
      <CellSheet open={open} label="Settings" onDismiss={() => setOpen(false)}>
        <CellSurface
          viewport={{ width: 24, height: 10 }}
          focusedId="sheet-close"
          onCommand={(command) => {
            if (command.type === "activate" && command.targetId === "sheet-close") {
              setOpen(false);
            }
          }}
        >
          <Root>
            <Text>Workspace settings</Text>
            <Button id="sheet-close" label="Close sheet">
              <Text>Close</Text>
            </Button>
          </Root>
        </CellSurface>
      </CellSheet>
    </CellOverlayHost>
  );
}
```

## View source

- [browser-overlay-host.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-overlay-host.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `CellSheet.open` | `boolean` | Controlled visibility of the modal side panel. |
| `CellSheet.label` | `string` | Accessible dialog name. |
| `CellSheet.onDismiss` | `(reason: "escape" \| "outside") => void` | Close the panel on Escape or outside input. |
| `children` | `ReactNode` | Render an independent CellSurface inside the sheet. |

# Toast

Show timed Cell notices above the workspace without moving focus.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Button, Root, Text, Toast } from "@/lib/cell-ui";
import {
  CellOverlayHost,
  CellSurface,
  CellToastViewport,
  useCellToastState,
} from "@/lib/cell-ui/browser";

export function ToastExample() {
  const toast = useCellToastState();
  return (
    <CellOverlayHost>
      <CellSurface
        viewport={{ width: 24, height: 2 }}
        onCommand={(command) => {
          if (command.type === "activate" && command.targetId === "toast-trigger") {
            toast.push({
              id: "saved",
              durationMs: 3000,
              content: (
                <CellSurface viewport={{ width: 24, height: 3 }} onCommand={() => {}}>
                  <Root>
                    <Toast tone="success">
                      <Text>Saved to workspace</Text>
                    </Toast>
                  </Root>
                </CellSurface>
              ),
            });
          }
        }}
      >
        <Root>
          <Button id="toast-trigger" label="Show toast">
            <Text>Save</Text>
          </Button>
        </Root>
      </CellSurface>
      <CellToastViewport state={toast} />
    </CellOverlayHost>
  );
}
```

## Composition

```text
CellOverlayHost
├── CellSurface (application)
└── CellToastViewport (state from useCellToastState)

toast.push({ content })
└── CellSurface (notice)
    └── Toast
        └── Cell content
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-toast.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-toast.tsx)
- [browser-overlay-host.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-overlay-host.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `CellSurface.presentation` | `"rich" \| "text"` | Select one rendering mode for each notice surface. |
| `Toast.tone?` | `"neutral" \| "info" \| "success" \| "warning" \| "error"` | Shared semantic palette; neutral by default. |
| `Toast.variant?` | `"surface" \| "ghost"` | Shared surface treatment; surface by default. |
| `Toast.frame?` | `"none" \| "bordered"` | Rich border, bordered by default; Text always uses a square character frame. |
| `Toast.borderShape?` | `"square" \| "rounded"` | Rich frame shape when bordered. |
| `useCellToastState` | `hook` | Owns the notice queue; push replaces a matching id and dismiss removes it. |
| `CellToastViewport.state` | `CellToastState` | Portals notices through CellOverlayHost without stealing focus. |
| `push({ id, content, durationMs? })` | `CellToastEntry` | Render CellSurface content; positive durationMs dismisses it automatically. |

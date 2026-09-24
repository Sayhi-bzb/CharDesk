# Toggle

Show a persistent mode with a status light, separate from interaction feedback.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import { Root, Toggle, Text } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function ToggleExample() {
  const [pressed, setPressed] = useState(false);
  return <CellSurface viewport={{ width: 12, height: 1 }} onCommand={(command) => {
    if (command.type === "activate" && command.targetId === "bold") setPressed((value) => !value);
  }}>
    <Root><Toggle id="bold" label="Bold" pressed={pressed}><Text>Bold</Text></Toggle></Root>
  </CellSurface>;
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [press.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/press.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `pressed?` | `boolean` | Persistent pressed state; defaults to false. |
| `disabled?` | `boolean` | Prevents focus and activation. |
| `children / label` | `ReactNode / string` | Cell content and accessible name. |

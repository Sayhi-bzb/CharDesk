# Checkbox

Toggle boolean or indeterminate state through one Cell command path.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import {
  Checkbox,
  Root,
  Text,
  nextCellCheckboxState,
  type CellCheckboxState,
  type WidgetCommand,
} from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function CheckboxExample() {
  const [checked, setChecked] = useState<CellCheckboxState>("indeterminate");
  const [focusedId, setFocusedId] = useState("autosave");
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "activate" && command.targetId === "autosave") {
      setChecked(nextCellCheckboxState);
    }
  };
  return (
    <CellSurface focusedId={focusedId} onCommand={dispatch} viewport={{ width: 24, height: 1 }}>
      <Root id="root">
        <Checkbox
          id="autosave"
          label="Autosave"
          checked={checked}
          focused={focusedId === "autosave"}
        ><Text>Autosave</Text></Checkbox>
      </Root>
    </CellSurface>
  );
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [primitive-behavior.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/primitive-behavior.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `checked?` | `boolean \| "indeterminate"` | Controls [ ], [x], or [-]. |
| `id?` | `string` | Stable focus and activate command target. |
| `label?` | `string` | Accessible name; descendant text is the fallback. |
| `disabled?` | `boolean` | Prevents focus, hover, and activation. |
| `focused?` | `boolean` | Controlled logical focus state. |
| `children?` | `ReactNode` | Cell-native label content. |
| `nextCellCheckboxState` | `(CellCheckboxState) => CellCheckboxState` | Maps mixed to checked, then toggles the binary cycle. |

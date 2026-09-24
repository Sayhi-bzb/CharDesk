# Input

Edit a single line of Unicode text on the Cell grid.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Box, Root, Text, TextInput } from "@/lib/cell-ui";
import { CellSurface, useCellTextState } from "@/lib/cell-ui/browser";

export function InputExample() {
  const input = useCellTextState("file-name", { value: "notes.txt" });
  return (
    <CellSurface viewport={{ width: 36, height: 2 }} onCommand={input.dispatch}>
      <Root id="root">
        <Box>
          <Text>File name</Text>
          <TextInput
            id="file-name"
            label="File name"
            state={input.snapshot}
            style={{ width: 36 }}
          />
        </Box>
      </Root>
    </CellSurface>
  );
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-input.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-input.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `id?` | `string` | Stable text command target identity. |
| `state` | `CellTextSnapshot` | Controlled value, selection, cursor, and scroll state. |
| `label?` | `string` | Accessible textbox name. |
| `disabled?` | `boolean` | Prevents focus and editing. |
| `readOnly?` | `boolean` | Allows focus and selection without editing. |
| `variant?` | `"surface" \| "ghost"` | Local surface recipe; overrides the global recipe and otherwise defaults to surface. |
| `style?` | `CellSingleLineInputStyle` | Width constraints and flex behavior; height, padding, and border belong to the component. |
| `textStyle?` | `CellTextStyle` | Foreground, background, and emphasis. |

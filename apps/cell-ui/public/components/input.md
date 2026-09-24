# Input

Edit a single line of Unicode text on the Cell grid.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Field, Root, TextInput } from "@/lib/cell-ui";
import { CellSurface, useCellTextState } from "@/lib/cell-ui/browser";

export function InputExample() {
  const input = useCellTextState("file-name", { value: "notes.txt" });
  return (
    <CellSurface viewport={{ width: 36, height: 3 }} onCommand={input.dispatch}>
      <Root id="root">
        <Field id="file-name-field" label="File name" error={input.snapshot.value ? undefined : "Required"}>
          <TextInput
            id="file-name"
            state={input.snapshot}
            style={{ width: 36 }}
          />
        </Field>
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
| `Field` | `{ id: string; label: string; error?: string; style?: CellLayoutStyle }` | Optional shared label and validation message for TextInput, TextArea, Select, or Combobox. The focus-bearing control receives aria-invalid and the error description. |

# TextArea

Edit multiline Cell text with retained selection and scrolling.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Root, TextArea } from "@/lib/cell-ui";
import { useCellTextState } from "@/lib/cell-ui/browser";

const editor = useCellTextState("notes", { value: "Hello", multiline: true });
<Root><TextArea id="notes" label="Notes" state={editor.snapshot}
  frame="bordered" style={{ height: 6 }} /></Root>
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-input.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-input.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `state` | `CellTextSnapshot` | Controlled text, caret, selection, and scroll state. |
| `label?` | `string` | Accessible editor name. |
| `variant? / frame?` | `SurfaceVariant / CellFrame` | Independent background and Cell border. |
| `style?` | `CellLayoutStyle` | Editor viewport dimensions. |

# Radio

Choose one value with a shared group and arrow-key navigation.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { RadioGroup, RadioItem, Root, Text } from "@/lib/cell-ui";
import { CellSurface, useCellRadioState } from "@/lib/cell-ui/browser";

const items = [
  { id: "light", value: "light", label: "Light" },
  { id: "dark", value: "dark", label: "Dark" },
];

export function RadioExample() {
  const radio = useCellRadioState(items, { defaultValue: "light" });
  return (
    <CellSurface
      viewport={{ width: 16, height: 2 }}
      focusedId={radio.focusedId}
      onCommand={radio.dispatch}
    >
      <Root>
        <RadioGroup label="Appearance" value={radio.value}>
          {radio.items.map((item) => (
            <RadioItem key={item.id} id={item.id} value={item.value}>
              <Text>{item.label}</Text>
            </RadioItem>
          ))}
        </RadioGroup>
      </Root>
    </CellSurface>
  );
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-collections.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-collections.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `RadioGroup.value?` | `string \| null` | Controlled selection; items have unique non-empty values. |
| `RadioGroup.orientation?` | `"vertical" \| "horizontal"` | Vertical by default. |
| `disabled?` | `boolean` | Disable a group or individual item. |
| `useCellRadioState` | `(items, options) => state` | Owns controlled/uncontrolled selection and command dispatch. |

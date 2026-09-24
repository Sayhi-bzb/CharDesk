# Slider

Select one stepped value or a bounded interval on a Cell-native track.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import { Root, Slider, type WidgetCommand } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function SliderExample() {
  const [value, setValue] = useState(50);
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "set-value" && command.targetId === "volume") {
      setValue(command.value);
    }
  };
  return (
    <CellSurface
      focusedId="volume"
      onCommand={dispatch}
      viewport={{ width: 26, height: 1 }}
    >
      <Root id="root" style={{ direction: "row" }}>
        <Slider
          id="volume"
          label="Volume"
          value={value}
          valueText={String(value) + " percent"}
          min={0}
          max={100}
          step={1}
          focused
          style={{ width: 26 }}
        />
      </Root>
    </CellSurface>
  );
}

// Two endpoints use the same Slider; handle set-value by thumb id.
<Slider
  id="range"
  label="Volume range"
  value={[25, 75]}
  thumbs={[
    { id: "start", label: "Minimum" },
    { id: "end", label: "Maximum" },
  ]}
/>;
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [slider.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/slider.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `value` | `number \| readonly [number, number]` | Controlled single value or bounded interval. |
| `id / label` | `string` | Required for an interval; names its group and command target. |
| `min? / max?` | `number` | Allowed range; defaults to 0–100. |
| `step?` | `number` | Keyboard and pointer increment; defaults to 1. |
| `valueText?` | `string` | Single-value aria-valuetext without visible UI. |
| `thumbs` | `readonly [SliderThumb, SliderThumb]` | Required for an interval; each endpoint has an id and label, with optional valueText and focused state. |
| `disabled?` | `boolean` | Prevents focus, hover, keyboard, tap, and drag. |
| `focused?` | `boolean` | Single-value logical focus; interval focus belongs to each thumb. |
| `WidgetCommand` | `set-value` | Targets the Slider id for one value or the endpoint id for an interval. |

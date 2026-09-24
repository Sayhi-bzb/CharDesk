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
    <CellSurface focusedId="volume" onCommand={dispatch} viewport={{ width: 26, height: 1 }}>
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
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [slider.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/slider.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `value` | `number` | Controlled numeric value projected onto the track. |
| `min? / max?` | `number` | Allowed range; defaults to 0–100. |
| `step?` | `number` | Keyboard and pointer increment; defaults to 1. |
| `valueText?` | `string` | Human-readable aria-valuetext without visible UI. |
| `disabled?` | `boolean` | Prevents focus, hover, keyboard, tap, and drag. |
| `focused?` | `boolean` | Controlled logical focus state. |
| `RangeSlider` | `compound` | Owns one shared track and exactly two direct thumbs. |
| `RangeSliderThumb` | `id + label + value` | Owns one independently focused interval endpoint. |
| `WidgetCommand` | `set-value` | Unifies keyboard, track tap, drag, and assistive input. |

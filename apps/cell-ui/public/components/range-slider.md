# RangeSlider

Control two values on one Cell track.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { RangeSlider, RangeSliderThumb, Root } from "@/lib/cell-ui";

<Root><RangeSlider id="range" label="Volume range" min={0} max={100}>
  <RangeSliderThumb id="start" label="Minimum" value={25} />
  <RangeSliderThumb id="end" label="Maximum" value={75} />
</RangeSlider></Root>
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [slider.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/slider.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `id / label` | `string` | Stable command target and accessible group name. |
| `min? / max? / step?` | `number` | Shared value bounds and increment. |
| `RangeSliderThumb.value` | `number` | Controlled value; handle set-value commands by thumb ID. |
| `RangeSliderThumb.focused?` | `boolean` | Logical thumb focus. |

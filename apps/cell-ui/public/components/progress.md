# Progress

Display determinate or indeterminate progress as a solid or outlined track, with an optional percentage.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Progress, Root } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function ProgressExample() {
  return (
    <CellSurface viewport={{ width: 20, height: 1 }} onCommand={() => {}}>
      <Root>
        <Progress label="Upload" value={60} variant="outline" number />
      </Root>
    </CellSurface>
  );
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [progress.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/progress.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `value` | `number \| null` | Numbers are clamped to 0…max; null is indeterminate. |
| `max?` | `number` | Positive finite maximum; defaults to 100. |
| `number?` | `boolean` | Show a calculated percentage beside the track within the declared width; hidden for indeterminate progress. |
| `variant?` | `"solid" \| "outline"` | Solid by default; outline reserves bracket Cells inside the declared width. |
| `label / valueText?` | `string` | Accessible name and optional value description. |

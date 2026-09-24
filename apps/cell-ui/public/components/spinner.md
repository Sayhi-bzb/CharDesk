# Spinner

Show indeterminate activity in a single Unicode Cell, using a wheel or dots.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Box, Root, Spinner, Text } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function SpinnerExample() {
  return <CellSurface viewport={{ width: 20, height: 1 }} onCommand={() => {}}>
    <Root><Box style={{ direction: "row", gap: 1 }}>
      <Spinner label="Loading" variant="wheel" /><Text>Loading…</Text>
    </Box></Root>
  </CellSurface>;
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [spinner.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/spinner.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `string` | Required accessible name; visible text is composed separately. |
| `variant?` | `"wheel" \| "dots"` | Wheel by default; both variants occupy one Cell. |
| `id?` | `string` | Stable Cell owner and probe identifier. |

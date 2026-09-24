# Accordion

Expand independent sections without losing their content state.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Root, Separator, Text } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

export function AccordionExample() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return <CellSurface viewport={{ width: 30, height: 6 }} onCommand={(command) => {
    if (command.type === "set-expanded") setExpanded((current) => {
      const next = new Set(current);
      if (command.expanded) next.add(command.targetId);
      else next.delete(command.targetId);
      return next;
    });
  }}>
    <Root><Accordion><AccordionItem id="general" expanded={expanded.has("general")}>
      <AccordionTrigger><Text>General</Text></AccordionTrigger>
      <AccordionContent><Text>Project settings</Text></AccordionContent>
    </AccordionItem>
    <Separator />
    <AccordionItem id="advanced" expanded={expanded.has("advanced")}>
      <AccordionTrigger><Text>Advanced</Text></AccordionTrigger>
      <AccordionContent><Text>Advanced settings</Text></AccordionContent>
    </AccordionItem></Accordion></Root>
  </CellSurface>;
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [interaction.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/interaction.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `Accordion.disabled?` | `boolean` | Disables all items and content controls. |
| `AccordionItem.id` | `string` | Stable item ID; target of set-expanded commands. |
| `AccordionItem.expanded?` | `boolean` | Controlled expansion; defaults to false. Items expand independently. |
| `AccordionItem.disabled?` | `boolean` | Disables this item and its content controls. |
| `children` | `AccordionItem \| Separator` | Each Item has one Trigger then one Content; optional Separators sit only between Items. Collapsed content retains state. |

# Tabs

Switch between related Cell panels with one selected tab.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Root, Tab, TabPanel, Tabs, Text } from "@/lib/cell-ui";
import { CellSurface, useCellTabsState } from "@/lib/cell-ui/browser";

const items = [
  { id: "code", label: "Code", panelId: "code-panel" },
  { id: "preview", label: "Preview", panelId: "preview-panel" },
];

export function TabsExample() {
  const tabs = useCellTabsState(items, { defaultSelectedId: "code" });
  const selected = tabs.items.find((item) => item.id === tabs.selectedId);
  return <CellSurface viewport={{ width: 28, height: 5 }}
    focusedId={tabs.focusedId} onCommand={tabs.dispatch}>
    <Root>
      <Tabs label="Views" orientation="horizontal">
        {tabs.items.map((item) => <Tab key={item.id} id={item.id}
          controlsId={item.panelId}
          focused={tabs.focusedId === item.id}
          selected={tabs.selectedId === item.id}><Text>{item.label}</Text></Tab>)}
      </Tabs>
      {selected && <TabPanel id={selected.panelId} label={selected.label}
        labelledById={selected.id}><Text>{selected.label} content</Text></TabPanel>}
    </Root>
  </CellSurface>;
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-collections.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-collections.tsx)
- [interaction.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/interaction.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `Tabs.label?` | `string` | Accessible tab-list name. |
| `Tabs.orientation?` | `"horizontal" \| "vertical"` | Collection orientation; this example uses horizontal navigation. |
| `Tabs.variant?` | `"underline" \| "solid"` | Underline by default; solid keeps the one-row inverse selection. |
| `Tab.id` | `string` | Stable focus and activation target. |
| `Tab.controlsId?` | `string` | ID of the associated TabPanel. |
| `Tab.focused?` | `boolean` | Controlled logical focus state. |
| `Tab.selected?` | `boolean` | Controlled selected state. |
| `Tab.disabled?` | `boolean` | Prevents focus and selection. |
| `TabPanel.labelledById?` | `string` | ID of the tab naming this panel. |
| `useCellTabsState` | `items, options` | Keeps focus and selection outside the renderer; dispatches Cell commands. |

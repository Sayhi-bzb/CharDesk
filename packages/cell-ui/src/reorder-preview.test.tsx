import { expect, it } from "vitest";
import { List, ListItem, Root, Text } from "./index.js";
import { CellUiRuntime } from "./runtime.js";
import { paintReorderPreview } from "./reorder-preview.js";
import { DEFAULT_CELL_UI_THEME } from "./theme.js";

it("snaps the dragged row to one projected slot without hiding a neighbor", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
  const frame = runtime.render(<Root><List id="rows" reorderable>
    <ListItem id="a"><Text>Alpha</Text></ListItem>
    <ListItem id="b"><Text>Beta</Text></ListItem>
    <ListItem id="c"><Text>Gamma</Text></ListItem>
  </List></Root>);
  const before = frame.buffer.toText();
  const stages = [
    { y: 0.5, order: ["Alpha", "Beta", "Gamma"], selectedRow: 0 },
    { y: 1.1, order: ["Alpha", "Beta", "Gamma"], selectedRow: 0 },
    { y: 1.5, order: ["Beta", "Alpha", "Gamma"], selectedRow: 1 },
    { y: 2, order: ["Beta", "Alpha", "Gamma"], selectedRow: 1 },
    { y: 2.5, order: ["Beta", "Gamma", "Alpha"], selectedRow: 2 },
  ];
  for (const { y, order, selectedRow } of stages) {
    const preview = paintReorderPreview(frame, {
      pointerId: 1, sourceId: "a", point: { x: 1.5, y },
    }, DEFAULT_CELL_UI_THEME);
    expect(preview).not.toBeNull();
    for (const [index, label] of order.entries()) expect(preview!.toLines()[index]).toContain(label);
    for (const label of order) expect(preview!.toText().split(label)).toHaveLength(2);
    expect(preview!.get(0, selectedRow)?.style).toEqual(DEFAULT_CELL_UI_THEME.selectedStyle);
    expect(preview!.toText()).not.toContain("▸");
  }
  expect(frame.buffer.toText()).toBe(before);
  expect(paintReorderPreview(frame, {
    pointerId: 1, sourceId: "a", point: { x: 20, y: 2.5 },
  }, DEFAULT_CELL_UI_THEME)).toBeNull();
  runtime.dispose();
});

it("preserves row heights and list spacing while moving upward", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 8 } });
  const frame = runtime.render(<Root><List id="rows" reorderable style={{ gap: 1 }}>
    <ListItem id="a"><Text>Alpha</Text></ListItem>
    <ListItem id="b" style={{ height: 2 }}><Text>Beta</Text></ListItem>
    <ListItem id="c"><Text>Gamma</Text></ListItem>
  </List></Root>);
  const before = frame.buffer.toText();
  const preview = paintReorderPreview(frame, {
    pointerId: 1, sourceId: "c", point: { x: 1.5, y: 0.1 },
  }, DEFAULT_CELL_UI_THEME);
  expect(preview).not.toBeNull();
  expect(preview!.toLines()[0]).toContain("Gamma");
  expect(preview!.toLines()[1]).not.toContain("Alpha");
  expect(preview!.toLines()[2]).toContain("Alpha");
  expect(preview!.toLines()[4]).toContain("Beta");
  expect(preview!.toLines()[5]).not.toContain("Gamma");
  expect(frame.buffer.toText()).toBe(before);
  runtime.dispose();
});

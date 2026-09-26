import { expect, it } from "vitest";
import { CellUiRuntime, createTestPilot, List, ListItem, Root, Text } from "./index.js";
import { reorderCellItems } from "./reorder.js";
import type { WidgetCommand } from "./interaction.js";

it("routes keyboard and pointer reordering through the same command", async () => {
  let items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const commands: WidgetCommand[] = [];
  const pilot = createTestPilot({ viewport: { width: 16, height: 5 },
    render: () => <Root><List id="order" label="Order" reorderable>
      {items.map((item) => <ListItem key={item.id} id={item.id} focused={item.id === "a"}
        label={item.id}><Text>{item.id}</Text></ListItem>)}
    </List></Root>,
    onCommand: (command) => {
      commands.push(command);
      if (command.type === "reorder") items = [...reorderCellItems(items, command.targetId, command.toIndex)];
    },
  });
  await pilot.pointerDown({ x: 0, y: 0 });
  await pilot.pointerUp({ x: 0, y: 0 });
  expect(commands.some((command) => command.type === "reorder")).toBe(false);
  expect(pilot.focus()).toBe("a");
  expect(pilot.frame.tree.nodes.get("a")?.reorderable).toBe(true);
  await pilot.pressKey("ArrowDown", { modifiers: { alt: true } });
  expect(commands).toContainEqual({ type: "reorder", targetId: "a", toIndex: 1 });
  expect(items.map((item) => item.id)).toEqual(["b", "a", "c"]);

  await pilot.pointerDown({ x: 0, y: 1 });
  await pilot.pointerMove({ x: 0, y: 2 });
  await pilot.pointerUp({ x: 0, y: 2 });
  expect(commands).toContainEqual({ type: "reorder", targetId: "a", toIndex: 2 });
  expect(items.map((item) => item.id)).toEqual(["b", "c", "a"]);
  pilot.dispose();
});

it("rejects non-item content inside a reorderable collection", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 16, height: 4 } });
  expect(() => runtime.render(<Root><List id="layers" label="Layers" reorderable>
    <Text>Not a row</Text>
  </List></Root>)).toThrow("A reorderable List requires an id and direct ListItem children with ids.");
  expect(() => runtime.render(<Root><List id="layers" reorderable>
    <ListItem><Text>Missing id</Text></ListItem>
  </List></Root>)).toThrow("A reorderable List requires an id and direct ListItem children with ids.");
  expect(() => runtime.render(<Root><List reorderable>
    <ListItem id="row"><Text>Missing list id</Text></ListItem>
  </List></Root>)).toThrow("A reorderable List requires an id and direct ListItem children with ids.");
  runtime.dispose();
});

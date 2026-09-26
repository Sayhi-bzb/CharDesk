import { describe, expect, it } from "vitest";
import { Box, Button, CellUiRuntime, Root, ScrollArea, Text } from "./index.js";
import { createRuntimeWidgetDescriptor, MarkdownDescriptorCache } from "./react.js";
import { reconcileWidgetTree } from "./tree.js";
import { List, ListItem } from "./react.js";

describe("adjacent-frame descriptor identity", () => {
  it("retains an unchanged native subtree while its ScrollArea moves", () => {
    const cache = new MarkdownDescriptorCache();
    const stable = <Button id="save"><Text>Save</Text></Button>;
    const view = (scrollY: number) => <Root><ScrollArea id="scroll" scrollY={scrollY}
      style={{ width: 12, height: 2 }}>{stable}<Text>Other</Text></ScrollArea></Root>;
    const firstDescriptor = createRuntimeWidgetDescriptor(view(0), {}, "rich", cache)!;
    const secondDescriptor = createRuntimeWidgetDescriptor(view(1), {}, "rich", cache)!;
    expect(secondDescriptor.children[0]?.children[0]).toBe(firstDescriptor.children[0]?.children[0]);
    const first = reconcileWidgetTree(undefined, firstDescriptor);
    const second = reconcileWidgetTree(first.tree, secondDescriptor);
    expect(second.tree.nodes.get("save")).toBe(first.tree.nodes.get("save"));
    expect(second.tree.nodes.get("save/text[0]")).toBe(first.tree.nodes.get("save/text[0]"));
    expect(second.mutations).toEqual([{ type: "update", id: "scroll" }]);
  });

  it("rebuilds a changed sibling without rebuilding stable siblings", () => {
    const cache = new MarkdownDescriptorCache();
    const stable = <Text id="stable">Unchanged</Text>;
    const view = (value: string) => <Root>{stable}<Text id="changing">{value}</Text></Root>;
    const first = reconcileWidgetTree(undefined, createRuntimeWidgetDescriptor(view("A"), {}, "rich", cache));
    const second = reconcileWidgetTree(first.tree, createRuntimeWidgetDescriptor(view("B"), {}, "rich", cache));
    expect(second.tree.nodes.get("stable")).toBe(first.tree.nodes.get("stable"));
    expect(second.tree.nodes.get("changing")).not.toBe(first.tree.nodes.get("changing"));
    expect(second.tree.nodes.get("changing")?.text).toBe("B");
  });

  it("rebuilds inherited state and moved nodes even when the child element is stable", () => {
    const cache = new MarkdownDescriptorCache();
    const item = <ListItem id="item"><Text>Row</Text></ListItem>;
    const list = (reorderable: boolean) => <Root><List id="list" reorderable={reorderable}>{item}</List></Root>;
    const first = reconcileWidgetTree(undefined, createRuntimeWidgetDescriptor(list(false), {}, "rich", cache));
    const second = reconcileWidgetTree(first.tree, createRuntimeWidgetDescriptor(list(true), {}, "rich", cache));
    expect(second.tree.nodes.get("item")).not.toBe(first.tree.nodes.get("item"));
    expect(second.tree.nodes.get("item")?.reorderable).toBe(true);

    const stable = <Text id="moved">Move me</Text>;
    const moved = (parentId: string) => <Root><Box id={parentId}>{stable}</Box></Root>;
    const beforeMove = reconcileWidgetTree(undefined, createRuntimeWidgetDescriptor(moved("left"), {}, "rich", cache));
    const afterMove = reconcileWidgetTree(beforeMove.tree, createRuntimeWidgetDescriptor(moved("right"), {}, "rich", cache));
    expect(afterMove.tree.nodes.get("moved")).not.toBe(beforeMove.tree.nodes.get("moved"));
    expect(afterMove.tree.nodes.get("moved")?.parentId).toBe("right");
  });

  it("keeps presentation and recipe as separate cache contexts", () => {
    const cache = new MarkdownDescriptorCache();
    const button = <Button id="action"><Text>Act</Text></Button>;
    const view = (presentation: "rich" | "text") => <Root><Box presentation={presentation}>{button}</Box></Root>;
    const rich = createRuntimeWidgetDescriptor(view("rich"), {}, "rich", cache)!;
    const text = createRuntimeWidgetDescriptor(view("text"), {}, "rich", cache)!;
    expect(text.children[0]?.children[0]).not.toBe(rich.children[0]?.children[0]);
    const surface = createRuntimeWidgetDescriptor(view("rich"), { defaultControlVariant: "surface" }, "rich", cache)!;
    const ghost = createRuntimeWidgetDescriptor(view("rich"), { defaultControlVariant: "ghost" }, "rich", cache)!;
    expect(ghost.children[0]?.children[0]).not.toBe(surface.children[0]?.children[0]);
  });

  it("retains only adjacent-frame elements and still projects external focus state", () => {
    const cache = new MarkdownDescriptorCache();
    const button = <Button id="focus"><Text>Focus</Text></Button>;
    const view = (shown: boolean) => <Root>{shown ? button : <Text>Empty</Text>}</Root>;
    const first = createRuntimeWidgetDescriptor(view(true), {}, "rich", cache)!;
    createRuntimeWidgetDescriptor(view(false), {}, "rich", cache);
    const third = createRuntimeWidgetDescriptor(view(true), {}, "rich", cache)!;
    expect(third.children[0]).not.toBe(first.children[0]);

    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 2 } });
    const root = view(true);
    runtime.render(root);
    const focused = runtime.render(root, { focusedId: "focus" });
    expect(focused.tree.nodes.get("focus")?.focused).toBe(true);
    expect(focused.semantics.focusedId).toBe("focus");
    runtime.dispose();
  });

  it("keeps runtime output equivalent to a fresh tree when scrolling stable elements", () => {
    const stable = Array.from({ length: 80 }, (_, index) =>
      <Text id={`line-${index}`} key={index}>{`Line ${index}`}</Text>);
    const view = (scrollY: number, rows = stable) => <Root><ScrollArea id="scroll" scrollY={scrollY}
      style={{ width: 15, height: 4 }}>{rows}</ScrollArea></Root>;
    const retained = new CellUiRuntime({ viewport: { width: 15, height: 4 } });
    retained.render(view(0));
    for (const scrollY of [1, 35, 79, 0]) {
      const frame = retained.render(view(scrollY));
      const fresh = new CellUiRuntime({ viewport: { width: 15, height: 4 } });
      const oracle = fresh.render(view(scrollY, stable.map((row) =>
        <Text id={row.props.id} key={row.key}>{row.props.children}</Text>)));
      expect(frame.buffer.toText()).toBe(oracle.buffer.toText());
      expect(frame.invalidation.work.layout).toBe("reused");
      expect(frame.semantics.nodes).toEqual(oracle.semantics.nodes);
      fresh.dispose();
    }
    retained.dispose();
  });
});

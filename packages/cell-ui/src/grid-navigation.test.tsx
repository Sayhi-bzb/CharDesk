import { expect, it } from "vitest";
import { CellUiRuntime, FocusManager, Root, Button, Grid, GridRow, GridCell, Text, commandForInput, createKeyInput, CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME } from "./index.js";
import { createTestPilot } from "./testing.js";

type Cell = { row: number; column: number; disabled?: boolean };
const cells: Cell[] = [{ row: 1, column: 1 }, { row: 1, column: 2, disabled: true }, { row: 1, column: 4 }, { row: 3, column: 1 }];
const grid = (id: string, data = cells, selected = `${id}-1-4`) => <Grid id={id} label={id}>
  {[...new Set(data.map((cell) => cell.row))].map((row) => <GridRow key={row} rowIndex={row}>
    {data.filter((cell) => cell.row === row).map((cell) => {
      const key = `${id}-${row}-${cell.column}`;
      return <GridCell key={key} id={key} rowIndex={row} columnIndex={cell.column} disabled={cell.disabled}
        selected={key === selected} style={{ width: 8 }}><Text>Value</Text></GridCell>;
    })}
  </GridRow>)}
</Grid>;

it("navigates coordinates rather than descriptor order, skipping gaps and disabled cells", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 40, height: 8 } });
  const frame = runtime.render(<Root>{grid("a", [...cells].reverse())}</Root>);
  const focus = new FocusManager();
  const target = (id: string, key: string) => {
    focus.sync(frame.tree, id);
    return commandForInput(createKeyInput({ key }), frame, focus)?.targetId;
  };
  expect(target("a-1-1", "ArrowRight")).toBe("a-1-4");
  expect(target("a-1-4", "ArrowLeft")).toBe("a-1-1");
  expect(target("a-1-1", "ArrowDown")).toBe("a-3-1");
  expect(target("a-3-1", "ArrowUp")).toBe("a-1-1");
  expect(target("a-1-4", "ArrowDown")).toBe("a-1-4");
  expect(target("a-1-4", "ArrowRight")).toBe("a-1-4");
  expect(target("a-1-4", "Home")).toBe("a-1-1");
  expect(target("a-1-1", "End")).toBe("a-1-4");
  runtime.dispose();
});

it("provides one remembered Tab entry per Grid and removes unmounted memories", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 40, height: 8 } });
  const view = (show = true, data = cells) => <Root><Button id="before"><Text>Before</Text></Button>
    {show && grid("a", data)}{grid("b")}<Button id="after"><Text>After</Text></Button></Root>;
  let frame = runtime.render(view());
  const focus = new FocusManager();
  focus.sync(frame.tree, "before");
  expect(focus.tab(frame.tree, 1)).toBe("a-1-4");
  focus.sync(frame.tree, "a-3-1");
  expect(focus.tab(frame.tree, -1)).toBe("before");
  expect(focus.tab(frame.tree, 1)).toBe("b-1-4");
  focus.sync(frame.tree, "b-1-1");
  expect(focus.tab(frame.tree, -1)).toBe("a-3-1");
  expect(focus.tab(frame.tree, 1)).toBe("after");
  frame = runtime.render(view(false));
  focus.sync(frame.tree, "after");
  frame = runtime.render(view());
  focus.sync(frame.tree, "before");
  expect(focus.tab(frame.tree, 1)).toBe("a-1-4");
  frame = runtime.render(view(true, cells.map((c) => ({ ...c, disabled: true }))));
  focus.sync(frame.tree, "before");
  expect(focus.tab(frame.tree, 1)).toBe("b-1-1");
  runtime.dispose();
});

it.each(["disable", "remove"])("converges invalid focus after %s without changing selection", (mode) => {
  const runtime = new CellUiRuntime({ viewport: { width: 40, height: 4 } });
  const focus = new FocusManager();
  focus.sync(runtime.render(<Root>{grid("a")}</Root>).tree, "a-3-1");
  const data = mode === "remove" ? cells.filter((c) => c.row !== 3) : cells.map((c) => ({ ...c, disabled: c.disabled || c.row === 3 }));
  const frame = runtime.render(<Root>{grid("a", data)}</Root>);
  focus.sync(frame.tree);
  expect(focus.focusedId).toBe("a-1-4");
  expect(frame.semantics.nodes.get("a-1-4")?.selected).toBe(true);
  runtime.dispose();
});

it("projects fixed marks and identical pointer/keyboard emphasis without reflow", () => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 4 }, theme });
    const view = <Root>{grid("a")}</Root>;
    const idle = runtime.render(view);
    expect(idle.buffer.toText()).toContain("✓ Value");
    const selected = idle.scene.entries.get("a-1-4")!.layoutBounds;
    expect(idle.buffer.get(selected.x, selected.y)?.style.backgroundColor).toBeUndefined();
    for (const state of [{ hoveredId: "a-1-4", focusVisible: false }, { focusedId: "a-1-4" }]) {
      const frame = runtime.render(view, state);
      expect(frame.layout).toBe(idle.layout);
      for (let x = selected.x; x < selected.x + selected.width; x++) {
        expect(frame.buffer.get(x, selected.y)?.style).toMatchObject({ color: theme.background, backgroundColor: theme.foreground });
        expect(frame.buffer.get(x, selected.y)?.style.bold).not.toBe(true);
      }
    }
    runtime.dispose();
  }
});

it("navigation and hover never activate, while Enter commits once without confirmation", async () => {
  const commands: string[] = [];
  const pilot = createTestPilot({ viewport: { width: 30, height: 4 }, render: () => <Root>{grid("a")}</Root>, onCommand: (c) => { if (c.type === "activate") commands.push(c.targetId); } });
  await pilot.press("Tab", "Home", "ArrowDown");
  expect(pilot.frame.semantics.focusedId).toBe("a-3-1");
  expect(commands).toEqual([]);
  await pilot.press("Enter");
  expect(commands).toEqual(["a-3-1"]);
  expect(pilot.frame.confirmation).toBeUndefined();
  pilot.dispose();
});

it("clips selection chrome inside a narrow cell without touching its neighbor", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 }, theme: { collectionSelectedIndicator: "*" } });
  const view = (disabled = false) => <Root><Grid><GridRow rowIndex={1}>
    <GridCell id="narrow" rowIndex={1} columnIndex={1} selected disabled={disabled} style={{ width: 5, height: 3, paddingLeft: 0 }}><Text>Alphabet</Text></GridCell>
    <GridCell id="neighbor" rowIndex={1} columnIndex={2} style={{ width: 7 }}><Text>Next</Text></GridCell>
  </GridRow></Grid></Root>;
  const frame = runtime.render(view(), { hoveredId: "narrow" });
  expect(frame.buffer.toText().split("\n")[0]?.slice(0, 5)).toBe("* Alp");
  expect(frame.buffer.get(5, 0)?.style.backgroundColor).toBeUndefined();
  const disabled = runtime.render(view(true), { focusedId: "narrow", hoveredId: "narrow", pressActiveId: "narrow" });
  expect(disabled.buffer.get(0, 0)?.text).toBe("*");
  expect(disabled.buffer.get(0, 0)?.style.backgroundColor).toBeUndefined();
  runtime.dispose();
});

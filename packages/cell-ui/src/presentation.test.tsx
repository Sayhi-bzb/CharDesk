import { expect, it } from "vitest";
import {
  Alert, AlertTitle, Badge, Box, Button, CellUiRuntime, Dialog, DialogTitle, Tooltip,
  Progress, Root, Select, SelectContent, SelectItem, SelectTrigger, Tab, Tabs, Table, TableCell,
  TableRow, Text, TextArea,
} from "./index.js";
import { List, ListItem, Menu, MenuItem } from "./react.js";

it("switches the same runtime between interactive rich and Unicode text presentations", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 24, height: 2 } });
  const view = <Root><Button id="save" variant="surface"><Text>Save</Text></Button></Root>;
  const rich = runtime.render(view, { focusedId: "save", hoveredId: "save" });
  expect(rich.buffer.toText().split("\n")[0]).toMatch(/^ Save /u);
  runtime.setPresentation("text");
  const plain = runtime.render(view, { focusedId: "save", hoveredId: "save" });
  expect(plain.buffer.toText().split("\n")[0]).toMatch(/^\[ Save\s+\]/u);
  expect(plain.semantics.nodes.get("save")).toEqual(rich.semantics.nodes.get("save"));
  expect(plain.tree.nodes.get("save")?.focused).toBe(true);
  runtime.setPresentation("rich");
  expect(runtime.render(view).buffer.toText().split("\n")[0]).toMatch(/^ Save /u);
  runtime.dispose();
});

it("uses text geometry for status, progress, table, and surface controls", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 30, height: 18 }, presentation: "text" });
  const frame = runtime.render(<Root>
    <Alert tone="error"><AlertTitle>Save failed</AlertTitle></Alert>
    <Progress value={50} style={{ width: 10 }} />
    <Table label="Files" columns={[{ label: "Name", width: 8 }]} variant="surface">
      <TableRow><TableCell>Notes</TableCell></TableRow>
    </Table>
    <Box variant="surface"><Text>Inside</Text></Box>
    <Badge tone="success"><Text>Done</Text></Badge>
    <TextArea id="editor" label="Editor" state={{ value: "Hi", selection: { anchor: 2, head: 2 }, composition: null, scrollX: 0, scrollY: 0, revision: 0 }} />
  </Root>);
  const text = frame.buffer.toText({ trimEnd: true });
  expect(text).toContain("× Save failed");
  expect(text).toContain("[////----]");
  expect(text).toContain("┌────────┐");
  expect(text).toContain("✓ Done");
  expect(frame.tree.nodes.get("editor")?.frame).toBe("bordered");
  runtime.dispose();
});

it("keeps TextArea surface fill while presentation changes its default frame", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 30, height: 8 } });
  const state = { value: "Notes", selection: { anchor: 5, head: 5 }, composition: null,
    scrollX: 0, scrollY: 0, revision: 0 };
  const view = <Root><TextArea id="editor" state={state} style={{ width: 20, height: 4 }} /></Root>;
  const rich = runtime.render(view);
  expect(rich.tree.nodes.get("editor")).toMatchObject({ surfaceVariant: "surface", frame: "none" });
  expect(rich.layout.entries.get("editor")?.paddingInsets).toEqual({ top: 0, right: 1, bottom: 0, left: 1 });
  expect(rich.scene.entries.get("editor")?.contentBounds.x).toBe(1);
  expect(rich.buffer.get(1, 0)?.text).toBe("N");
  runtime.setPresentation("text");
  const text = runtime.render(view);
  expect(text.tree.nodes.get("editor")).toMatchObject({ surfaceVariant: "surface", frame: "bordered", borderShape: "square" });
  expect(text.layout.entries.get("editor")?.paddingInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(text.buffer.toText()).toContain("┌");
  runtime.setPresentation("rich");
  const framed = runtime.render(<Root><TextArea id="editor" state={state} variant="ghost"
    frame="bordered" borderShape="rounded" style={{ width: 20, height: 4 }} /></Root>);
  expect(framed.tree.nodes.get("editor")).toMatchObject({ surfaceVariant: "ghost", frame: "bordered", borderShape: "rounded" });
  runtime.dispose();
});

it("lets explicit TextArea padding override Rich surface defaults and preserves a narrow content Cell", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 24, height: 4 } });
  const state = { value: "A", selection: { anchor: 0, head: 0 }, composition: null,
    scrollX: 0, scrollY: 0, revision: 0 };
  const render = (style: { width: number; padding?: number; paddingLeft?: number; paddingRight?: number },
    variant?: "surface" | "ghost", frame?: "none" | "bordered") => runtime.render(
    <Root><TextArea id="editor" state={state} variant={variant} frame={frame} style={style} /></Root>,
  ).layout.entries.get("editor")!;
  expect(render({ width: 12, padding: 0 }).paddingInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(render({ width: 12, paddingLeft: 2 }).paddingInsets).toEqual({ top: 0, right: 1, bottom: 0, left: 2 });
  expect(render({ width: 2, paddingRight: 1 }).paddingInsets).toEqual({ top: 0, right: 1, bottom: 0, left: 0 });
  expect(render({ width: 12 }, "ghost").paddingInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(render({ width: 12 }, "surface", "bordered").paddingInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(render({ width: 2 }).contentRect.width).toBe(1);
  expect(render({ width: 1 }).contentRect.width).toBe(1);
  runtime.dispose();
  const narrow = new CellUiRuntime({ viewport: { width: 1, height: 4 } });
  expect(narrow.render(<Root><TextArea id="editor" state={state} /></Root>)
    .layout.entries.get("editor")).toMatchObject({ rect: { width: 1 }, paddingInsets: { left: 0, right: 0 }, contentRect: { width: 1 } });
  narrow.resize({ width: 12, height: 4 });
  expect(narrow.render(<Root><TextArea id="editor" state={state} /></Root>)
    .layout.entries.get("editor")?.paddingInsets).toEqual({ top: 0, right: 1, bottom: 0, left: 1 });
  narrow.dispose();
});

it("separates current navigation from committed selection without losing Cell ownership", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 10 }, presentation: "text" });
  const frame = runtime.render(<Root>
    <Select id="theme" style={{ width: 20 }}>
      <SelectTrigger id="trigger" label="Theme" expanded controlsId="choices"><Text>Dark</Text></SelectTrigger>
      <SelectContent id="choices"><SelectItem id="light" focused><Text>Light</Text></SelectItem><SelectItem id="dark" selected><Text>Dark</Text></SelectItem></SelectContent>
    </Select>
  </Root>, { focusedId: "light" });
  const lines = frame.buffer.toText({ trimEnd: true }).split("\n");
  expect(lines[0]).toMatch(/^\[ Dark.*▴ \]$/u);
  expect(frame.tree.nodes.get("choices")?.frame).toBe("bordered");
  expect(frame.buffer.get(0, 0)).toMatchObject({ text: "[", ownerId: "trigger" });
  expect(frame.buffer.toText()).toContain("✓ Dark");
  const collections = runtime.render(<Root>
    <List label="Files"><ListItem id="notes" focused selected><Text>Notes</Text></ListItem></List>
    <Menu label="Actions"><MenuItem id="open" focused><Text>Open</Text></MenuItem></Menu>
  </Root>, { focusedId: "notes" });
  expect(collections.buffer.toText()).toContain(">✓ Notes");
  expect(collections.buffer.toText()).toContain("  Open");
  const focusedMenu = runtime.render(<Root>
    <Menu label="Actions"><MenuItem id="open"><Text>Open</Text></MenuItem></Menu>
  </Root>, { focusedId: "open" });
  expect(focusedMenu.buffer.toText()).toContain("> Open");
  runtime.dispose();
});

it("uses one square frame for text overlays and explicit surfaces", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 48, height: 14 }, presentation: "text" });
  const frame = runtime.render(<Root>
    <Button id="save"><Text>Save</Text></Button>
    <Box id="panel" variant="surface" frame="bordered" borderShape="rounded"><Text>Panel</Text></Box>
    <Tooltip id="tip" targetId="save" text="Save document" border="none" />
    <Dialog id="dialog" border="none"><DialogTitle>Continue?</DialogTitle></Dialog>
  </Root>, { tooltipTargetId: "save" });
  for (const id of ["panel", "tip", "dialog"]) {
    const node = frame.tree.nodes.get(id)!;
    const bounds = frame.scene.entries.get(id)!.layoutBounds;
    expect(node.frame).toBe("bordered");
    expect(node.borderShape).toBe("square");
    expect(frame.buffer.get(bounds.x, bounds.y)?.text).toBe("┌");
  }
  runtime.dispose();
});

it("projects appearance without replacing declared variants across Rich–Text–Rich", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 40, height: 16 } });
  const view = <Root>
    <Button id="button" variant="ghost"><Text>Save</Text></Button>
    <Progress id="progress" label="Progress" variant="solid" value={50} style={{ width: 10 }} />
    <Tabs id="tabs" variant="solid"><Tab id="tab" selected><Text>Code</Text></Tab></Tabs>
    <Table id="table" label="Files" columns={[{ label: "Name", width: 8 }]} variant="surface">
      <TableRow><TableCell>Notes</TableCell></TableRow>
    </Table>
  </Root>;
  const variants = () => {
    const nodes = runtime.render(view).tree.nodes;
    return {
      button: nodes.get("button")?.buttonVariant,
      progress: nodes.get("progress")?.progressVariant,
      tabs: nodes.get("tabs")?.tabsVariant,
      table: nodes.get("table")?.frame,
    };
  };
  expect(variants()).toEqual({ button: "ghost", progress: "solid", tabs: "solid", table: "none" });
  runtime.setPresentation("text");
  expect(variants()).toEqual({ button: "outline", progress: "outline", tabs: "underline", table: "bordered" });
  runtime.setPresentation("rich");
  expect(variants()).toEqual({ button: "ghost", progress: "solid", tabs: "solid", table: "none" });
  runtime.dispose();
});

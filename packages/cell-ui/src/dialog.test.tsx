import { expect, it } from "vitest";
import { Button, Dialog, DialogTitle, DialogDescription, DialogFooter, Root, Text, CellUiRuntime, createTestPilot, auditSemanticSnapshot } from "./index.js";
import { dismissCommandForFocusExit } from "./interaction.js";
import { Select, SelectTrigger, SelectContent, SelectItem } from "./index.js";
import { Slider, TextInput, CellTextEditor } from "./index.js";
import { textEditorAtPoint } from "./interaction.js";

it("opens a named modal, cycles focus and restores its launcher", async () => {
  let open = false;
  let outside = false;
  let backgroundActivations = 0;
  const pilot = createTestPilot({ viewport: { width: 48, height: 14 }, render: () => <Root>
    <Button id="open"><Text>Open</Text></Button>
    {open && <Dialog id="dialog" closeOnOutsideClick={outside} initialFocusId="cancel">
      <DialogTitle id="title">Continue?</DialogTitle>
      <DialogDescription id="description">Preview only.</DialogDescription>
      <DialogFooter><Button id="confirm"><Text>Continue</Text></Button><Button id="cancel"><Text>Cancel</Text></Button></DialogFooter>
    </Dialog>}
  </Root>, onCommand: (command) => {
    if (command.type === "activate" && command.targetId === "open") { open = true; backgroundActivations++; }
    if (command.type === "dismiss") open = false;
  } });
  await pilot.click({ x: 2, y: 0 });
  expect(pilot.focus()).toBe("cancel");
  const dialog = pilot.getByRole("dialog", { name: "Continue?" });
  expect(dialog.labelledById).toBe("title");
  expect(dialog.describedById).toBe("description");
  expect(pilot.text()).toContain("Continue?");
  expect(auditSemanticSnapshot(pilot.semantics())).toEqual([]);
  expect(dismissCommandForFocusExit(pilot.frame)).toBeNull();
  await pilot.pressKey("Tab");
  expect(pilot.focus()).toBe("confirm");
  await pilot.click({ x: 2, y: 0 });
  expect(open).toBe(true);
  expect(backgroundActivations).toBe(1);
  outside = true;
  await pilot.resize({ width: 48, height: 14 });
  await pilot.click({ x: 2, y: 0 });
  expect(open).toBe(false);
  expect(backgroundActivations).toBe(1);
  expect(pilot.focus()).toBe("open");
  await pilot.pressKey("Enter");
  expect(pilot.focus()).toBe("cancel");
  await pilot.pressKey("Escape");
  expect(open).toBe(false);
  expect(pilot.focus()).toBe("open");
  pilot.dispose();
});

it("nonmodal dialogs enter content without trapping Tab or dismissing on focus exit", async () => {
  let open = false;
  const pilot = createTestPilot({ viewport: { width: 48, height: 14 }, render: () => <Root>
    <Button id="open"><Text>Open</Text></Button>
    {open && <Dialog id="dialog" modal={false} closeOnOutsideClick={false}>
      <DialogTitle>Details</DialogTitle><Button id="inside"><Text>Inside</Text></Button>
    </Dialog>}
    <Button id="after"><Text>After</Text></Button>
  </Root>, onCommand: (command) => {
    if (command.type === "activate" && command.targetId === "open") open = true;
    if (command.type === "dismiss") open = false;
  } });
  await pilot.click({ x: 2, y: 0 });
  expect(pilot.focus()).toBe("inside");
  await pilot.pressKey("Tab");
  expect(pilot.focus()).toBe("after");
  expect(open).toBe(true);
  expect(dismissCommandForFocusExit(pilot.frame)).toBeNull();
  await pilot.pressKey("Escape");
  expect(open).toBe(false);
  expect(pilot.focus()).toBe("after");
  pilot.dispose();
});

it("an empty modal receives focus and its shell remains within narrow viewports", async () => {
  const pilot = createTestPilot({ viewport: { width: 20, height: 12 }, render: () => <Root>
    <Dialog id="empty"><DialogTitle>Information</DialogTitle><DialogDescription>Read this.</DialogDescription></Dialog>
  </Root> });
  expect(pilot.focus()).toBe("empty");
  await pilot.pressKey("Tab");
  expect(pilot.focus()).toBe("empty");
  const bounds = pilot.frame.scene.entries.get("empty")!.layoutBounds;
  expect(bounds.width).toBeLessThanOrEqual(20);
  expect(bounds.x).toBe(Math.floor((20 - bounds.width) / 2));
  expect(bounds.y).toBe(Math.max(0, Math.floor((12 - bounds.height) / 2)));
  expect(auditSemanticSnapshot(pilot.semantics())).toEqual([]);
  pilot.dispose();
});

it("validates direct title composition", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 40, height: 12 } });
  expect(() => runtime.render(<Root><Dialog id="bad"><Text>Not a title</Text></Dialog></Root>)).toThrow(/DialogTitle/);
  expect(() => runtime.render(<Root><Dialog id="bad"><DialogTitle>A</DialogTitle><DialogTitle>B</DialogTitle></Dialog></Root>)).toThrow(/DialogTitle/);
  runtime.dispose();
});

it("a modal blocks background editor hits, presses and slider gestures", async () => {
  let changes = 0;
  const editor = new CellTextEditor({ value: "Background" });
  const pilot = createTestPilot({ viewport: { width: 48, height: 16 }, render: () => <Root>
    <Slider id="slider" label="Background slider" value={25} style={{ width: 10 }} />
    <TextInput id="input" label="Background input" state={editor.snapshot()} style={{ width: 12 }} />
    <Dialog id="dialog" closeOnOutsideClick={false}><DialogTitle>Modal</DialogTitle></Dialog>
  </Root>, onCommand: (command) => {
    if (command.type === "set-value") changes++;
    if (command.type === "text") editor.dispatch(command.command);
  } });
  expect(textEditorAtPoint(pilot.frame, { x: 1, y: 1 })).toBeUndefined();
  await pilot.pointerDown({ x: 1, y: 0 });
  expect(pilot.frame.tree.nodes.get("slider")?.pressActive).toBe(false);
  await pilot.pointerMove({ x: 8, y: 0 });
  await pilot.pointerUp({ x: 8, y: 0 });
  expect(changes).toBe(0);
  expect(pilot.focus()).toBe("dialog");
  pilot.dispose();
});

it("nested Select owns the first Escape and outside dismissal", async () => {
  let open = true;
  let selectOpen = true;
  const pilot = createTestPilot({ viewport: { width: 48, height: 16 }, render: () => <Root>
    {open && <Dialog id="dialog"><DialogTitle>Settings</DialogTitle>
      <Select id="theme"><SelectTrigger id="theme-trigger" expanded={selectOpen}><Text>Theme</Text></SelectTrigger>
        {selectOpen && <SelectContent id="theme-content"><SelectItem id="dark"><Text>Dark</Text></SelectItem></SelectContent>}
      </Select>
    </Dialog>}
  </Root>, onCommand: (command) => {
    if (command.type === "dismiss" && command.targetId === "theme-content") selectOpen = false;
    if (command.type === "dismiss" && command.targetId === "dialog") open = false;
    if (command.type === "set-expanded") selectOpen = command.expanded;
  } });
  await pilot.pressKey("Escape");
  expect(open).toBe(true);
  expect(selectOpen).toBe(false);
  expect(pilot.focus()).toBe("theme-trigger");
  await pilot.pressKey("Enter");
  expect(selectOpen).toBe(true);
  await pilot.click({ x: 0, y: 0 });
  expect(selectOpen).toBe(false);
  expect(open).toBe(true);
  await pilot.pressKey("Escape");
  expect(open).toBe(false);
  pilot.dispose();
});

import type { ReactNode } from "react";
import { expect, it } from "vitest";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Box, Root, Text, Checkbox, Select, SelectTrigger, Separator, CellUiRuntime, FocusManager, commandForInput, createTestPilot, auditSemanticSnapshot, hitTest } from "./index.js";
import { resolvePointerAppearance } from "./pointer.js";

it("uses the nested control column for hover and activation bounds", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 30, height: 6 } });
  const frame = runtime.render(<Root><Accordion style={{ width: 30 }}>
    <AccordionItem id="appearance" expanded>
      <AccordionTrigger><Text>Appearance</Text></AccordionTrigger>
      <AccordionContent style={{ paddingLeft: 4 }}><Box style={{ width: 15 }}>
        <Select id="theme" style={{ width: 15 }}>
          <SelectTrigger id="theme-trigger" label="Theme"><Text>Dark</Text></SelectTrigger>
        </Select>
        <Checkbox id="sound" checked><Text>Sound</Text></Checkbox>
      </Box></AccordionContent>
    </AccordionItem>
  </Accordion></Root>);
  const select = frame.scene.entries.get("theme-trigger")!.hitBounds;
  const checkbox = frame.scene.entries.get("sound")!.hitBounds;
  expect(checkbox).toMatchObject({ x: select.x, width: select.width, height: 1 });
  expect(checkbox.width).toBe(15);

  const inside = { x: checkbox.x + checkbox.width - 1, y: checkbox.y };
  const outside = { x: inside.x + 1, y: inside.y };
  expect(hitTest(frame.scene, inside)).toContain("sound");
  expect(hitTest(frame.scene, outside)).not.toContain("sound");
  expect(resolvePointerAppearance(frame, inside).hoveredId).toBe("sound");
  expect(resolvePointerAppearance(frame, outside).hoveredId).toBeNull();

  const focus = new FocusManager();
  focus.sync(frame.tree, "sound");
  expect(commandForInput({ type: "pointer", phase: "up", point: inside, button: 0 }, frame, focus))
    .toEqual({ type: "activate", targetId: "sound" });
  expect(commandForInput({ type: "pointer", phase: "up", point: outside, button: 0 }, frame, focus))
    .toBeNull();
  runtime.dispose();
});

it("independent disclosure shares commands, navigation and preserved content", async () => {
  const expanded = new Set<string>();
  let disabled = false;
  let checked = false;
  const view = () => <Root><Accordion id="settings">
    {["general", "appearance", "advanced"].map((id) => <AccordionItem key={id} id={id} expanded={expanded.has(id)} disabled={id === "appearance" && disabled}>
      <AccordionTrigger id={`${id}-trigger`}><Text>{id}</Text></AccordionTrigger>
      <AccordionContent id={`${id}-content`}>
        <Checkbox id={`${id}-check`} checked={checked}><Text>Enabled</Text></Checkbox>
      </AccordionContent>
    </AccordionItem>)}
  </Accordion></Root>;
  const pilot = createTestPilot({ viewport: { width: 24, height: 12 }, render: view, onCommand: (command) => {
    if (command.type === "set-expanded") {
      if (command.expanded) expanded.add(command.targetId); else expanded.delete(command.targetId);
    }
    if (command.type === "activate") checked = !checked;
  } });
  expect(pilot.text()).toContain("▸ general\n▸ appearance\n▸ advanced");
  expect(pilot.frame.tree.nodes.has("general-check")).toBe(true);
  expect(pilot.frame.scene.entries.has("general-check")).toBe(false);
  expect(pilot.getByRole("button", { name: "general" }).controlsId).toBe("general-content");
  await pilot.click({ x: 3, y: 0 });
  expect(expanded.has("general")).toBe(true);
  expect(pilot.text()).toContain("▾ general");
  await pilot.pressKey("ArrowDown");
  expect(pilot.focus()).toBe("appearance-trigger");
  await pilot.pressKey("Enter");
  expect([...expanded]).toEqual(["general", "appearance"]);
  await pilot.pressKey("Tab");
  expect(pilot.focus()).toBe("appearance-check");
  await pilot.pressKey(" ");
  expect(checked).toBe(true);
  expanded.delete("appearance");
  await pilot.resize({ width: 25, height: 12 });
  expect(pilot.focus()).toBe("appearance-trigger");
  disabled = true;
  await pilot.resize({ width: 24, height: 12 });
  expect(pilot.focus()).toBe("advanced-trigger");
  await pilot.pressKey("Home");
  expect(pilot.focus()).toBe("general-trigger");
  await pilot.pressKey("ArrowDown");
  expect(pilot.focus()).toBe("advanced-trigger");
  await pilot.semanticAction("advanced-trigger", "expand");
  expect(expanded.has("advanced")).toBe(true);
  expect(pilot.frame.tree.nodes.get("advanced-trigger")?.activationFlash).toBe(false);
  expect(auditSemanticSnapshot(pilot.semantics())).toEqual([]);
  expect(pilot.text()).toContain("[x] Enabled");
  pilot.dispose();
});

it("validates structure and retains layout parity across collapsed content", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 16, height: 8 } });
  expect(() => runtime.render(<Root><AccordionItem id="orphan" /></Root>)).toThrow(/Accordion/);
  const view = (expanded: boolean) => <Root><Accordion><AccordionItem id="a" expanded={expanded}>
    <AccordionTrigger><Text>A</Text></AccordionTrigger><AccordionContent><Text>Content</Text></AccordionContent>
  </AccordionItem></Accordion></Root>;
  const opened = runtime.render(view(true));
  const collapsed = runtime.render(view(false));
  const fresh = new CellUiRuntime({ viewport: { width: 16, height: 8 } });
  expect(collapsed.buffer).toEqual(fresh.render(view(false)).buffer);
  expect(collapsed.layout).not.toBe(opened.layout);
  runtime.dispose(); fresh.dispose();
});

it("accepts separators only between items without changing accordion navigation", async () => {
  const item = (id: string) => <AccordionItem key={id} id={id}>
    <AccordionTrigger id={`${id}-trigger`}><Text>{id}</Text></AccordionTrigger>
    <AccordionContent><Text>{id} content</Text></AccordionContent>
  </AccordionItem>;
  const renderChildren = (children: ReactNode) => {
    const runtime = new CellUiRuntime({ viewport: { width: 16, height: 7 } });
    try { return runtime.render(<Root><Accordion>{children}</Accordion></Root>); }
    finally { runtime.dispose(); }
  };
  for (const children of [
    [<Separator key="start" />, item("a")],
    [item("a"), <Separator key="end" />],
    [item("a"), <Separator key="first" />, <Separator key="second" />, item("b")],
    [item("a"), <Text key="other">Other</Text>, item("b")],
  ]) expect(() => renderChildren(children)).toThrow(/Accordion requires AccordionItem/);

  let separated = false;
  const view = () => <Root><Accordion style={{ width: 16 }}>
    {item("a")}
    {separated ? <Separator id="divider" /> : null}
    {item("b")}
  </Accordion></Root>;
  const pilot = createTestPilot({ viewport: { width: 16, height: 7 }, render: view });
  expect(pilot.semantics().nodes.has("divider")).toBe(false);
  separated = true;
  await pilot.resize({ width: 16, height: 7 });
  expect(pilot.semantics().nodes.get("divider")).toMatchObject({ role: "separator", orientation: "horizontal" });
  expect(pilot.text()).toContain("▸ a\n────────────────\n▸ b");
  await pilot.pressKey("Tab");
  await pilot.pressKey("ArrowDown");
  expect(pilot.focus()).toBe("b-trigger");
  separated = false;
  await pilot.resize({ width: 16, height: 7 });
  expect(pilot.focus()).toBe("b-trigger");
  expect(pilot.semantics().nodes.has("divider")).toBe(false);
  pilot.dispose();
});

it("restores the outer header when nested content closes and propagates group disablement", async () => {
  let expanded = true;
  let disabled = false;
  const pilot = createTestPilot({ viewport: { width: 24, height: 10 }, render: () => <Root>
    <Accordion disabled={disabled}><AccordionItem id="outer" expanded={expanded}>
      <AccordionTrigger id="outer-trigger"><Text>Outer</Text></AccordionTrigger>
      <AccordionContent><Box><Accordion><AccordionItem id="inner" expanded>
        <AccordionTrigger id="inner-trigger"><Text>Inner</Text></AccordionTrigger>
        <AccordionContent><Checkbox id="nested-check"><Text>Nested</Text></Checkbox></AccordionContent>
      </AccordionItem></Accordion></Box></AccordionContent>
    </AccordionItem></Accordion>
  </Root> });
  await pilot.pressKey("Tab");
  expect(pilot.focus()).toBe("outer-trigger");
  await pilot.pressKey("Tab");
  expect(pilot.focus()).toBe("inner-trigger");
  await pilot.pressKey("Tab");
  expect(pilot.focus()).toBe("nested-check");
  expanded = false;
  await pilot.resize({ width: 25, height: 10 });
  expect(pilot.focus()).toBe("outer-trigger");
  expect(pilot.frame.scene.entries.has("inner-trigger")).toBe(false);
  expanded = true;
  disabled = true;
  await pilot.resize({ width: 24, height: 10 });
  expect(pilot.frame.tree.nodes.get("nested-check")?.disabled).toBe(true);
  expect(pilot.focus()).toBeNull();
  expect(auditSemanticSnapshot(pilot.semantics())).toEqual([]);
  pilot.dispose();
});

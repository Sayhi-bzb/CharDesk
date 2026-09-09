import { expect, it } from "vitest";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Box, Root, Text, Checkbox, CellUiRuntime, createTestPilot, auditSemanticSnapshot } from "./index.js";

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

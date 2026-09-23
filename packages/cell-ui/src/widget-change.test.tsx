import { expect, it } from "vitest";
import { Button, Root, Text } from "./react.js";
import { CellUiRuntime } from "./runtime.js";
import { classifyWidgetChange, sameNodeContent } from "./widget-change.js";

it("keeps content mutations distinct from phase invalidation", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 2 } });
  const before = runtime.render(<Root><Button id="action"><Text>Run</Text></Button></Root>).tree.nodes.get("action")!;

  expect(sameNodeContent(before, { ...before, radioValue: "run" })).toBe(false);
  expect(classifyWidgetChange(before, { ...before, radioValue: "run" })).toEqual({
    layout: false, geometry: false, paint: false, semantics: false,
  });
  expect(classifyWidgetChange(before, { ...before, buttonSize: "lg" })).toMatchObject({
    layout: true, geometry: false, paint: false, semantics: false,
  });
  expect(classifyWidgetChange(before, { ...before, scrollOffset: { x: 0, y: 1 } })).toMatchObject({
    layout: false, geometry: true, paint: false, semantics: false,
  });
  expect(classifyWidgetChange(before, { ...before, selected: true })).toMatchObject({
    layout: false, geometry: false, paint: true, semantics: true,
  });
  expect(classifyWidgetChange(before, { ...before, label: "Action" })).toMatchObject({
    layout: false, geometry: false, paint: false, semantics: true,
  });

  runtime.dispose();
});

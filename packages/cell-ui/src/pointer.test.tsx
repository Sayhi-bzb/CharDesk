import { expect, it } from "vitest";
import { CellUiRuntime, Root, ListItem, Text } from "./index.js";
import { resolvePointerAppearance } from "./pointer.js";

it("hover follows the visible owner and rejects disabled, missing and plain content", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 10, height: 4 } });
  const view = (disabled: boolean) => <Root>
    <ListItem id="action" disabled={disabled}><Text>Action</Text></ListItem>
    <Text>Plain</Text>
  </Root>;
  const frame = runtime.render(view(false));
  expect(resolvePointerAppearance(frame, { x: 0, y: 0 })).toEqual({ hoveredId: "action", cursor: "pointer" });
  expect(resolvePointerAppearance(frame, { x: 0, y: 1 })).toEqual({ hoveredId: null, cursor: "default" });
  expect(resolvePointerAppearance(frame, { x: 0, y: 3 })).toEqual({ hoveredId: null, cursor: "default" });
  expect(resolvePointerAppearance(runtime.render(view(true)), { x: 0, y: 0 })).toEqual({ hoveredId: null, cursor: "default" });
  expect(resolvePointerAppearance(runtime.render(<Root />), { x: 0, y: 0 })).toEqual({ hoveredId: null, cursor: "default" });
  runtime.dispose();
});

import { expect, it } from "vitest";
import { Button, Root, Text, CellUiRuntime, CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME, INSTANT_CELL_FEEDBACK } from "./index.js";
import { resolvePrimitiveAppearance } from "./primitive-appearance.js";

it("uses the same inverse pair for focus and press across the entire control", () => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const primary = { color: "#ffeedd", backgroundColor: "#123456" };
    const runtime = new CellUiRuntime({
      viewport: { width: 10, height: 1 },
      theme: { ...theme, buttonPrimaryStyle: primary },
      feedback: INSTANT_CELL_FEEDBACK,
    });
    const view = <Root id="root"><Button id="save"><Text>Save</Text></Button></Root>;
    const focused = runtime.render(view, { focusedId: "save", hoveredId: "save" });
    for (let x = 0; x < 6; x++) {
      expect(focused.buffer.get(x, 0)?.style).toMatchObject({ color: primary.backgroundColor, backgroundColor: primary.color });
    }
    const pressed = runtime.render(view, { focusedId: "save", pressActiveId: "save", activationFlashId: "save" });
    for (let x = 0; x < 6; x++) {
      expect(pressed.buffer.get(x, 0)?.style).toMatchObject({
        color: primary.backgroundColor, backgroundColor: primary.color,
      });
    }
    expect(runtime.feedback.activationBlinkCount).toBe(0);
    runtime.setFeedback();
    expect(runtime.feedback.activationBlinkCount).toBe(2);
    runtime.dispose();
  }
});

it("disabled primary controls discard emphasis even with stale focus and press", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 10, height: 1 } });
  const frame = runtime.render(
    <Root id="root"><Button id="save" disabled><Text>Save</Text></Button></Root>,
    { focusedId: "save", hoveredId: "save", pressActiveId: "save" },
  );
  expect(frame.buffer.get(0, 0)?.style).toMatchObject({
    backgroundColor: "#FFFFFF", color: "#777777",
  });
  runtime.dispose();
});

it("separates highlight, committed state and exclusive confirmation phases", () => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const state = { disabled: false, highlighted: true, pressed: false, confirming: false, flash: false };
    const inverse = { color: theme.background, backgroundColor: theme.foreground };
    expect(resolvePrimitiveAppearance({}, state, theme)).toEqual(inverse);
    expect(resolvePrimitiveAppearance({}, { ...state, pressed: true }, theme)).toEqual(inverse);
    expect(resolvePrimitiveAppearance({}, { ...state, confirming: true }, theme)).toEqual({});
    expect(resolvePrimitiveAppearance({}, { ...state, confirming: true, flash: true }, theme)).toEqual(inverse);
    expect(resolvePrimitiveAppearance({}, { ...state, disabled: true, flash: true }, theme)).toEqual(theme.disabledStyle);
  }
});

import { expect, it } from "vitest";
import { Button, Checkbox, Toggle, RadioGroup, RadioItem, Slider, RangeSlider, RangeSliderThumb, Root, Text, CellUiRuntime, CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME, INSTANT_CELL_FEEDBACK } from "./index.js";
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

it.each(["checkbox", "toggle", "radio"])("%s marks persist without background and pointer/keyboard highlight the same rectangle", (kind) => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 }, theme });
    const view = <Root id="root">{kind === "toggle"
      ? <Toggle id="check" pressed style={{ width: 10 }}><Text>Save</Text></Toggle>
      : kind === "radio"
        ? <RadioGroup value="save"><RadioItem id="check" value="save" style={{ width: 10 }}><Text>Save</Text></RadioItem></RadioGroup>
        : <Checkbox id="check" checked style={{ width: 10 }}><Text>Save</Text></Checkbox>}</Root>;
    const base = runtime.render(view);
    expect(base.buffer.toText()).toContain(kind === "toggle" ? "● Save" : kind === "radio" ? "(●) Save" : "[x]");
    expect(base.buffer.get(9, 0)?.style.backgroundColor).toBeUndefined();
    const pointer = runtime.render(view, { focusedId: "check", focusVisible: false, hoveredId: "check" });
    const keyboard = runtime.render(view, { focusedId: "check", focusVisible: true });
    for (let x = 0; x < 10; x++) {
      expect(pointer.buffer.get(x, 0)?.style).toEqual(keyboard.buffer.get(x, 0)?.style);
      expect(keyboard.buffer.get(x, 0)?.style).toMatchObject({ color: theme.background, backgroundColor: theme.foreground });
      expect(keyboard.buffer.get(x, 0)?.style.bold).not.toBe(true);
    }
    const leave = runtime.render(view, { focusedId: "check", focusVisible: false });
    expect(leave.buffer.get(9, 0)?.style.backgroundColor).toBeUndefined();
    expect(leave.semantics.focusedId).toBe("check");
    runtime.dispose();
  }
});

it.each(["slider", "range"])("%s uses global thumb tokens for all input sources and clears disabled emphasis", (kind) => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 }, theme: { ...theme, sliderEmphasizedThumb: "@" } });
    const view = (disabled = false) => <Root id="root">{kind === "slider"
      ? <Slider id="target" label="Volume" value={40} disabled={disabled} style={{ width: 12 }} />
      : <RangeSlider id="range" label="Volume" disabled={disabled} style={{ width: 12 }}>
        <RangeSliderThumb id="target" label="Minimum" value={40} />
        <RangeSliderThumb id="upper" label="Maximum" value={80} />
      </RangeSlider>}</Root>;
    for (const state of [
      { hoveredId: "target", focusVisible: false },
      { focusedId: "target", focusVisible: true },
      { manipulatingIds: new Set(["target"]) },
    ]) {
      const frame = runtime.render(view(), state);
      expect(frame.buffer.toText().split("@")).toHaveLength(2);
      for (let x = 0; x < 12; x++) {
        expect(frame.buffer.get(x, 0)?.style.backgroundColor).toBeUndefined();
        expect(frame.buffer.get(x, 0)?.style.bold).not.toBe(true);
      }
      expect(runtime.render(view(true), state).buffer.toText()).not.toContain("@");
    }
    const leave = runtime.render(view(), { focusedId: "target", focusVisible: false });
    expect(leave.buffer.toText()).not.toContain("@");
    expect(leave.semantics.focusedId).toBe("target");
    runtime.dispose();
  }
});

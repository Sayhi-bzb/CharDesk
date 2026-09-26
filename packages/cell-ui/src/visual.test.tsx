import { expect, it } from "vitest";
import {
  Box,
  Alert,
  AlertTitle,
  Button,
  Checkbox,
  Toggle,
  RadioGroup,
  RadioItem,
  Slider,
  Root,
  Text,
  CellUiRuntime,
  CLASSIC_MAC_LIGHT_THEME,
  CLASSIC_MAC_DARK_THEME,
  INSTANT_CELL_FEEDBACK,
  Dialog,
  DialogTitle,
  Tooltip,
} from "./index.js";
import { Overlay, RangeSlider, RangeSliderThumb } from "./react.js";
import { resolvePrimitiveAppearance } from "./primitive-appearance.js";

it("uses the same inverse pair for focus and press across the entire control", () => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const solid = { color: "#ffeedd", backgroundColor: "#123456" };
    const runtime = new CellUiRuntime({
      viewport: { width: 10, height: 1 },
      theme: { ...theme, buttonSolidStyle: solid },
      feedback: INSTANT_CELL_FEEDBACK,
    });
    const view = <Root id="root"><Button id="save"><Text>Save</Text></Button></Root>;
    const focused = runtime.render(view, { focusedId: "save", hoveredId: "save" });
    for (let x = 0; x < 6; x++) {
      expect(focused.buffer.get(x, 0)?.style).toMatchObject({ color: solid.backgroundColor, backgroundColor: solid.color });
    }
    const pressed = runtime.render(view, { focusedId: "save", pressActiveId: "save", activationFlashId: "save" });
    for (let x = 0; x < 6; x++) {
      expect(pressed.buffer.get(x, 0)?.style).toMatchObject({
        color: solid.backgroundColor, backgroundColor: solid.color,
      });
    }
    expect(runtime.feedback.activationBlinkCount).toBe(0);
    runtime.setFeedback();
    expect(runtime.feedback.activationBlinkCount).toBe(2);
    runtime.dispose();
  }
});

it("resolves nested ghost controls against their rendered ancestor surface", () => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 2 }, theme });
    const view = <Root id="root">
      <Box variant="surface" style={{ width: 10, height: 2 }}>
        <Box variant="ghost">
          <Button id="action" variant="ghost" style={{ width: 8 }}><Text>Run</Text></Button>
        </Box>
      </Box>
    </Root>;
    const idle = runtime.render(view);
    expect(idle.buffer.get(0, 0)?.style.backgroundColor)
      .toBe(theme.elevatedSurfaceStyle.backgroundColor);
    expect(idle.buffer.get(7, 0)?.style.backgroundColor)
      .toBe(theme.elevatedSurfaceStyle.backgroundColor);

    const focused = runtime.render(view, { focusedId: "action", focusVisible: true });
    for (let x = 0; x < 8; x++) {
      expect(focused.buffer.get(x, 0)?.style).toMatchObject({
        color: theme.elevatedSurfaceStyle.backgroundColor,
        backgroundColor: theme.foreground,
      });
    }
    runtime.dispose();
  }
});

it("resolves a ghost against the nearest explicit parent background", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 2 } });
  const frame = runtime.render(<Root>
    <Box variant="ghost" textStyle={{ backgroundColor: "#123456" }} style={{ width: 12, height: 2 }}>
      <Button id="action" variant="ghost" style={{ width: 8 }}><Text>Run</Text></Button>
    </Box>
  </Root>);
  expect(frame.buffer.get(7, 0)?.style.backgroundColor).toBe("#123456");
  expect(frame.buffer.get(10, 1)?.style.backgroundColor).toBe("#123456");
  runtime.dispose();
});

it("uses the page background for every root-level ghost, including floating surfaces", () => {
  const theme = { ...CLASSIC_MAC_LIGHT_THEME,
    background: "#f8f8f8", surfaceStyle: { backgroundColor: "#dddddd" } };
  const runtime = new CellUiRuntime({ viewport: { width: 48, height: 14 }, theme });
  const base = runtime.render(<Root><Box variant="ghost" style={{ width: 12, height: 2 }}>
    <Button id="save" variant="ghost" style={{ width: 8 }}><Text>Save</Text></Button>
  </Box></Root>);
  expect(base.buffer.get(7, 0)?.style.backgroundColor).toBe(theme.background);
  expect(base.buffer.get(10, 1)?.style.backgroundColor).toBe(theme.background);

  const overlay = runtime.render(<Root>
    <Text>{"X".repeat(12)}</Text>
    <Overlay id="floating" variant="ghost" position={{ x: 0, y: 0 }}
      style={{ width: 12, height: 2 }}><Text>Open</Text></Overlay>
  </Root>);
  expect(overlay.buffer.get(10, 0)).toMatchObject({ text: " ",
    style: { backgroundColor: theme.background } });

  const alert = runtime.render(<Root><Alert id="notice" variant="ghost" tone="warning">
    <AlertTitle>Careful</AlertTitle>
  </Alert></Root>);
  expect(alert.buffer.get(10, 0)?.style.backgroundColor).toBe(theme.background);
  expect(alert.buffer.get(2, 0)?.style.color).toBe(theme.badgeStyles.warning.color);

  const dialog = runtime.render(<Root><Dialog id="dialog" variant="ghost" border="none">
    <DialogTitle>Details</DialogTitle>
  </Dialog></Root>);
  const dialogBounds = dialog.scene.entries.get("dialog")!.layoutBounds;
  expect(dialog.buffer.get(dialogBounds.x + 1, dialogBounds.y + 1)?.style.backgroundColor)
    .toBe(theme.background);

  const tooltip = runtime.render(<Root><Button id="target"><Text>Target</Text></Button>
    <Tooltip id="tip" targetId="target" text="Help" variant="ghost" border="none" />
  </Root>, { tooltipTargetId: "target" });
  const tooltipBounds = tooltip.scene.entries.get("tip")!.layoutBounds;
  expect(tooltip.buffer.get(tooltipBounds.x + 1, tooltipBounds.y)?.style.backgroundColor)
    .toBe(theme.background);
  runtime.dispose();
});

it("disabled solid controls discard emphasis even with stale focus and press", () => {
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

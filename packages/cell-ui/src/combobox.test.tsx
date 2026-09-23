import { expect, it } from "vitest";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  Root,
  Text,
  CellTextEditor,
  CellUiRuntime,
  FocusManager,
  CLASSIC_MAC_DARK_THEME,
  CLASSIC_MAC_LIGHT_THEME,
  auditSemanticSnapshot,
  commandForInput,
  textEditorAtPoint,
} from "./index.js";
import { filterCellComboboxItems } from "./browser-combobox.js";
import { formatCellBuffer } from "./probe.js";

const items = [
  { id: "maple", label: "Maple Mono" },
  { id: "jetbrains", label: "JetBrains Mono" },
  { id: "plex", label: "IBM Plex Mono" },
  { id: "fusion", label: "融合像素字体" },
] as const;

it("opens from the whole input row, keeps editing open, and toggles from the arrow", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 } });
  const editor = new CellTextEditor({ value: "Maple" });
  const focus = new FocusManager();
  const render = (expanded: boolean, disabled = false) => runtime.render(<Root>
    <Combobox id="font" style={{ width: 16 }} disabled={disabled}>
      <ComboboxInput id="input" label="Font" state={editor.snapshot()} expanded={expanded} />
      {expanded && <ComboboxContent id="content">
        <ComboboxItem id="maple"><Text>Maple</Text></ComboboxItem>
      </ComboboxContent>}
    </Combobox>
  </Root>);
  const closed = render(false);
  const bounds = closed.scene.entries.get("input")!.decorationBounds;
  const textPoint = { x: bounds.x + 1, y: bounds.y };
  const arrowPoint = { x: bounds.x + bounds.width - 2, y: bounds.y };
  const guardPoint = { x: bounds.x + bounds.width - 1, y: bounds.y };
  const pointer = (point: typeof textPoint) => ({ type: "pointer" as const, phase: "down" as const, point, button: 0 });
  expect(textEditorAtPoint(closed, textPoint)?.id).toBe("input");
  expect(commandForInput(pointer(textPoint), closed, focus))
    .toEqual({ type: "set-expanded", targetId: "input", expanded: true });
  expect(commandForInput(pointer(arrowPoint), closed, focus))
    .toEqual({ type: "set-expanded", targetId: "input", expanded: true });
  expect(commandForInput(pointer(guardPoint), closed, focus))
    .toEqual({ type: "set-expanded", targetId: "input", expanded: true });

  const open = render(true);
  expect(commandForInput(pointer(textPoint), open, focus)).toBeNull();
  expect(textEditorAtPoint(open, textPoint)?.id).toBe("input");
  expect(commandForInput(pointer(arrowPoint), open, focus))
    .toEqual({ type: "set-expanded", targetId: "input", expanded: false });
  expect(commandForInput(pointer(guardPoint), open, focus))
    .toEqual({ type: "set-expanded", targetId: "input", expanded: false });
  expect(commandForInput(pointer({ x: 23, y: 7 }), open, focus))
    .toEqual({ type: "dismiss", targetId: "content" });
  expect(commandForInput(pointer(textPoint), render(false, true), focus)).toBeNull();
  runtime.dispose();
});

it("treats its trailing indicator and guard as disclosure chrome", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 16, height: 3 } });
  const editor = new CellTextEditor({ value: "Maple" });
  const focus = new FocusManager();
  const frame = runtime.render(<Root><Combobox id="font" style={{ width: 16 }}>
    <ComboboxInput id="input" label="Font" state={editor.snapshot()} expanded />
    <ComboboxContent id="content"><ComboboxItem id="maple"><Text>Maple</Text></ComboboxItem></ComboboxContent>
  </Combobox></Root>);
  const pointer = (x: number) => ({
    type: "pointer" as const, phase: "down" as const, point: { x, y: 0 }, button: 0,
  });
  expect(frame.buffer.toText({ region: { x: 0, y: 0, width: 16, height: 1 } }))
    .toBe("> Maple       ▴ ");
  expect(frame.buffer.get(1, 0)).toMatchObject({ text: " ", ownerId: "input" });
  for (const x of [14, 15]) {
    expect(commandForInput(pointer(x), frame, focus))
      .toEqual({ type: "set-expanded", targetId: "input", expanded: false });
  }
  expect(commandForInput(pointer(13), frame, focus)).toBeNull();
  runtime.dispose();
});

for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
  it(`binds Combobox input and dropdown background (${theme.background})`, () => {
    const runtime = new CellUiRuntime({ viewport: { width: 18, height: 6 }, theme });
    const editor = new CellTextEditor({ value: "Maple" });
    const view = (variant: "ghost" | "surface", frame: "none" | "bordered", disabled = false) => (
      <Root><Combobox id="font" variant={variant} style={{ width: 16 }}>
        <ComboboxInput id="input" label="Font" state={editor.snapshot()} expanded disabled={disabled} />
        <ComboboxContent id="content" frame={frame}>
          <ComboboxItem id="maple"><Text>Maple</Text></ComboboxItem>
        </ComboboxContent>
      </Combobox></Root>
    );
    for (const variant of ["ghost", "surface"] as const) {
      for (const frame of ["none", "bordered"] as const) {
        const result = runtime.render(view(variant, frame));
        const content = result.scene.entries.get("content")!.layoutBounds;
        expect(content.height).toBe(frame === "bordered" ? 3 : 1);
        expect(result.buffer.get(14, 0)?.style.backgroundColor)
          .toBe(variant === "surface" ? theme.elevatedSurfaceStyle.backgroundColor : undefined);
        expect(result.buffer.get(14, content.y + (frame === "bordered" ? 1 : 0))?.style.backgroundColor)
          .toBe(variant === "surface" ? theme.elevatedSurfaceStyle.backgroundColor : undefined);
      }
    }
    const ghostDisabled = runtime.render(view("ghost", "none", true), {
      focusedId: "input", activeFocusId: "input",
    });
    expect(ghostDisabled.buffer.get(14, 0)?.style.backgroundColor).toBeUndefined();
    runtime.dispose();
  });

  it(`keeps the idle ComboboxInput elevated (${theme.background})`, () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 }, theme });
    const editor = new CellTextEditor({ value: "Maple" });
    const view = (disabled = false, backgroundColor?: string) => <Root>
      <Combobox style={{ width: 12 }}>
        <ComboboxInput id="input" label="Font" state={editor.snapshot()} disabled={disabled}
          textStyle={backgroundColor ? { backgroundColor } : undefined} />
      </Combobox>
    </Root>;
    const idle = runtime.render(view());
    for (let x = 0; x < 12; x++) {
      expect(idle.buffer.get(x, 0)?.style.backgroundColor)
        .toBe(theme.elevatedSurfaceStyle.backgroundColor);
    }
    const active = runtime.render(view(), { focusedId: "input", activeFocusId: "input" });
    expect(active.buffer.get(1, 0)?.style.backgroundColor)
      .toBe(theme.elevatedSurfaceStyle.backgroundColor);
    const disabled = runtime.render(view(true), { focusedId: "input", activeFocusId: "input" });
    expect(disabled.buffer.get(1, 0)?.style).toMatchObject({
      ...theme.elevatedSurfaceStyle,
      ...theme.disabledStyle,
    });
    const custom = runtime.render(view(false, "#abcdef"));
    expect(custom.buffer.get(1, 0)?.style.backgroundColor).toBe("#abcdef");
    runtime.dispose();
  });

  it(`keeps Combobox selection understated until editing starts (${theme.background})`, () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 }, theme });
    const editor = new CellTextEditor({ value: "Maple" });
    editor.dispatch({ type: "select-all" });
    for (const variant of ["ghost", "surface"] as const) {
      const view = <Root><Combobox variant={variant} style={{ width: 12 }}>
        <ComboboxInput id="input" label="Font" state={editor.snapshot()} />
      </Combobox></Root>;
      const background = variant === "surface" ? theme.elevatedSurfaceStyle.backgroundColor : undefined;
      const idle = runtime.render(view);
      expect(idle.buffer.get(1, 0)?.style.underline).not.toBe(true);
      expect(idle.buffer.get(1, 0)?.style.backgroundColor).toBe(background);
      expect(idle.buffer.get(9, 0)?.style.backgroundColor).toBe(background);
      const active = runtime.render(view, { focusedId: "input", activeFocusId: "input" });
      expect(active.buffer.get(2, 0)?.style).toMatchObject({ underline: true });
      expect(active.buffer.get(2, 0)?.style.backgroundColor).toBe(background);
      expect(active.buffer.get(1, 0)?.style.underline).not.toBe(true);
      expect(active.buffer.get(9, 0)?.style.backgroundColor).toBe(background);
      const blurred = runtime.render(view, { focusedId: "input", activeFocusId: null });
      expect(blurred.buffer.get(1, 0)?.style.underline).not.toBe(true);
    }
    runtime.dispose();
  });
}

it("filters Combobox candidates by stable, case-insensitive substring", () => {
  expect(filterCellComboboxItems(items, "mono").map(({ id }) => id))
    .toEqual(["maple", "jetbrains", "plex"]);
  expect(filterCellComboboxItems(items, "MAPLE").map(({ id }) => id)).toEqual(["maple"]);
  expect(filterCellComboboxItems(items, "像素").map(({ id }) => id)).toEqual(["fusion"]);
  expect(filterCellComboboxItems(items, "  ")).toBe(items);
});

it("projects one focused Combobox with a separate active option", () => {
  const editor = new CellTextEditor({ value: "Maple Mono" });
  const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 } });
  const frame = runtime.render(<Root><Combobox id="font" style={{ width: 22 }}>
    <ComboboxInput id="font-input" label="Font" state={editor.snapshot()} expanded
      activeDescendantId="jetbrains" focused />
    <ComboboxContent id="font-content" label="Font options">
      <ComboboxItem id="maple" selected><Text>Maple Mono</Text></ComboboxItem>
      <ComboboxItem id="jetbrains" active><Text>JetBrains Mono</Text></ComboboxItem>
      <ComboboxItem id="plex"><Text>IBM Plex Mono</Text></ComboboxItem>
    </ComboboxContent>
  </Combobox></Root>);

  const input = frame.semantics.nodes.get("font-input")!;
  expect(input.role).toBe("combobox");
  expect(input.controlsId).toBe("font-content");
  expect(input.activeDescendantId).toBe("jetbrains");
  expect(frame.semantics.nodes.get("jetbrains")?.focused).toBe(false);
  expect(frame.layout.entries.get("font-input")).toMatchObject({
    rect: { x: 0, y: 0, width: 22, height: 1 },
    borderInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    paddingInsets: { top: 0, right: 3, bottom: 0, left: 2 },
  });
  expect(frame.scene.entries.get("font-content")?.layoutBounds.y).toBe(1);
  expect(frame.tree.nodes.get("font-content")?.surfaceVariant).toBeNull();
  expect(frame.tree.nodes.get("font")?.surfaceVariant).toBe("surface");
  expect(frame.layout.entries.get("font-content")?.borderInsets)
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(frame.buffer.get(20, 1)?.style.backgroundColor).toBe("#E6E6E6");
  expect(formatCellBuffer(frame.buffer, { trimEnd: true })).toMatch(/Maple Mono\s+✓/);
  expect(formatCellBuffer(frame.buffer, { trimEnd: true })).toContain("JetBrains Mono");
  expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
  runtime.dispose();
});

it("rejects composition that can split focus and candidate ownership", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 6 } });
  const editor = new CellTextEditor();
  expect(() => runtime.render(<Root><ComboboxInput state={editor.snapshot()} /></Root>))
    .toThrow(/direct children of Combobox/);
  expect(() => runtime.render(<Root><Combobox><ComboboxInput state={editor.snapshot()} expanded
    activeDescendantId="a" /><ComboboxContent><ComboboxItem id="a"><Text>A</Text></ComboboxItem>
  </ComboboxContent></Combobox></Root>)).toThrow(/active Item/);
  runtime.dispose();
});

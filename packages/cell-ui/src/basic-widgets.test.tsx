import { describe, expect, it } from "vitest";
import {
  Root, Text, Toggle, Progress, Separator, RadioGroup, RadioItem, CellUiRuntime,
  FocusManager, commandForInput, createKeyInput, auditSemanticSnapshot,
  activationFeedbackTargetForCommand, CLASSIC_MAC_LIGHT_THEME, Button, ActivationFeedbackManager,
  type SeparatorVariant,
} from "./index.js";

describe("basic Cell widgets", () => {
  it("clips status-light chrome and consumes global glyphs without shifting the label", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 }, theme: { toggleOffIndicator: "·", toggleOnIndicator: "◆" } });
    const view = (pressed: boolean, width = 8, disabled = false) => <Root>
      <Toggle id="light" label="Bold" pressed={pressed} disabled={disabled} style={{ width }}><Text>Bold</Text></Toggle>
    </Root>;
    expect(runtime.render(view(false)).buffer.toText({ trimEnd: true })).toBe(" · Bold");
    expect(runtime.render(view(true)).buffer.toText({ trimEnd: true })).toBe(" ◆ Bold");
    for (const width of [1, 2, 3, 4, 5]) {
      const frame = runtime.render(view(true, width));
      expect(frame.buffer.toText({ trimEnd: true })).toBe(
        width === 1 ? "◆" : width === 5 ? " ◆ B" : " ◆",
      );
      expect(frame.buffer.get(width, 0)?.ownerId).not.toBe("light");
    }
    const disabled = runtime.render(view(true, 8, true), { hoveredId: "light", focusedId: "light", pressActiveId: "light", activationFlashId: "light" });
    expect(disabled.buffer.toText({ trimEnd: true })).toBe(" ◆ Bold");
    expect(disabled.buffer.get(1, 0)?.style).toMatchObject(CLASSIC_MAC_LIGHT_THEME.disabledStyle);
    expect(disabled.buffer.get(1, 0)?.style.backgroundColor).toBeUndefined();
    const padded = runtime.render(<Root><Toggle id="padded" style={{ paddingLeft: 2, paddingRight: 2 }}>
      <Text>Bold</Text>
    </Toggle></Root>);
    expect(padded.layout.entries.get("padded")?.paddingInsets)
      .toEqual({ top: 0, right: 3, bottom: 0, left: 5 });
    expect(padded.buffer.get(0, 0)).toMatchObject({ text: " ", ownerId: "padded" });
    expect(padded.buffer.get(1, 0)).toMatchObject({ text: "·", ownerId: "padded" });
    expect(padded.buffer.get(11, 0)).toMatchObject({ text: " ", ownerId: "padded" });
    runtime.dispose();
  });
  it("uses one radio Tab stop between neighboring controls", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
    const frame = runtime.render(<Root>
      <Button id="before"><Text>Before</Text></Button>
      <RadioGroup label="Choice" value="b">
        <RadioItem id="a" value="a"><Text>A</Text></RadioItem>
        <RadioItem id="b" value="b"><Text>B</Text></RadioItem>
      </RadioGroup>
      <Button id="after"><Text>After</Text></Button>
    </Root>);
    const focus = new FocusManager();
    focus.sync(frame.tree, "before");
    expect(focus.tab(frame.tree, 1)).toBe("b");
    focus.sync(frame.tree, "a");
    expect(focus.tab(frame.tree, 1)).toBe("after");
    expect(focus.tab(frame.tree, -1)).toBe("before");
    focus.sync(frame.tree, "after");
    expect(focus.tab(frame.tree, 1)).toBeNull();
    runtime.dispose();
  });

  it.each(["toggle", "radio"] as const)("%s shares classic and instant confirmation", (kind) => {
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 1 } });
    const frame = runtime.render(<Root>{kind === "toggle"
      ? <Toggle id="target" label="Bold"><Text>B</Text></Toggle>
      : <RadioGroup label="Choice"><RadioItem id="target" value="a"><Text>A</Text></RadioItem></RadioGroup>}
    </Root>);
    const manager = new ActivationFeedbackManager();
    expect(manager.start(frame, { type: "activate", targetId: "target" }, 0)).toBeNull();
    expect(manager.running).toBe(false);
    expect(manager.start(frame, { type: "activate", targetId: "target" }, 2)).toBe("target");
    expect(manager.running).toBe(true);
    runtime.dispose();
  });
  it("updates persistent toggle state without layout and paints its entire rectangle", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 1 } });
    const view = (pressed: boolean) => <Root id="root" style={{ direction: "row" }}>
      <Toggle id="bold" label="Bold" pressed={pressed}><Text>B</Text></Toggle>
    </Root>;
    const first = runtime.render(view(false), { hoveredId: "bold" });
    expect(first.buffer.toText({ trimEnd: true })).toBe(" ○ B");
    for (let x = 0; x < 5; x++) expect(first.buffer.get(x, 0)?.style.backgroundColor).toBe("#000000");
    const selected = runtime.render(view(true));
    expect(selected.layout).toBe(first.layout);
    expect(selected.buffer.toText({ trimEnd: true })).toBe(" ● B");
    for (let x = 0; x < 5; x++) expect(selected.buffer.get(x, 0)?.style.backgroundColor).toBeUndefined();
    expect(selected.semantics.nodes.get("bold")).toMatchObject({ role: "button", pressed: true });
    const flash = runtime.render(view(true), { activationFlashId: "bold" });
    expect(flash.buffer.get(3, 0)?.style.backgroundColor).toBe(CLASSIC_MAC_LIGHT_THEME.foreground);
    expect(auditSemanticSnapshot(flash.semantics)).toEqual([]);
    const focus = new FocusManager();
    focus.sync(selected.tree, "bold");
    expect(commandForInput(createKeyInput({ key: " " }), selected, focus)).toEqual({ type: "activate", targetId: "bold" });
    runtime.dispose();
  });

  it("normalizes progress, redraws value-only commits, and never exposes actions", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 1 } });
    const view = (value: number | null, max?: number) => <Root id="root">
      <Progress id="progress" label="Upload" value={value} max={max} style={{ width: 10 }} />
    </Root>;
    const first = runtime.render(view(60));
    expect(first.buffer.toText()).toBe("██████░░░░");
    const complete = runtime.render(view(200));
    expect(complete.buffer.toText()).toBe("██████████");
    expect(complete.layout).toBe(first.layout);
    expect(complete.semantics.nodes.get("progress")).toMatchObject({ role: "progressbar", valueNow: 100, valueMin: 0, valueMax: 100, actions: [] });
    expect(runtime.render(view(NaN, -1)).buffer.toText()).toBe("░░░░░░░░░░");
    expect(runtime.render(view(-5)).buffer.toText()).toBe("░░░░░░░░░░");
    expect(runtime.render(view(1, 2)).buffer.toText()).toBe("█████░░░░░");
    expect(auditSemanticSnapshot(complete.semantics)).toEqual([]);
    runtime.dispose();
  });

  it("renders deterministic indeterminate phases without numeric semantics or layout work", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 1 } });
    const view = <Root id="root">
      <Progress id="progress" label="Upload" value={null} style={{ width: 10 }} />
    </Root>;
    const first = runtime.render(view, { animationTimeMs: 0 });
    expect(first.buffer.toText()).toBe("███░░░░░░░");
    expect(first.semantics.nodes.get("progress")).toMatchObject({
      role: "progressbar",
      label: "Upload",
      actions: [],
    });
    expect(first.semantics.nodes.get("progress")).not.toHaveProperty("valueNow");

    const second = runtime.render(view, { animationTimeMs: 120 });
    expect(second.buffer.toText()).toBe("░███░░░░░░");
    expect(second.layout).toBe(first.layout);
    expect(second.scene).toBe(first.scene);
    expect(second.semantics.nodes).toBe(first.semantics.nodes);
    expect(second.invalidation.work).toMatchObject({
      layout: "reused",
      geometry: "reused",
      paint: "computed",
      semantics: "reused",
    });
    expect(auditSemanticSnapshot(second.semantics)).toEqual([]);
    runtime.dispose();
  });

  it("shows an owned percentage without changing Progress width or numeric semantics", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 1 } });
    const view = (value: number | null, number: boolean, variant: "solid" | "outline" = "solid", width = 10) =>
      <Root id="root"><Progress id="progress" label="Upload" value={value} max={200}
        valueText="Files uploaded" number={number} variant={variant} style={{ width }} /></Root>;
    const plain = runtime.render(view(120, false));
    expect(plain.buffer.toText()).toBe("██████░░░░");
    const numbered = runtime.render(view(120, true));
    expect(numbered.buffer.toText()).toBe("███░░ 60% ");
    expect(numbered.layout).toBe(plain.layout);
    expect(numbered.layout.entries.get("progress")?.rect.width).toBe(10);
    expect(numbered.semantics.nodes.get("progress")).toMatchObject({
      role: "progressbar", valueNow: 120, valueMax: 200, valueText: "Files uploaded",
    });
    for (let x = 0; x < 10; x += 1) {
      expect(numbered.buffer.get(x, 0)?.ownerId).toBe("progress");
    }
    expect(runtime.render(view(200, true, "outline")).buffer.toText()).toBe("[///] 100%");
    expect(runtime.render(view(120, true, "outline", 7)).buffer.toText({ trimEnd: true }))
      .toBe("[///--]");
    const indeterminate = runtime.render(view(null, true), { animationTimeMs: 0 });
    expect(indeterminate.buffer.toText()).toBe("███░░░░░░░");
    expect(indeterminate.semantics.nodes.get("progress")).not.toHaveProperty("valueNow");
    runtime.dispose();
  });

  it("renders outline Progress inside its declared width and treats variant as layout", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 1 } });
    const view = (variant: "solid" | "outline", value: number | null, width = 10) => <Root id="root">
      <Progress id="progress" label="Upload" variant={variant} value={value} style={{ width }} />
    </Root>;
    const solid = runtime.render(view("solid", 60));
    expect(solid.buffer.toText()).toBe("██████░░░░");
    expect(solid.buffer.get(0, 0)?.style.backgroundColor).toBeUndefined();

    const outline = runtime.render(view("outline", 60));
    expect(outline.buffer.toText()).toBe("[////----]");
    expect(outline.layout.entries.get("progress")?.rect.width).toBe(10);
    expect(outline.invalidation.work.layout).toBe("computed");
    expect(outline.semantics.nodes.get("progress")).toMatchObject({
      role: "progressbar",
      valueNow: 60,
      valueMin: 0,
      valueMax: 100,
    });

    expect(runtime.render(view("outline", null), { animationTimeMs: 0 }).buffer.toText())
      .toBe("[//------]");
    expect(runtime.render(view("outline", null), { animationTimeMs: 840 }).buffer.toText())
      .toBe("[/------/]");
    expect(runtime.render(view("outline", 100, 1)).buffer.toText({ trimEnd: true })).toBe("/");
    expect(runtime.render(view("outline", 100, 2)).buffer.toText({ trimEnd: true })).toBe("[]");
    expect(runtime.render(view("outline", 100, 3)).buffer.toText({ trimEnd: true })).toBe("[/]");
    runtime.dispose();
  });

  it("paints themed separator variants without coupling appearance to semantics or layout", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 6, height: 3 } });
    const view = (orientation: "horizontal" | "vertical", variant?: SeparatorVariant) => <Root id="root">
      <Separator id="line" orientation={orientation} variant={variant} />
    </Root>;
    const horizontal = runtime.render(view("horizontal"));
    expect(horizontal.buffer.toText({ trimEnd: true }).split("\n")[0]).toBe("──────");
    for (const [variant, glyph] of [["slash", "/"], ["double", "═"], ["dots", "·"]] as const) {
      const rendered = runtime.render(view("horizontal", variant));
      expect(rendered.buffer.toText({ trimEnd: true }).split("\n")[0]).toBe(glyph.repeat(6));
      expect(rendered.layout).toBe(horizontal.layout);
      expect(rendered.semantics.nodes).toEqual(horizontal.semantics.nodes);
    }
    const vertical = runtime.render(view("vertical"));
    expect(vertical.buffer.toText({ trimEnd: true })).toBe("│\n│\n│");
    for (const [variant, glyph] of [["slash", "/"], ["double", "║"], ["dots", "·"]] as const) {
      expect(runtime.render(view("vertical", variant)).buffer.toText({ trimEnd: true }))
        .toBe(`${glyph}\n${glyph}\n${glyph}`);
    }
    expect(vertical.layout).not.toBe(horizontal.layout);
    expect(vertical.semantics.nodes.get("line")).toMatchObject({ role: "separator", orientation: "vertical", actions: [] });
    expect(auditSemanticSnapshot(vertical.semantics)).toEqual([]);
    expect(runtime.render(view("horizontal", "unknown" as SeparatorVariant))
      .buffer.toText({ trimEnd: true }).split("\n")[0]).toBe("──────");
    runtime.dispose();
  });

  it("consumes separator glyphs from the global theme", () => {
    const runtime = new CellUiRuntime({
      viewport: { width: 4, height: 1 },
      theme: {
        separatorGlyphs: {
          ...CLASSIC_MAC_LIGHT_THEME.separatorGlyphs,
          slash: { horizontal: "#", vertical: "#" },
        },
      },
    });
    expect(runtime.render(<Root><Separator variant="slash" /></Root>).buffer.toText()).toBe("####");
    runtime.dispose();
  });

  it("derives radio checks from its group, wraps navigation, and skips disabled items", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 14, height: 3 } });
    const view = (value: string, disabled = false) => <Root id="root">
      <RadioGroup id="appearance" label="Appearance" value={value} disabled={disabled}>
        <RadioItem id="light" value="light"><Text>Light</Text></RadioItem>
        <RadioItem id="dark" value="dark" disabled><Text>Dark</Text></RadioItem>
        <RadioItem id="system" value="system"><Text>System</Text></RadioItem>
      </RadioGroup>
    </Root>;
    const frame = runtime.render(view("system"));
    expect(frame.buffer.toText({ trimEnd: true })).toBe(" ( ) Light\n ( ) Dark\n (●) System");
    const focus = new FocusManager();
    expect(focus.first(frame.tree)).toBe("system");
    focus.sync(frame.tree, "light");
    const command = commandForInput(createKeyInput({ key: "ArrowDown" }), frame, focus);
    expect(command).toEqual({ type: "select-radio", targetId: "system" });
    expect(activationFeedbackTargetForCommand(frame, command!)).toBeNull();
    focus.apply(command!);
    expect(commandForInput(createKeyInput({ key: "ArrowRight" }), frame, focus)).toEqual({ type: "select-radio", targetId: "light" });
    expect(activationFeedbackTargetForCommand(frame, { type: "activate", targetId: "system" })).toBe("system");
    expect(frame.semantics.nodes.get("system")).toMatchObject({ semanticParentId: "appearance", role: "radio", checked: true });
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    const changed = runtime.render(view("light"));
    expect(changed.buffer.toText({ trimEnd: true })).toContain(" (●) Light");
    expect(changed.layout).toBe(frame.layout);
    const disabled = runtime.render(view("light", true));
    expect(focus.first(disabled.tree)).toBeNull();
    expect(disabled.semantics.nodes.get("light")?.actions).toEqual([]);
    runtime.dispose();
  });
});

import { describe, expect, it } from "vitest";
import { Button, CellTextEditor, CellUiRuntime, Combobox, ComboboxInput, Field, Root, Select, SelectTrigger,
  Text, TextArea, TextInput, Tooltip, auditSemanticSnapshot } from "./index.js";
import { CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME } from "./theme.js";

const input = (kind: "text-input" | "text-area" | "select" | "combobox") => {
  const state = new CellTextEditor({ value: "Dark" }).snapshot();
  switch (kind) {
    case "text-input": return <TextInput id="control" state={state} />;
    case "text-area": return <TextArea id="control" state={state} />;
    case "select": return <Select><SelectTrigger id="control"><Text>Dark</Text></SelectTrigger></Select>;
    case "combobox": return <Combobox><ComboboxInput id="control" state={state} /></Combobox>;
  }
};

describe("Field", () => {
  it.each(["text-input", "text-area", "select", "combobox"] as const)(
    "keeps the %s error description when a Tooltip opens and closes", (kind) => {
      const runtime = new CellUiRuntime({ viewport: { width: 36, height: 10 } });
      const view = (error?: string) => <Root><Field id="field" label="Theme" error={error}>
        {input(kind)}
      </Field><Tooltip id="control-tip" targetId="control" text="Choose a theme" /></Root>;
      const errorOnly = runtime.render(view("Required"));
      expect(errorOnly.semantics.nodes.get("control")?.describedByIds).toEqual(["field-error"]);
      const together = runtime.render(view("Required"), { tooltipTargetId: "control" });
      expect(together.semantics.nodes.get("control")?.describedById).toBe("field-error");
      expect(together.semantics.nodes.get("control")?.describedByIds)
        .toEqual(["field-error", "control-tip"]);
      expect(auditSemanticSnapshot(together.semantics)).toEqual([]);
      const tipOnly = runtime.render(view(), { tooltipTargetId: "control" });
      expect(tipOnly.semantics.nodes.get("control")?.describedByIds).toEqual(["control-tip"]);
      const neither = runtime.render(view());
      expect(neither.semantics.nodes.get("control")?.describedByIds).toBeUndefined();
      runtime.dispose();
    },
  );

  it.each(["text-input", "text-area", "select", "combobox"] as const)(
    "associates %s with a visible error and clears it without changing identity", (kind) => {
      const runtime = new CellUiRuntime({ viewport: { width: 36, height: 8 } });
      const view = (error?: string) => <Root><Field id="theme-field" label="Theme" error={error}>
        {input(kind)}
      </Field></Root>;
      const invalid = runtime.render(view("Choose a theme"));
      expect(invalid.buffer.toText()).toContain("! Choose a theme");
      expect(invalid.semantics.nodes.get("control")).toMatchObject({
        label: "Theme", invalid: true, describedById: "theme-field-error",
      });
      expect(invalid.semantics.nodes.get("theme-field-error")).toMatchObject({
        role: "alert", label: "! Choose a theme",
      });
      const valid = runtime.render(view());
      expect(valid.semantics.nodes.get("control")?.invalid).toBeUndefined();
      expect(valid.semantics.nodes.get("control")?.describedById).toBeUndefined();
      expect(valid.semantics.nodes.has("theme-field-error")).toBe(false);
      runtime.dispose();
    },
  );

  it.each([CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME])(
    "paints the error and dangerous button from the shared danger token", (theme) => {
      const runtime = new CellUiRuntime({ viewport: { width: 36, height: 8 }, theme });
      const frame = runtime.render(<Root>
        <Field id="name-field" label="Name" error="Required">
          <TextInput id="name" state={new CellTextEditor({ value: "" }).snapshot()} />
        </Field>
        <Button id="delete" tone="danger"><Text>Delete project</Text></Button>
      </Root>);
      const error = frame.scene.entries.get("name-field-error")!.layoutBounds;
      expect(frame.buffer.get(error.x, error.y)?.style.color).toBe(theme.semanticColors.danger.text);
      const button = frame.scene.entries.get("delete")!.layoutBounds;
      expect(frame.buffer.get(button.x, button.y)?.style.backgroundColor).toBe(theme.semanticColors.danger.text);
      runtime.dispose();
    },
  );

  it.each(["solid", "surface", "outline", "ghost"] as const)(
    "keeps danger tone independent of the %s Button variant and disabled state", (variant) => {
      const runtime = new CellUiRuntime({ viewport: { width: 24, height: 2 } });
      const view = (disabled = false) => <Root><Button id="delete" tone="danger" variant={variant}
        disabled={disabled}><Text>Delete</Text></Button></Root>;
      const active = runtime.render(view());
      expect(active.tree.nodes.get("delete")).toMatchObject({ buttonTone: "danger", buttonVariant: variant });
      const bounds = active.scene.entries.get("delete")!.layoutBounds;
      const text = Array.from({ length: bounds.width }, (_, offset) => active.buffer.get(bounds.x + offset, bounds.y))
        .find((cell) => cell?.text === "D");
      expect(text?.style.color).toBe(variant === "solid" ? CLASSIC_MAC_LIGHT_THEME.background
        : variant === "surface" ? CLASSIC_MAC_LIGHT_THEME.semanticColors.danger.surfaceForeground
        : CLASSIC_MAC_LIGHT_THEME.semanticColors.danger.text);
      const disabled = runtime.render(view(true));
      expect(disabled.semantics.nodes.get("delete")?.disabled).toBe(true);
      expect(disabled.buffer.get(bounds.x, bounds.y)?.style.backgroundColor)
        .not.toBe(CLASSIC_MAC_LIGHT_THEME.semanticColors.danger.text);
      runtime.dispose();
    },
  );

  it("rejects a collection without its focus-bearing control", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 5 } });
    expect(() => runtime.render(<Root><Field id="theme" label="Theme">
      <Select><Text>Missing trigger</Text></Select>
    </Field></Root>)).toThrow(/requires exactly one select-trigger/);
    runtime.dispose();
  });
});

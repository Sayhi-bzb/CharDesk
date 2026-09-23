import { describe, expect, it } from "vitest";
import { Box, Button, CellUiRuntime, Dialog, DialogTitle, Root, Text, Tooltip, auditSemanticSnapshot, extractCellRange } from "./index.js";
import { hitTestCell } from "./scene.js";
import { fitTooltipText, tooltipTextWidth } from "./tooltip.js";
import { CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME } from "./theme.js";

const view = (target = true, text = "Save document") => <Root id="root">
  {target && <Button id="save"><Text>Save</Text></Button>}
  <Tooltip id="save-tip" targetId="save" text={text} />
</Root>;

describe("Tooltip", () => {
  it.each([CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME])(
    "keeps both variants opaque independently of border shape",
    (theme) => {
      const runtime = new CellUiRuntime({ viewport: { width: 28, height: 8 }, theme });
      for (const variant of ["surface", "ghost"] as const) {
        for (const border of ["square", "rounded", "none"] as const) {
          const result = runtime.render(<Root>
            <Button id="save"><Text>Save</Text></Button>
            <Tooltip id="save-tip" targetId="save" text="Save document"
              variant={variant} border={border} />
          </Root>, { tooltipTargetId: "save" });
          const bounds = result.scene.entries.get("save-tip")!.layoutBounds;
          const bordered = border !== "none";
          expect(bounds).toMatchObject({ width: bordered ? 17 : 15, height: bordered ? 3 : 1 });
          expect(result.tree.nodes.get("save-tip")?.surfaceVariant).toBe(variant);
          expect(result.tree.nodes.get("save-tip")?.frame).toBe(bordered ? "bordered" : "none");
          expect(result.buffer.get(bounds.x, bounds.y)?.text).toBe(border === "square" ? "┌" : border === "rounded" ? "╭" : " ");
          const textCell = result.buffer.get(bounds.x + (bordered ? 2 : 1), bounds.y + (bordered ? 1 : 0));
          expect(textCell?.text).toBe("S");
          expect(textCell?.style.backgroundColor).toBe(
            (variant === "surface" ? theme.elevatedSurfaceStyle : theme.surfaceStyle).backgroundColor,
          );
          expect(result.semantics.nodes.get("save-tip")?.role).toBe("tooltip");
        }
      }
      runtime.dispose();
    },
  );

  it("uses the theme border shape when Tooltip border is omitted", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 }, theme: { borderShape: "rounded" } });
    const result = runtime.render(view(), { tooltipTargetId: "save" });
    const bounds = result.scene.entries.get("save-tip")!.layoutBounds;
    expect(result.buffer.get(bounds.x, bounds.y)?.text).toBe("╭");
    runtime.dispose();
  });

  it("appears in an opaque, non-interactive Cell plane without moving its target", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 10 } });
    const closed = runtime.render(view());
    expect(closed.scene.entries.has("save-tip")).toBe(false);
    expect(closed.overlayPlanes).toHaveLength(0);
    const opened = runtime.render(view(), { tooltipTargetId: "save" });
    expect(opened.layout).toBe(closed.layout);
    expect(opened.scene.entries.get("save-tip")?.layoutBounds).toMatchObject({ x: 0, y: 1, height: 3 });
    expect(opened.scene.entries.get("save")!.layoutBounds.y + opened.scene.entries.get("save")!.layoutBounds.height)
      .toBe(opened.scene.entries.get("save-tip")!.layoutBounds.y);
    expect(opened.overlayPlanes).toHaveLength(1);
    expect(opened.buffer.get(0, 1)).toMatchObject({ text: "┌", ownerId: "save-tip" });
    expect(opened.buffer.get(2, 2)).toMatchObject({ text: "S", ownerId: "save-tip" });
    expect(opened.buffer.get(2, 2)?.style.backgroundColor).toBeDefined();
    expect(extractCellRange(opened.buffer, opened.scene.entries.get("save-tip")!.layoutBounds))
      .toContain("Save document");
    expect(hitTestCell(opened.scene, { x: 2, y: 2 })?.ownerId).not.toBe("save-tip");
    expect(opened.semantics.nodes.get("save")).toMatchObject({ role: "button", describedById: "save-tip" });
    expect(opened.semantics.nodes.get("save-tip")).toMatchObject({ role: "tooltip", label: "Save document", actions: [] });
    expect(auditSemanticSnapshot(opened.semantics)).toEqual([]);
    const hidden = runtime.render(view(), { tooltipTargetId: null });
    expect(hidden.layout).toBe(opened.layout);
    expect(hidden.semantics.nodes.get("save")?.describedById).toBeUndefined();
    runtime.dispose();
  });

  it("prefers above, flips below, and clamps/truncates at the viewport", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 18, height: 10 } });
    const above = runtime.render(<Root>
      <Text>{"\n\n\n\n\n\n"}</Text>
      <Button id="save"><Text>Save</Text></Button>
      <Tooltip id="save-tip" targetId="save" text="Long Unicode tooltip" />
    </Root>, { tooltipTargetId: "save" });
    const anchor = above.scene.entries.get("save")!.layoutBounds;
    const tip = above.scene.entries.get("save-tip")!.layoutBounds;
    expect(tip.y + tip.height).toBe(anchor.y);
    expect(tip.width).toBe(18);
    expect(above.buffer.toText({ region: tip })).toContain("…");
    const atRight = runtime.render(<Root>
      <Box style={{ direction: "row", height: 1 }}>
        <Text>{" ".repeat(10)}</Text>
        <Button id="save"><Text>Save</Text></Button>
      </Box>
      <Tooltip id="save-tip" targetId="save" text="Right edge" />
    </Root>, { tooltipTargetId: "save" });
    expect(atRight.scene.entries.get("save")).toMatchObject({
      paintVisible: true, layoutBounds: { x: 10, y: 0, width: 6, height: 1 },
    });
    expect(atRight.scene.entries.get("save-tip")?.layoutBounds.x).toBe(4);
    expect(fitTooltipText("保存文档", 5)).toBe("保存…");
    expect(tooltipTextWidth(fitTooltipText("保存文档", 5))).toBe(5);
    runtime.dispose();
  });

  it("fits a borderless tooltip into a narrow viewport", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 3 } });
    const result = runtime.render(<Root>
      <Button id="save"><Text>Save</Text></Button>
      <Tooltip id="save-tip" targetId="save" text="Save current document" border="none" />
    </Root>, { tooltipTargetId: "save" });
    const bounds = result.scene.entries.get("save-tip")!.layoutBounds;
    expect(bounds).toMatchObject({ x: 0, y: 1, width: 8, height: 1 });
    expect(result.buffer.toText({ region: bounds })).toContain("…");
    runtime.dispose();
  });

  it("suppresses unavailable targets and rejects ambiguous tooltip ownership", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 6 } });
    expect(runtime.render(view(false), { tooltipTargetId: "save" }).scene.entries.has("save-tip")).toBe(false);
    expect(() => runtime.render(<Root>
      <Button id="save"><Text>Save</Text></Button>
      <Tooltip targetId="save" text="First" />
      <Tooltip targetId="save" text="Second" />
    </Root>)).toThrow(/Only one Tooltip/);
    runtime.dispose();
  });

  it("keeps an external tooltip description inside its target's modal semantics", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 12 } });
    const frame = runtime.render(<Root>
      <Dialog id="dialog"><DialogTitle>Save file</DialogTitle>
        <Button id="save"><Text>Save</Text></Button>
      </Dialog>
      <Tooltip id="save-tip" targetId="save" text="Save current document" />
    </Root>, { tooltipTargetId: "save", focusedId: "save" });
    expect(frame.semantics.nodes.get("save")?.describedById).toBe("save-tip");
    expect(frame.semantics.nodes.get("save-tip")?.semanticParentId).toBe("dialog");
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });
});

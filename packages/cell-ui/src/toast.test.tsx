import { describe, expect, it } from "vitest";
import { CellUiRuntime, Root, Text, Toast, auditSemanticSnapshot } from "./index.js";
import { CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME } from "./theme.js";

describe("Toast", () => {
  it.each([CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME])("uses shared tone colors in both surface variants", (theme) => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 5 }, theme });
    for (const tone of ["neutral", "info", "success", "warning", "error"] as const) {
      for (const variant of ["surface", "ghost"] as const) {
        const frame = runtime.render(<Root><Toast id="notice" tone={tone} variant={variant}>
          <Text>Saved</Text>
        </Toast></Root>);
        const node = frame.tree.nodes.get("notice")!;
        const bounds = frame.scene.entries.get("notice")!.layoutBounds;
        const message = frame.buffer.get(bounds.x + (tone === "neutral" ? 2 : 4), bounds.y + 1);
        expect(node).toMatchObject({ badgeTone: tone, surfaceVariant: variant, frame: "bordered" });
        expect(frame.buffer.get(bounds.x, bounds.y)?.text).toBe("┌");
        expect(frame.buffer.get(bounds.x, bounds.y)?.style.color).toBe(theme.badgeStyles[tone].color);
        expect(message?.style.color).toBe(theme.badgeStyles[tone].color);
        expect(message?.style.backgroundColor).toBe(variant === "surface"
          ? theme.badgeStyles[tone].backgroundColor : theme.background);
        expect(frame.semantics.nodes.get("notice")?.role).toBe("group");
        expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
      }
    }
    runtime.dispose();
  });

  it("keeps Rich frame choices while Text uses one square character frame", () => {
    const rich = new CellUiRuntime({ viewport: { width: 20, height: 5 } });
    const text = new CellUiRuntime({ viewport: { width: 20, height: 5 }, presentation: "text" });
    const view = (frame: "none" | "bordered", borderShape: "square" | "rounded") =>
      <Root><Toast id="notice" tone="success" frame={frame} borderShape={borderShape}>
        <Text>Saved</Text>
      </Toast></Root>;
    expect(rich.render(view("none", "rounded")).tree.nodes.get("notice")?.frame).toBe("none");
    const rounded = rich.render(view("bordered", "rounded"));
    expect(rounded.buffer.get(0, 0)?.text).toBe("╭");
    const characters = text.render(view("none", "rounded"));
    expect(characters.tree.nodes.get("notice")).toMatchObject({ frame: "bordered", borderShape: "square" });
    expect(characters.buffer.get(0, 0)?.text).toBe("┌");
    expect(characters.buffer.toText()).toContain("✓ Saved");
    rich.dispose();
    text.dispose();
  });

  it("protects the tone marker from caller padding", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 5 } });
    const frame = runtime.render(<Root><Toast id="notice" tone="warning" frame="none" style={{ paddingLeft: 0 }}>
      <Text>Check</Text>
    </Toast></Root>);
    expect(frame.buffer.get(1, 0)?.text).toBe("!");
    expect(frame.buffer.get(3, 0)?.text).toBe("C");
    runtime.dispose();
  });
});

import { describe, expect, it } from "vitest";
import {
  Badge,
  CellUiRuntime,
  CLASSIC_MAC_DARK_THEME,
  CLASSIC_MAC_LIGHT_THEME,
  FocusManager,
  Root,
  Text,
  auditSemanticSnapshot,
  commandForInput,
  createKeyInput,
} from "./index.js";
import { BADGE_TONES } from "./badge.js";
import { resolvePointerAppearance } from "./pointer.js";

const contrastRatio = (foreground: string, background: string) => {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/../g)!.map((channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
};

describe("Badge", () => {
  it("keeps one content Cell guard per side and stays passive by default", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 16, height: 1 } });
    const frame = runtime.render(<Root><Badge id="done" tone="success"><Text>Done</Text></Badge></Root>);
    const badge = frame.layout.entries.get("done")!;
    expect(badge.rect).toMatchObject({ width: 6, height: 1 });
    expect(badge.paddingInsets).toEqual({ top: 0, right: 1, bottom: 0, left: 1 });
    expect(frame.buffer.toText({ trimEnd: true })).toBe(" Done");
    expect(frame.buffer.toText({ region: badge.rect })).toBe(" Done ");
    for (let x = 0; x < badge.rect.width; x += 1) {
      expect(frame.buffer.get(x, 0)?.style).toMatchObject(CLASSIC_MAC_LIGHT_THEME.badgeStyles.success);
    }
    expect(frame.semantics.nodes.get("done")).toMatchObject({ role: "paragraph", label: "Done", actions: [] });
    expect(new FocusManager().first(frame.tree)).toBeNull();
    expect(commandForInput({ type: "semantic", targetId: "done", action: "activate" }, frame, new FocusManager())).toBeNull();
    expect(resolvePointerAppearance(frame, { x: 0, y: 0 }).cursor).toBe("default");
    runtime.dispose();
  });

  it("uses all five paired tones in light and dark themes with readable text", () => {
    for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
      const runtime = new CellUiRuntime({ viewport: { width: 16, height: 1 }, theme });
      for (const tone of BADGE_TONES) {
        const frame = runtime.render(<Root><Badge id="status" tone={tone}><Text>State</Text></Badge></Root>);
        const style = theme.badgeStyles[tone];
        expect(frame.buffer.get(0, 0)?.style).toMatchObject(style);
        expect(frame.buffer.get(1, 0)?.style).toMatchObject(style);
        expect(contrastRatio(style.color!, style.backgroundColor!)).toBeGreaterThanOrEqual(4.5);
      }
      runtime.dispose();
    }
  });

  it("clips long text inside a fixed one-row Badge while preserving its semantic label", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 2 } });
    const frame = runtime.render(<Root><Badge id="status" style={{ width: 5, height: 1 }}><Text>Long label</Text></Badge></Root>);
    expect(frame.layout.entries.get("status")?.rect).toMatchObject({ width: 5, height: 1 });
    expect(frame.buffer.toText({ trimEnd: true }).split("\n")[0]).toBe(" Lon");
    expect(frame.semantics.nodes.get("status")?.label).toBe("Long label");
    runtime.dispose();
  });

  it("makes only interactive Badges actionable across pointer, keyboard and semantics", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    const view = <Root style={{ direction: "row", gap: 1 }}>
      <Badge id="retry" tone="error" interactive><Text>Retry</Text></Badge>
      <Badge id="blocked" tone="error" interactive disabled><Text>Blocked</Text></Badge>
    </Root>;
    const frame = runtime.render(view);
    const focus = new FocusManager();
    focus.sync(frame.tree, "retry");
    expect(focus.first(frame.tree)).toBe("retry");
    expect(frame.semantics.nodes.get("retry")).toMatchObject({ role: "button", label: "Retry", actions: ["focus", "activate"] });
    expect(frame.semantics.nodes.get("blocked")).toMatchObject({ role: "button", disabled: true, actions: [] });
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    for (const key of ["Enter", " "]) {
      expect(commandForInput(createKeyInput({ key }), frame, focus)).toEqual({ type: "activate", targetId: "retry" });
    }
    expect(commandForInput({ type: "semantic", targetId: "retry", action: "activate" }, frame, focus))
      .toEqual({ type: "activate", targetId: "retry" });
    expect(commandForInput({ type: "pointer", phase: "up", point: { x: 0, y: 0 }, button: 0 }, frame, focus))
      .toEqual({ type: "activate", targetId: "retry" });
    expect(resolvePointerAppearance(frame, { x: 0, y: 0 }).cursor).toBe("pointer");
    const blocked = frame.layout.entries.get("blocked")!.rect;
    expect(commandForInput({ type: "pointer", phase: "up", point: { x: blocked.x, y: 0 }, button: 0 }, frame, focus)).toBeNull();
    const pressed = runtime.render(view, { pressActiveId: "retry" });
    expect(pressed.buffer.get(0, 0)?.style).toMatchObject({
      color: CLASSIC_MAC_LIGHT_THEME.badgeStyles.error.backgroundColor,
      backgroundColor: CLASSIC_MAC_LIGHT_THEME.badgeStyles.error.color,
    });
    runtime.dispose();
  });

  it("requires a stable id only when interactive", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 1 } });
    expect(() => runtime.render(<Root><Badge interactive><Text>Retry</Text></Badge></Root>))
      .toThrow("Interactive Badge requires a non-empty id.");
    expect(() => runtime.render(<Root><Badge><Text>Done</Text></Badge></Root>)).not.toThrow();
    runtime.dispose();
  });
});

import { expect, it } from "vitest";
import { CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME, CellUiRuntime, FocusManager, Link, Root, auditSemanticSnapshot, commandForInput } from "./index.js";

it("renders a navigation link with a full name, current state, and the normal open-link command", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 24, height: 2 } });
  const render = (current?: "page" | "location") => runtime.render(<Root>
    <Link id="guide" href="#/guides/philosophy" label="Classic Macintosh philosophy" current={current}>
      Classic Macintosh…
    </Link>
  </Root>);
  const first = render("page");
  const link = first.semantics.nodes.get("guide")!;
  expect(link).toMatchObject({ role: "link", label: "Classic Macintosh philosophy",
    href: "#/guides/philosophy", current: "page" });
  expect(auditSemanticSnapshot(first.semantics)).toEqual([]);
  expect(commandForInput({ type: "semantic", targetId: "guide", action: "activate" }, first, new FocusManager()))
    .toEqual({ type: "open-link", targetId: "guide", href: "#/guides/philosophy" });
  const next = render("location");
  expect(next.semantics.nodes.get("guide")?.current).toBe("location");
  runtime.dispose();
});

it("rejects unsafe public links", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  expect(() => runtime.render(<Root><Link href="javascript:alert(1)">Unsafe</Link></Root>))
    .toThrow("Link requires a safe non-empty href.");
  runtime.dispose();
});

it("preserves new-tab intent through the link command and semantics", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const frame = runtime.render(<Root><Link id="github" href="https://github.com" target="_blank">GitHub</Link></Root>);
  expect(frame.semantics.nodes.get("github")).toMatchObject({
    role: "link", href: "https://github.com", target: "_blank",
  });
  expect(commandForInput({ type: "semantic", targetId: "github", action: "activate" }, frame, new FocusManager()))
    .toEqual({ type: "open-link", targetId: "github", href: "https://github.com", target: "_blank" });
  runtime.dispose();
});

it("uses the shared info text color by default while respecting explicit link colors", () => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 16, height: 2 }, theme });
    const content = <Root>
      <Link id="default" href="/docs/">Docs</Link>
      <Link id="custom" href="/" textStyle={{ color: theme.foreground }}>Brand</Link>
    </Root>;
    const idle = runtime.render(content);
    expect(idle.buffer.get(0, 0)?.style.color).toBe(theme.semanticColors.info.text);
    expect(idle.buffer.get(0, 1)?.style.color).toBe(theme.foreground);
    const hovered = runtime.render(content, { hoveredId: "default" });
    expect(hovered.buffer.get(0, 0)?.style).toMatchObject({
      color: theme.background,
      backgroundColor: theme.semanticColors.info.text,
    });
    const focused = runtime.render(content, { focusedId: "default", focusVisible: true });
    expect(focused.buffer.get(0, 0)?.style).toMatchObject({
      color: theme.background,
      backgroundColor: theme.semanticColors.info.text,
    });
    runtime.dispose();
  }
});

it("keeps an explicitly inverted current link inverted on hover", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 }, theme: CLASSIC_MAC_LIGHT_THEME });
  const content = <Root><Link id="current" href="#/guides/philosophy" current="page"
    style={{ width: "100%" }} textStyle={CLASSIC_MAC_LIGHT_THEME.selectedStyle}>Current</Link></Root>;
  for (const hoveredId of [undefined, "current"]) {
    const frame = runtime.render(content, { hoveredId });
    for (const x of [0, 6, 11]) {
      expect(frame.buffer.get(x, 0)?.style).toMatchObject(CLASSIC_MAC_LIGHT_THEME.selectedStyle);
    }
  }
  const focused = runtime.render(content, { focusedId: "current", focusVisible: true });
  expect(focused.buffer.get(0, 0)?.style).toMatchObject({
    ...CLASSIC_MAC_LIGHT_THEME.selectedStyle, bold: true,
  });
  runtime.dispose();
});

import { expect, it } from "vitest";
import { CellTextEditor, CellUiRuntime, Root, TextArea, TextInput, createTestPilot, resolveWheelInput } from "./index.js";
import { computeScrollMetrics } from "./scroll.js";
import { measureCellText } from "./text.js";

it("shared geometry converges both axes, hides rails independently of range, and protects tiny viewports", () => {
  const bounds = { x: 1, y: 1, width: 8, height: 4 };
  const metrics = computeScrollMetrics(bounds, { width: 8, height: 5 }, { x: 0, y: 0 }, { x: true, y: true });
  expect(metrics.viewport).toEqual({ x: 1, y: 1, width: 7, height: 3 });
  expect(metrics.maxOffset).toEqual({ x: 1, y: 2 });
  expect(metrics.corner).toEqual({ x: 8, y: 4, width: 1, height: 1 });
  const hidden = computeScrollMetrics(bounds, { width: 20, height: 1 }, { x: 0, y: 0 }, { x: false, y: false });
  expect(hidden.horizontalTrack).toBeNull();
  expect(hidden.maxOffset.x).toBe(12);
  for (const width of [0, 1, 2]) for (const height of [0, 1, 2]) {
    const tiny = computeScrollMetrics({ ...bounds, width, height }, { width: 20, height: 20 }, { x: 0, y: 0 }, { x: true, y: true });
    expect(tiny.viewport.width).toBeGreaterThanOrEqual(Math.min(1, width));
    expect(tiny.viewport.height).toBeGreaterThanOrEqual(Math.min(1, height));
  }
});

it("text extent measures CJK, emoji, combining, ZWJ, tabs and composition with caret space", () => {
  const editor = new CellTextEditor({ value: "中\té👨‍👩‍👧‍👦\n👋", multiline: true });
  expect(measureCellText(editor.snapshot())).toEqual({ width: 8, height: 2 });
  editor.dispatch({ type: "select-all" });
  editor.dispatch({ type: "composition-start" });
  editor.dispatch({ type: "composition-update", text: "中\nabc" });
  expect(measureCellText(editor.snapshot())).toEqual({ width: 4, height: 2 });
});

it("TextInput retains hidden horizontal scrolling and TextArea gains owned rails", () => {
  const editor = new CellTextEditor({ value: "abcdefghijk", multiline: true });
  const runtime = new CellUiRuntime({ viewport: { width: 10, height: 9 } });
  const frame = runtime.render(<Root>
    <TextInput id="input" state={editor.snapshot()} />
    <TextArea id="area" state={editor.snapshot()} style={{ border: true, height: 5 }} />
  </Root>);
  expect(frame.scene.entries.get("input")!.scrollMetrics?.horizontalTrack).toBeNull();
  expect(frame.textLayouts.get("input")!.contentBounds.height).toBe(1);
  const rail = frame.scene.entries.get("area")!.scrollMetrics!.horizontalTrack!;
  expect(rail).not.toBeNull();
  expect(frame.buffer.get(rail.x, rail.y)).toMatchObject({ ownerId: "area", text: "█" });
  runtime.dispose();
});

it("editor rails page and drag without changing selection, cancel on geometry change, and disappear after deletion", async () => {
  const editor = new CellTextEditor({ value: Array.from({ length: 20 }, () => "x".repeat(80)).join("\n"), multiline: true });
  let height = 7;
  const pilot = createTestPilot({
    viewport: { width: 12, height: 8 },
    render: () => <Root><TextArea id="area" state={editor.snapshot()} style={{ width: 12, height, border: true }} /></Root>,
    onCommand: (command) => { if (command.type === "text") editor.dispatch(command.command); },
  });
  const selection = editor.snapshot().selection;
  const metrics = pilot.frame.scene.entries.get("area")!.scrollMetrics!;
  expect(editor.snapshot().viewport).toEqual({ columns: 9, rows: 4 });
  const track = metrics.horizontalTrack!;
  const point = { x: track.x, y: track.y };
  await pilot.pointerDown(point, 1, { x: point.x + 0.1, y: point.y + 0.5 });
  await pilot.pointerMove(point, 1, { x: point.x + 0.7, y: point.y + 0.5 });
  expect(editor.snapshot().scrollX).toBeGreaterThan(0);
  await pilot.pointerMove(point, 1, { x: point.x + 0.1, y: point.y + 0.5 });
  expect(editor.snapshot().scrollX).toBe(0);
  height = 6;
  await pilot.resize({ width: 12, height: 8 });
  await pilot.pointerMove({ x: point.x + 4, y: point.y }, 1);
  expect(editor.snapshot().scrollX).toBe(0);
  const next = pilot.frame.scene.entries.get("area")!.scrollMetrics!.horizontalTrack!;
  await pilot.click({ x: next.x + next.width - 1, y: next.y });
  expect(editor.snapshot().scrollX).toBe(9);
  await pilot.scroll("area", { x: 1000, y: 1000 });
  expect(editor.snapshot().selection).toEqual(selection);
  expect(editor.snapshot().scrollY).toBe(17);
  editor.dispatch({ type: "replace-document", value: "ok" });
  await pilot.resize({ width: 12, height: 8 });
  expect(editor.snapshot()).toMatchObject({ scrollX: 0, scrollY: 0 });
  expect(pilot.frame.scene.entries.get("area")!.scrollMetrics).toMatchObject({ horizontalTrack: null, verticalTrack: null });
  pilot.dispose();
});

it("editor wheel consumption is independent of movement and respects disabled state", () => {
  const editor = new CellTextEditor({ value: "x".repeat(30), multiline: true });
  const runtime = new CellUiRuntime({ viewport: { width: 10, height: 5 } });
  const view = (disabled: boolean) => <Root><TextArea id="area" disabled={disabled} readOnly state={editor.snapshot()} style={{ border: true, height: 5 }} /></Root>;
  const wheel = { type: "wheel" as const, point: { x: 2, y: 2 }, deltaX: -1, deltaY: 0 };
  expect(resolveWheelInput(runtime.render(view(false)), wheel)).toEqual({ consumed: true, command: null });
  expect(resolveWheelInput(runtime.render(view(false)), { ...wheel, deltaX: 1 }).command).toEqual({ type: "text", targetId: "area", command: { type: "set-scroll", x: 1, y: 0 } });
  expect(resolveWheelInput(runtime.render(view(true)), wheel).consumed).toBe(false);
  runtime.dispose();
});

it("editor geometry updates and incremental frames match fresh rendering through composition and scrolling", () => {
  const editor = new CellTextEditor({ value: "ok", multiline: true, viewport: { columns: 7, rows: 2 } });
  const viewport = { width: 10, height: 5 };
  const runtime = new CellUiRuntime({ viewport });
  const view = () => <Root><TextArea id="area" state={editor.snapshot()} style={{ border: true, height: 5 }} /></Root>;
  const first = runtime.render(view());
  editor.dispatch({ type: "set-selection", anchor: 1 });
  expect(runtime.render(view()).scene).toBe(first.scene);
  editor.dispatch({ type: "set-selection", anchor: 0 });
  editor.dispatch({ type: "composition-start" });
  editor.dispatch({ type: "composition-update", text: "中".repeat(20) });
  expect(runtime.render(view()).scene).not.toBe(first.scene);
  editor.dispatch({ type: "composition-commit", text: "中".repeat(20) });
  for (const x of [0, 1, 4, 20, 0]) {
    editor.dispatch({ type: "set-scroll", x });
    const frame = runtime.render(view());
    const fresh = new CellUiRuntime({ viewport });
    const oracle = fresh.render(view());
    for (let y = 0; y < viewport.height; y++) for (let column = 0; column < viewport.width; column++) {
      expect(frame.buffer.get(column, y)).toEqual(oracle.buffer.get(column, y));
    }
    fresh.dispose();
  }
  editor.dispatch({ type: "undo" });
  expect(editor.snapshot().value).toBe("ok");
  runtime.dispose();
});

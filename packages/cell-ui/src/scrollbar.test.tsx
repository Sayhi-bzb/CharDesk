import { expect, it } from "vitest";
import { TEXT_VERTICAL_TRACK_GLYPH, textVerticalThumbGlyph, thumbAxis, thumbCellSpan, thumbGlyph } from "./scrollbar.js";
import {
  Box, Button, CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME, CellTextEditor, CellUiRuntime, Combobox, ComboboxContent,
  ComboboxInput, ComboboxItem, Root, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger,
  Markdown, Text, TextArea, createTestPilot,
} from "./index.js";
import { gestureCandidatesForFrame } from "./pointer.js";
import { getEventPath, hitTestCell } from "./scene.js";
import { scrollViewportCommands } from "./scroll.js";

it("half-Cell geometry is monotonic, aligned at endpoints, and retains exact coverage", () => {
  for (const track of [1, 2, 5, 11]) {
    for (const content of [track + 1, track * 7, 1000]) {
      let last = 0;
      for (let offset = 0; offset <= content - track; offset++) {
        const thumb = thumbAxis(track, track, content, offset);
        expect(thumb.start).toBeGreaterThanOrEqual(last);
        expect(thumb.start + thumb.length).toBeLessThanOrEqual(track * 2);
        const span = thumbCellSpan(thumb);
        expect(Number.isInteger(span.start) && Number.isInteger(span.length)).toBe(true);
        last = thumb.start;
      }
      const end = thumbAxis(track, track, content, content - track);
      expect(end.start + end.length).toBe(track * 2);
    }
  }
  const thumb = { start: 1, length: 4 };
  expect([0, 1, 2].map((cell) => thumbGlyph(thumb, cell, false))).toEqual(["▄", "█", "▀"]);
  expect([0, 1, 2].map((cell) => thumbGlyph(thumb, cell, true))).toEqual(["╺", "━", "╸"]);
});

it("hides idle rails without changing their geometry or hit testing", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 8, height: 5 } });
  const view = <Root><ScrollArea id="scroll" style={{ width: 8, height: 5 }}>
    <Box style={{ height: 12 }} />
  </ScrollArea></Root>;
  const idle = runtime.render(view);
  const track = idle.scene.entries.get("scroll")!.scrollMetrics!.verticalTrack!;
  expect(idle.buffer.get(track.x, track.y)?.text).toBe(" ");
  expect(hitTestCell(idle.scene, { x: track.x, y: track.y })).toMatchObject({
    ownerId: "scroll", part: "scrollbar-y",
  });
  const shown = runtime.render(view, { visibleScrollbarIds: new Set(["scroll"]) });
  expect(shown.layout.entries.get("scroll")).toEqual(idle.layout.entries.get("scroll"));
  expect(shown.scene.entries.get("scroll")?.scrollMetrics).toEqual(idle.scene.entries.get("scroll")?.scrollMetrics);
  expect(shown.buffer.get(track.x, track.y)?.text).not.toBe(" ");
  expect(shown.invalidation.dirtyRegions.length).toBeGreaterThan(0);
  expect(shown.scene.entries.get("scroll")?.scrollMetrics?.verticalTrack).toEqual(track);
  const keyboardFocused = runtime.render(view, { focusedId: "scroll", focusVisible: true });
  expect(keyboardFocused.buffer.get(track.x, track.y)?.text).not.toBe(" ");
  const hidden = runtime.render(view);
  expect(hidden.buffer.get(track.x, track.y)?.text).toBe(" ");
  expect(hidden.invalidation.dirtyRegions.length).toBeGreaterThan(0);
  runtime.dispose();
});

it("grows an auto-height ScrollArea only when a horizontal rail needs a row", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 25, height: 12 } });
  const view = (width: number) => <Root><ScrollArea id="scroll" style={{ width }}>
    <Box style={{ width: 20, height: 4 }} />
  </ScrollArea></Root>;
  const narrow = runtime.render(view(10));
  expect(narrow.layout.entries.get("scroll")?.rect.height).toBe(5);
  expect(narrow.scene.entries.get("scroll")?.scrollMetrics).toMatchObject({
    maxOffset: { x: 10, y: 0 },
    verticalTrack: null,
  });
  expect(narrow.scene.entries.get("scroll")?.scrollMetrics?.horizontalTrack).not.toBeNull();
  const wide = runtime.render(view(25));
  expect(wide.layout.entries.get("scroll")?.rect.height).toBe(4);
  expect(wide.scene.entries.get("scroll")?.scrollMetrics?.horizontalTrack).toBeNull();
  expect(wide.scene.entries.get("scroll")?.scrollMetrics?.verticalTrack).toBeNull();
  runtime.dispose();
});

it("keeps fixed-height cross-axis overflow scrollable", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 10, height: 4 } });
  const frame = runtime.render(<Root><ScrollArea id="scroll" style={{ width: 10, height: 4 }}>
    <Box style={{ width: 20, height: 4 }} />
  </ScrollArea></Root>);
  expect(frame.layout.entries.get("scroll")?.rect.height).toBe(4);
  const metrics = frame.scene.entries.get("scroll")!.scrollMetrics!;
  expect(metrics.horizontalTrack).not.toBeNull();
  expect(metrics.verticalTrack).not.toBeNull();
  expect(metrics.maxOffset.y).toBe(1);
  runtime.dispose();
});

it("naturally sizes a Markdown table inside ScrollArea", () => {
  const source = "| Prop | Type | Description |\n| --- | --- | --- |\n| label | string | Accessible name |\n| columns | TableColumn[] | Ordered headers |\n| variant | plain or outline | Display style |\n| children | rows | Table content |";
  const runtime = new CellUiRuntime({ viewport: { width: 37, height: 100 } });
  const frame = runtime.render(<Root><ScrollArea id="scroll" style={{ width: 37 }}>
    <Markdown source={source} />
  </ScrollArea></Root>);
  expect(frame.layout.entries.get("scroll")?.rect.height).toBe(7);
  expect(frame.scene.entries.get("scroll")?.scrollMetrics?.verticalTrack).toBeNull();
  runtime.dispose();
});

it("keeps the Text vertical texture and makes both horizontal rails thumb-only", () => {
  const half = { start: 1, length: 4 };
  expect([0, 1, 2].map((cell) => textVerticalThumbGlyph(half, cell)))
    .toEqual(["\u{1FB92}", "█", "\u{1FB91}"]);
  expect(TEXT_VERTICAL_TRACK_GLYPH).toBe("\u{1FB90}");
  expect([0, 1, 2].map((cell) => thumbGlyph(half, cell, true))).toEqual(["╺", "━", "╸"]);

  const view = (scrollY: number) => <Root><ScrollArea id="scroll" scrollY={scrollY}
    style={{ width: 12, height: 8 }}><Box style={{ width: 24, height: 20 }} /></ScrollArea></Root>;
  const rich = new CellUiRuntime({ viewport: { width: 12, height: 8 } });
  const text = new CellUiRuntime({ viewport: { width: 12, height: 8 }, presentation: "text" });
  let sawHalf = false;
  for (const offset of [0, 1, 2, 4, 8, 12]) {
    const richFrame = rich.render(view(offset), { visibleScrollbarIds: new Set(["scroll"]) });
    const textFrame = text.render(view(offset), { visibleScrollbarIds: new Set(["scroll"]) });
    const metrics = textFrame.scene.entries.get("scroll")!.scrollMetrics!;
    expect(metrics).toEqual(richFrame.scene.entries.get("scroll")!.scrollMetrics);
    const track = metrics.verticalTrack!;
    const axis = metrics.verticalThumbAxis!;
    for (let y = track.y; y < track.y + track.height; y += 1) {
      const raw = thumbGlyph(axis, y - track.y, false);
      const expected = raw === " " ? TEXT_VERTICAL_TRACK_GLYPH
        : raw === "▀" ? "\u{1FB91}" : raw === "▄" ? "\u{1FB92}" : raw;
      const cell = textFrame.buffer.get(track.x, y)!;
      expect(cell).toMatchObject({ text: expected, ownerId: "scroll" });
      expect(cell.style.color).toBe(CLASSIC_MAC_LIGHT_THEME.scrollThumbStyle.color);
      expect(richFrame.buffer.get(track.x, y)?.text).toBe(raw);
      if (raw === "▀" || raw === "▄") sawHalf = true;
    }
    const horizontal = metrics.horizontalTrack!;
    for (let x = horizontal.x; x < horizontal.x + horizontal.width; x += 1) {
      const raw = thumbGlyph(metrics.horizontalThumbAxis!, x - horizontal.x, true);
      expect(textFrame.buffer.get(x, horizontal.y)).toMatchObject({ text: raw, ownerId: "scroll" });
      expect(richFrame.buffer.get(x, horizontal.y)).toMatchObject({ text: raw, ownerId: "scroll" });
    }
  }
  expect(sawHalf).toBe(true);
  rich.dispose();
  text.dispose();
});

it.each([CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME])(
  "TextArea thumb follows the active foreground in both presentations (%s)", (theme) => {
    for (const presentation of ["rich", "text"] as const) {
      const runtime = new CellUiRuntime({ viewport: { width: 12, height: 6 }, theme, presentation });
      const editor = new CellTextEditor({ value: Array.from({ length: 12 }, () => "x".repeat(30)).join("\n"), multiline: true });
      const view = () => <Root><TextArea id="area" frame="bordered" state={editor.snapshot()}
        style={{ width: 12, height: 6 }} /></Root>;
      const idle = runtime.render(view(), { visibleScrollbarIds: new Set(["area"]) });
      const active = runtime.render(view(), { focusedId: "area", activeFocusId: "area" });
      const metrics = active.scene.entries.get("area")!.scrollMetrics!;
      for (const thumb of [metrics.horizontalThumb!, metrics.verticalThumb!]) {
        const idleCell = idle.buffer.get(thumb.x, thumb.y)!;
        const activeCell = active.buffer.get(thumb.x, thumb.y)!;
        expect(idleCell.style.color).toBe(theme.scrollThumbStyle.color);
        expect(activeCell.style).toMatchObject({
          color: theme.focusedSurfaceStyle.color,
          backgroundColor: theme.focusedSurfaceStyle.backgroundColor,
        });
      }
      if (presentation === "text") {
        const track = metrics.verticalTrack!;
        const freeY = Array.from({ length: track.height }, (_, index) => track.y + index)
          .find((y) => y < metrics.verticalThumb!.y
            || y >= metrics.verticalThumb!.y + metrics.verticalThumb!.height)!;
        expect(idle.buffer.get(track.x, freeY)?.style.color).toBe(theme.scrollThumbStyle.color);
        expect(active.buffer.get(track.x, freeY)?.style).toMatchObject({
          color: theme.focusedSurfaceStyle.color,
          backgroundColor: theme.focusedSurfaceStyle.backgroundColor,
        });
      }
      expect(active.buffer.get(0, 0)).toEqual(idle.buffer.get(0, 0));
      runtime.dispose();
    }
  },
);

it.each(["scroll-area", "select-content", "combobox-content"] as const)(
  "%s rail resolves colliding custom surface and token colors", (kind) => {
    const theme = {
      ...CLASSIC_MAC_LIGHT_THEME,
      elevatedSurfaceStyle: { backgroundColor: "#111111" },
      scrollThumbStyle: { color: "rgb(17, 17, 17)" },
      scrollTrackStyle: { color: "#111111" },
    };
    const runtime = new CellUiRuntime({ viewport: { width: 16, height: 7 }, theme, presentation: "text" });
    const items = Array.from({ length: 8 }, (_, index) => ({ id: `item-${index}`, text: `Option ${index}` }));
    const content = kind === "select-content"
      ? <SelectContent id="content" textStyle={{ backgroundColor: "#111111" }} style={{ width: 12, height: 4 }}>
          {items.map((item) => <SelectItem id={item.id} key={item.id}><Text>{item.text}</Text></SelectItem>)}
        </SelectContent>
      : <ComboboxContent id="content" textStyle={{ backgroundColor: "#111111" }} style={{ width: 12, height: 4 }}>
          {items.map((item) => <ComboboxItem id={item.id} key={item.id}><Text>{item.text}</Text></ComboboxItem>)}
        </ComboboxContent>;
    const frame = runtime.render(kind === "scroll-area"
      ? <Root><ScrollArea id="content" variant="surface" style={{ width: 12, height: 4 }}>
          <Box style={{ height: 12 }} />
        </ScrollArea></Root>
      : kind === "select-content"
        ? <Root><Select id="control"><SelectTrigger id="trigger" label="Options" expanded controlsId="content"><Text>Option</Text></SelectTrigger>{content}</Select></Root>
        : <Root><Combobox id="control"><ComboboxInput id="input" label="Options" state={new CellTextEditor().snapshot()} expanded />{content}</Combobox></Root>,
      { visibleScrollbarIds: new Set(["content"]) });
    const metrics = frame.scene.entries.get("content")!.scrollMetrics!;
    const thumb = metrics.verticalThumb!;
    const track = metrics.verticalTrack!;
    expect(frame.buffer.get(thumb.x, thumb.y)?.style).toMatchObject({
      color: "#FFFFFF", backgroundColor: "#111111",
    });
    const freeY = Array.from({ length: track.height }, (_, index) => track.y + index)
      .find((y) => y < thumb.y || y >= thumb.y + thumb.height)!;
    expect(frame.buffer.get(track.x, freeY)?.style).toMatchObject({
      color: "#FFFFFF", backgroundColor: "#111111",
    });
    runtime.dispose();
  },
);

it("reserves a rail Cell before laying out auto-width outline buttons", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 }, presentation: "text" });
  const view = (count: number, scrollY = 0) => <Root><ScrollArea id="scroll" scrollY={scrollY}
    style={{ width: 12, height: 5 }}><Box id="items">
      {Array.from({ length: count }, (_, index) => <Button id={`row-${index}`} key={index} variant="ghost">
        <Text>{`Row ${index + 1}`}</Text>
      </Button>)}
    </Box></ScrollArea></Root>;

  const overflowing = runtime.render(view(8));
  const track = overflowing.scene.entries.get("scroll")!.scrollMetrics!.verticalTrack!;
  const button = overflowing.scene.entries.get("row-0")!.layoutBounds;
  expect(overflowing.layout.entries.get("scroll")?.railInsets).toEqual({ right: 1, bottom: 0 });
  expect(button.width).toBe(11);
  expect(overflowing.buffer.get(track.x - 1, button.y)).toMatchObject({ ownerId: "row-0", text: "]" });
  expect(overflowing.buffer.get(track.x, button.y)?.ownerId).toBe("scroll");

  const scrolled = runtime.render(view(8, 2));
  expect(scrolled.layout).toBe(overflowing.layout);
  expect(scrolled.buffer.get(track.x - 1, button.y)).toMatchObject({ ownerId: "row-2", text: "]" });

  const fitting = runtime.render(view(1));
  expect(fitting.scene.entries.get("scroll")?.scrollMetrics?.verticalTrack).toBeNull();
  expect(fitting.layout.entries.get("scroll")?.railInsets).toBeUndefined();
  expect(fitting.scene.entries.get("row-0")?.layoutBounds.width).toBe(12);
  expect(fitting.buffer.get(11, 0)).toMatchObject({ ownerId: "row-0", text: "]" });
  runtime.dispose();
});

it("reserves distinct rail Cells through nested scroll containers", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 }, presentation: "text" });
  const frame = runtime.render(<Root><ScrollArea id="outer" style={{ width: 12, height: 5 }}>
    <ScrollArea id="inner" style={{ height: 4 }}><Box>
      {Array.from({ length: 8 }, (_, index) => <Button id={`row-${index}`} key={index}>
        <Text>{`Row ${index}`}</Text>
      </Button>)}
    </Box></ScrollArea>
    <Box style={{ height: 10 }} />
  </ScrollArea></Root>);
  const outerTrack = frame.scene.entries.get("outer")!.scrollMetrics!.verticalTrack!;
  const innerTrack = frame.scene.entries.get("inner")!.scrollMetrics!.verticalTrack!;
  const row = frame.scene.entries.get("row-0")!.layoutBounds;
  expect(frame.layout.entries.get("outer")?.railInsets?.right).toBe(1);
  expect(frame.layout.entries.get("inner")?.railInsets?.right).toBe(1);
  expect(innerTrack.x + 1).toBe(outerTrack.x);
  expect(row.x + row.width).toBe(innerTrack.x);
  expect(frame.buffer.get(innerTrack.x - 1, row.y)).toMatchObject({ ownerId: "row-0", text: "]" });
  runtime.dispose();
});

it("keeps user padding and border separate from the conditional rail inset", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 14, height: 6 }, presentation: "text" });
  const frame = runtime.render(<Root><ScrollArea id="scroll" frame="bordered"
    style={{ width: 14, height: 6, paddingLeft: 1, paddingRight: 2 }}>
      <Box>{Array.from({ length: 8 }, (_, index) => <Button id={`row-${index}`} key={index}>
        <Text>{`Row ${index}`}</Text>
      </Button>)}</Box>
    </ScrollArea></Root>);
  const layout = frame.layout.entries.get("scroll")!;
  const metrics = frame.scene.entries.get("scroll")!.scrollMetrics!;
  const first = frame.scene.entries.get("row-0")!.layoutBounds;
  expect(layout.paddingInsets).toMatchObject({ left: 1, right: 3 });
  expect(layout.railInsets).toEqual({ right: 1, bottom: 0 });
  expect(metrics.viewport.width).toBe(layout.contentRect.width);
  expect(metrics.verticalTrack!.x - (first.x + first.width)).toBe(2);
  expect(metrics.verticalTrack!.x).toBe(12);
  expect(frame.buffer.get(metrics.verticalTrack!.x, first.y)?.ownerId).toBe("scroll");
  expect(frame.buffer.get(13, 0)?.text).toBe("┐");
  runtime.dispose();
});

it.each(["rich", "text"] as const)("TextArea rails touch the inner edge without removing content insets (%s)", (presentation) => {
  const runtime = new CellUiRuntime({ viewport: { width: 14, height: 7 }, presentation });
  const editor = new CellTextEditor({ value: Array.from({ length: 12 }, () => "x".repeat(30)).join("\n"), multiline: true });
  const view = (scrollX = 0, scrollY = 0) => <Root><TextArea id="area" frame="bordered"
    state={{ ...editor.snapshot(), scrollX, scrollY }}
    style={{ width: 14, height: 7, paddingLeft: 1, paddingRight: 2 }} /></Root>;
  const start = runtime.render(view(), { focusedId: "area", activeFocusId: "area" });
  const entry = start.scene.entries.get("area")!;
  const { viewport, horizontalTrack, verticalTrack, horizontalThumb, verticalThumb, corner, maxOffset } = entry.scrollMetrics!;
  expect(viewport.x).toBeGreaterThan(entry.decorationBounds.x);
  expect(horizontalTrack).toMatchObject({ x: entry.decorationBounds.x,
    y: entry.decorationBounds.y + entry.decorationBounds.height - 1 });
  expect(verticalTrack).toMatchObject({ x: entry.decorationBounds.x + entry.decorationBounds.width - 1,
    y: entry.decorationBounds.y });
  expect(horizontalThumb!.x).toBe(horizontalTrack!.x);
  expect(verticalThumb!.y).toBe(verticalTrack!.y);
  expect(corner).toMatchObject({ x: verticalTrack!.x, y: horizontalTrack!.y });
  expect(start.buffer.get(horizontalTrack!.x - 1, horizontalTrack!.y)?.text).toBe("│");
  expect(start.buffer.get(horizontalTrack!.x, horizontalTrack!.y)?.text).toBe("━");
  expect(start.buffer.get(verticalTrack!.x, verticalTrack!.y - 1)?.text).toBe("─");
  expect(start.buffer.get(verticalTrack!.x, verticalTrack!.y)?.text).toBe("█");
  const end = runtime.render(view(maxOffset.x, maxOffset.y),
    { focusedId: "area", activeFocusId: "area" }).scene.entries.get("area")!.scrollMetrics!;
  expect(end.horizontalThumb!.x + end.horizontalThumb!.width).toBe(end.horizontalTrack!.x + end.horizontalTrack!.width);
  expect(end.verticalThumb!.y + end.verticalThumb!.height).toBe(end.verticalTrack!.y + end.verticalTrack!.height);
  runtime.dispose();
});

it("surface TextArea rails reach the surface edge while text keeps its inset", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 14, height: 7 } });
  const editor = new CellTextEditor({ value: Array.from({ length: 12 }, () => "x".repeat(30)).join("\n"), multiline: true });
  const frame = runtime.render(<Root><TextArea id="area" variant="surface" state={editor.snapshot()}
    style={{ width: 14, height: 7 }} /></Root>, { focusedId: "area", activeFocusId: "area" });
  const entry = frame.scene.entries.get("area")!;
  const metrics = entry.scrollMetrics!;
  expect(entry.contentBounds.x).toBe(entry.decorationBounds.x + 1);
  expect(metrics.horizontalTrack!.x).toBe(entry.decorationBounds.x);
  expect(metrics.verticalTrack!.x).toBe(entry.decorationBounds.x + entry.decorationBounds.width - 1);
  expect(frame.buffer.get(metrics.horizontalTrack!.x, metrics.horizontalTrack!.y)?.text).toBe("━");
  runtime.dispose();
});

it("padded ScrollArea uses the inner frame edge for both rails and their corner", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 14, height: 8 } });
  const view = (scrollX = 0, scrollY = 0) => <Root><ScrollArea id="scroll" frame="bordered"
    scrollX={scrollX} scrollY={scrollY}
    style={{ width: 14, height: 8, paddingLeft: 1, paddingRight: 2, paddingTop: 1, paddingBottom: 1 }}>
    <Box style={{ width: 30, height: 20 }} />
  </ScrollArea></Root>;
  const start = runtime.render(view());
  const entry = start.scene.entries.get("scroll")!;
  const metrics = entry.scrollMetrics!;
  expect(metrics.viewport.x).toBeGreaterThan(entry.decorationBounds.x);
  expect(metrics.viewport.y).toBeGreaterThan(entry.decorationBounds.y);
  expect(metrics.horizontalTrack).toMatchObject({ x: entry.decorationBounds.x,
    y: entry.decorationBounds.y + entry.decorationBounds.height - 1 });
  expect(metrics.verticalTrack).toMatchObject({ x: entry.decorationBounds.x + entry.decorationBounds.width - 1,
    y: entry.decorationBounds.y });
  expect(metrics.corner).toMatchObject({ x: metrics.verticalTrack!.x, y: metrics.horizontalTrack!.y });
  expect(metrics.horizontalThumb!.x).toBe(metrics.horizontalTrack!.x);
  expect(metrics.verticalThumb!.y).toBe(metrics.verticalTrack!.y);
  const end = runtime.render(view(metrics.maxOffset.x, metrics.maxOffset.y)).scene.entries.get("scroll")!.scrollMetrics!;
  expect(end.horizontalThumb!.x + end.horizontalThumb!.width).toBe(end.horizontalTrack!.x + end.horizontalTrack!.width);
  expect(end.verticalThumb!.y + end.verticalThumb!.height).toBe(end.verticalTrack!.y + end.verticalTrack!.height);
  runtime.dispose();
});

it.each(["select", "combobox"] as const)("reserves the %s popup rail before item layout", (kind) => {
  const runtime = new CellUiRuntime({ viewport: { width: 16, height: 7 }, presentation: "text" });
  const items = Array.from({ length: 8 }, (_, index) => ({ id: `item-${index}`, text: `Option ${index}` }));
  const content = kind === "select"
    ? <SelectContent id="content" style={{ width: 12, height: 4, paddingRight: 1 }}>
        {items.map((item) => <SelectItem id={item.id} key={item.id}><Text>{item.text}</Text></SelectItem>)}
      </SelectContent>
    : <ComboboxContent id="content" style={{ width: 12, height: 4, paddingRight: 1 }}>
        {items.map((item) => <ComboboxItem id={item.id} key={item.id}><Text>{item.text}</Text></ComboboxItem>)}
      </ComboboxContent>;
  const frame = runtime.render(kind === "select"
    ? <Root><Select id="control" style={{ width: 12 }}>
        <SelectTrigger id="trigger" label="Options" expanded controlsId="content"><Text>Option</Text></SelectTrigger>
        {content}
      </Select></Root>
    : <Root><Combobox id="control" style={{ width: 12 }}>
        <ComboboxInput id="input" label="Options" state={new CellTextEditor({ value: "" }).snapshot()} expanded />
        {content}
      </Combobox></Root>);
  const metrics = frame.scene.entries.get("content")!.scrollMetrics!;
  const track = metrics.verticalTrack!;
  const first = frame.scene.entries.get("item-0")!.layoutBounds;
  expect(frame.layout.entries.get("content")?.railInsets).toEqual({ right: 1, bottom: 0 });
  expect(track.x - (first.x + first.width)).toBe(1);
  const decoration = frame.scene.entries.get("content")!.decorationBounds;
  expect(track.x).toBe(decoration.x + decoration.width - 1);
  expect(frame.buffer.get(track.x, first.y)?.ownerId).toBe("content");
  runtime.dispose();
});

it("half-Cell thumb movement repaints exactly like a fresh frame", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 8, height: 7 } });
  const view = (scrollY: number) => <Root><ScrollArea id="scroll" frame="bordered" scrollY={scrollY} style={{ width: 8, height: 7 }}><Box style={{ height: 20 }} /></ScrollArea></Root>;
  for (let offset = 0; offset <= 15; offset++) {
    const frame = runtime.render(view(offset));
    const fresh = new CellUiRuntime({ viewport: { width: 8, height: 7 } });
    const oracle = fresh.render(view(offset));
    for (let y = 0; y < 7; y++) for (let x = 0; x < 8; x++) expect(frame.buffer.get(x, y)).toEqual(oracle.buffer.get(x, y));
    fresh.dispose();
  }
  runtime.dispose();
});

it("precise dragging accumulates small moves, reverses without drift, and cancels on resize", async () => {
  let scrollY = 0;
  let height = 10;
  const pilot = createTestPilot({
    viewport: { width: 8, height: 12 },
    render: () => <Root><ScrollArea id="scroll" scrollY={scrollY} style={{ width: 8, height }}><Box style={{ height: 100 }} /></ScrollArea></Root>,
    onCommand: (command) => { if (command.type === "scroll") scrollY = command.scrollY; },
  });
  await pilot.pointerDown({ x: 7, y: 0 }, 1, { x: 7.5, y: 0.1 });
  for (const y of [0.2, 0.4]) await pilot.pointerMove({ x: 7, y: Math.floor(y) }, 1, { x: 7.5, y });
  expect(scrollY).toBe(0);
  for (const y of [0.6, 0.7, 0.8, 0.9, 1.1]) await pilot.pointerMove({ x: 7, y: Math.floor(y) }, 1, { x: 7.5, y });
  expect(scrollY).toBe(10);
  await pilot.pointerMove({ x: 7, y: 0 }, 1, { x: 7.5, y: 0.1 });
  expect(scrollY).toBe(0);
  height = 8;
  await pilot.resize({ width: 8, height: 12 });
  await pilot.pointerMove({ x: 7, y: 5 }, 1, { x: 7.5, y: 5.1 });
  expect(scrollY).toBe(0);
  pilot.dispose();
});

it("horizontal dragging uses the same anchor and applies the final pointer-up position", async () => {
  let scrollX = 0;
  const pilot = createTestPilot({
    viewport: { width: 10, height: 5 },
    render: () => <Root><ScrollArea id="scroll" scrollX={scrollX} style={{ width: 10, height: 5 }}><Box style={{ width: 100, height: 1 }} /></ScrollArea></Root>,
    onCommand: (command) => { if (command.type === "scroll") scrollX = command.scrollX; },
  });
  await pilot.pointerDown({ x: 0, y: 4 }, 1, { x: 0.1, y: 4.5 });
  await pilot.pointerMove({ x: 0, y: 4 }, 1, { x: 0.6, y: 4.5 });
  expect(scrollX).toBe(5);
  await pilot.pointerUp({ x: 1, y: 4 }, 1, { x: 1.1, y: 4.5 });
  expect(scrollX).toBe(10);
  pilot.dispose();
});

it("the uncovered half of an edge Cell pages instead of capturing the thumb", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 8, height: 5 } });
  const frame = runtime.render(<Root><ScrollArea id="scroll" style={{ width: 8, height: 5 }}><Box style={{ height: 16 }} /></ScrollArea></Root>);
  const path = getEventPath(frame.scene, "scroll");
  const point = { x: 7, y: 1 };
  expect(gestureCandidatesForFrame(frame, path, point, { x: 7.5, y: 1.25 }).some((item) => item.kind === "drag")).toBe(true);
  expect(gestureCandidatesForFrame(frame, path, point, { x: 7.5, y: 1.75 }).some((item) => item.kind === "drag")).toBe(false);
  runtime.dispose();
});

it("offers a drag gesture only on axes with actual scroll range", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
  const candidates = (width: number, height: number) => {
    const frame = runtime.render(<Root><ScrollArea id="scroll" style={{ width: 12, height: 5 }}>
      <Box style={{ width, height }}><Button id="save"><Text>Save</Text></Button></Box>
    </ScrollArea></Root>);
    return gestureCandidatesForFrame(frame, getEventPath(frame.scene, "save"), { x: 1, y: 0 });
  };
  expect(candidates(10, 1)).toMatchObject([{ targetId: "save", kind: "tap", rearmable: true }]);
  expect(candidates(10, 8).find((candidate) => candidate.kind === "scroll")?.axis).toBe("y");
  expect(candidates(20, 1).find((candidate) => candidate.kind === "scroll")?.axis).toBe("x");
  runtime.dispose();
});

it("lets an overflowing parent own drag when its nested scroll area fits", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
  const frame = runtime.render(<Root><ScrollArea id="outer" style={{ width: 12, height: 5 }}>
    <ScrollArea id="inner" style={{ width: 10, height: 2 }}>
      <Button id="save"><Text>Save</Text></Button>
    </ScrollArea>
    <Box style={{ height: 8 }} />
  </ScrollArea></Root>);
  expect(gestureCandidatesForFrame(frame, getEventPath(frame.scene, "save"), { x: 1, y: 0 })
    .find((candidate) => candidate.kind === "scroll")).toMatchObject({ targetId: "outer", axis: "y" });
  runtime.dispose();
});

it("clamps stale offsets when scroll content shrinks", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
  const view = (height: number) => <Root><ScrollArea id="scroll" scrollY={5} style={{ width: 12, height: 5 }}>
    <Box style={{ height }}><Text id="content">content</Text></Box>
  </ScrollArea></Root>;
  runtime.render(view(10));
  const shrunk = runtime.render(view(1));
  expect(shrunk.scene.entries.get("content")?.paintVisible).toBe(true);
  expect(shrunk.scene.entries.get("scroll")?.scrollMetrics?.verticalTrack).toBeNull();
  expect(scrollViewportCommands(shrunk)).toEqual([{ type: "scroll", targetId: "scroll", scrollX: 0, scrollY: 0 }]);
  runtime.dispose();
});

it("does not infer horizontal overflow when explicit content fits beside a vertical rail", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 8, height: 5 } });
  const frame = runtime.render(
    <Root>
      <ScrollArea id="scroll" style={{ width: 8, height: 5 }}>
        <Box style={{ width: 7, height: 10 }} />
      </ScrollArea>
    </Root>
  );
  const metrics = frame.scene.entries.get("scroll")!.scrollMetrics!;

  expect(metrics.verticalTrack).not.toBeNull();
  expect(metrics.horizontalTrack).toBeNull();
  expect(metrics.viewport).toEqual({ x: 0, y: 0, width: 7, height: 5 });
  expect(metrics.contentSize).toEqual({ width: 7, height: 10 });
  runtime.dispose();
});

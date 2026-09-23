import { expect, it } from "vitest";
import { paintBorder, type CellBorderShape, type CellFrame } from "./border.js";
import { Box, CellBuffer, CellTextEditor, CellUiRuntime, CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME, Dialog, DialogTitle, Overlay, Root, ScrollArea, Text, TextArea, hitTestCell, type SurfaceVariant } from "./index.js";

it("preserves ghost and surface backgrounds independently of frame geometry", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 } });
  const frame = runtime.render(<Root style={{ direction: "row" }}>
    <Box id="ghost" variant="ghost" style={{ width: 4, height: 3 }}><Text>P</Text></Box>
    <Box id="surface" variant="surface" style={{ width: 4, height: 3 }}><Text>R</Text></Box>
    <Box id="bordered" frame="bordered" style={{ width: 4, height: 3 }}><Text>B</Text></Box>
  </Root>);

  expect(frame.layout.entries.get("ghost")?.borderInsets)
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(frame.layout.entries.get("surface")?.borderInsets)
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(frame.layout.entries.get("bordered")?.borderInsets)
    .toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
  expect(frame.buffer.get(1, 1)?.style.backgroundColor).toBeUndefined();
  expect(frame.buffer.get(5, 1)?.style.backgroundColor).toBe("#E6E6E6");
  expect(frame.buffer.toText({ trimEnd: true })).toBe("P   R   ┌──┐\n        │B │\n        └──┘");
  runtime.dispose();
});

it("combines each surface variant with and without a border", () => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 6, height: 3 }, theme });
    for (const variant of ["ghost", "surface"] as SurfaceVariant[]) {
      for (const frame of ["none", "bordered"] as CellFrame[]) {
        const result = runtime.render(<Root><Box id="block" variant={variant} frame={frame}
          style={{ width: 6, height: 3 }}><Text>B</Text></Box></Root>);
        const expectedBackground = variant === "ghost" ? undefined
          : theme.elevatedSurfaceStyle.backgroundColor;
        expect(result.layout.entries.get("block")?.borderInsets).toEqual({
          top: frame === "bordered" ? 1 : 0,
          right: frame === "bordered" ? 1 : 0,
          bottom: frame === "bordered" ? 1 : 0,
          left: frame === "bordered" ? 1 : 0,
        });
        expect(result.buffer.get(5, 1)?.style.backgroundColor).toBe(expectedBackground);
        expect(result.buffer.get(0, 0)?.text).toBe(frame === "bordered" ? "┌" : "B");
      }
    }
    runtime.dispose();
  }
});

it("uses surface Overlay and surface plus bordered Dialog defaults", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 10, height: 5 } });
  const overlay = runtime.render(<Root>
    <Overlay id="overlay" position={{ x: 0, y: 0 }} style={{ width: 4, height: 3 }}><Text>O</Text></Overlay>
  </Root>);
  expect(overlay.tree.nodes.get("overlay")?.surfaceVariant).toBe("surface");
  expect(overlay.tree.nodes.get("overlay")?.frame).toBe("none");
  expect(overlay.layout.entries.get("overlay")?.borderInsets)
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(overlay.buffer.get(3, 2)?.style.backgroundColor).toBe("#E6E6E6");
  const dialog = runtime.render(<Root>
    <Dialog id="dialog"><DialogTitle>Title</DialogTitle></Dialog>
  </Root>);
  expect(dialog.tree.nodes.get("dialog")?.surfaceVariant).toBe("surface");
  expect(dialog.tree.nodes.get("dialog")?.frame).toBe("bordered");
  expect(dialog.layout.entries.get("dialog")?.borderInsets)
    .toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
  const frameless = runtime.render(<Root>
    <Dialog id="dialog" border="none"><DialogTitle>Title</DialogTitle></Dialog>
  </Root>);
  expect(frameless.layout.entries.get("dialog")?.borderInsets)
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(frameless.tree.nodes.get("dialog")?.surfaceVariant).toBe("surface");
  runtime.dispose();
});

it("supports surface backgrounds inside framed Overlay, Dialog, ScrollArea, and TextArea", () => {
  const editor = new CellTextEditor({ value: "Hi", multiline: true });
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    for (const kind of ["overlay", "dialog", "scroll", "editor"] as const) {
      const runtime = new CellUiRuntime({ viewport: { width: 16, height: 8 }, theme });
      const element = kind === "overlay"
        ? <Overlay id={kind} position={{ x: 0, y: 0 }} variant="surface" frame="bordered"
            style={{ width: 8, height: 4 }}><Text>Hi</Text></Overlay>
        : kind === "dialog"
          ? <Dialog id={kind} variant="surface" border="square" style={{ width: 8, height: 4 }}>
              <DialogTitle>Hi</DialogTitle>
            </Dialog>
          : kind === "scroll"
            ? <ScrollArea id={kind} variant="surface" frame="bordered" style={{ width: 8, height: 4 }}>
                <Text>Hi</Text>
              </ScrollArea>
            : <TextArea id={kind} variant="surface" frame="bordered" state={editor.snapshot()}
                style={{ width: 8, height: 4 }} />;
      const result = runtime.render(<Root>{element}</Root>);
      const bounds = result.scene.entries.get(kind)!.layoutBounds;
      expect(result.tree.nodes.get(kind)).toMatchObject({ surfaceVariant: "surface", frame: "bordered" });
      expect(result.buffer.get(bounds.x, bounds.y)).toMatchObject({
        text: "┌", style: { backgroundColor: theme.elevatedSurfaceStyle.backgroundColor },
      });
      runtime.dispose();
    }
  }
});

it("invalidates surface geometry and paint at their owning boundaries", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 6, height: 3 } });
  const view = (variant: SurfaceVariant, frame: CellFrame = "none", borderShape: CellBorderShape = "square") => (
    <Root><Box id="block" variant={variant} frame={frame} borderShape={borderShape} style={{ width: 6, height: 3 }} /></Root>
  );
  runtime.render(view("ghost"));
  const surface = runtime.render(view("surface"));
  expect(surface.invalidation.work).toMatchObject({ layout: "reused", paint: "computed" });
  const bordered = runtime.render(view("surface", "bordered"));
  expect(bordered.invalidation.work).toMatchObject({ layout: "computed", paint: "computed" });
  const ghost = runtime.render(view("ghost", "bordered"));
  expect(ghost.invalidation.work).toMatchObject({ layout: "reused", paint: "computed" });
  const rounded = runtime.render(view("ghost", "bordered", "rounded"));
  expect(rounded.invalidation.work).toMatchObject({ layout: "reused", paint: "computed" });
  expect(rounded.buffer.get(0, 0)?.text).toBe("╭");
  runtime.dispose();
});

it.each([
  ["square", "┌─┐\n│ │\n└─┘"],
  ["rounded", "╭─╮\n│ │\n╰─╯"],
] as const)("%s borders preserve owned Unicode, background and clipping", (shape, expected) => {
  const buffer = new CellBuffer({ width: 3, height: 3 });
  const bounds = { x: 0, y: 0, width: 3, height: 3 };
  buffer.writeText(0, 0, "   ", "surface", { backgroundColor: "red" });
  paintBorder(buffer, "border", bounds, shape, { color: "gray" }, bounds);
  expect(buffer.toText()).toBe(expected);
  expect(buffer.get(0, 0)).toMatchObject({
    ownerId: "border",
    style: { color: "gray", backgroundColor: "red" },
  });
  const clipped = new CellBuffer({ width: 3, height: 3 });
  paintBorder(clipped, "border", bounds, shape, {}, { x: 1, y: 0, width: 1, height: 3 });
  expect(clipped.toText()).toBe(" ─ \n   \n ─ ");
  for (const size of [{ width: 1, height: 3 }, { width: 3, height: 1 }]) {
    const tiny = new CellBuffer(size);
    paintBorder(tiny, "border", { x: 0, y: 0, ...size }, shape, {}, bounds);
    expect(tiny.get(0, 0)?.ownerId).toBeNull();
  }
});

it("shape changes reuse geometry across glyphs and repaint like a fresh frame", () => {
  const viewport = { width: 18, height: 15 };
  const view = <Root>
    <Box id="box" frame="bordered" style={{ width: 12, height: 5 }}>
      <Box id="nested" frame="bordered" style={{ width: 6, height: 3 }} />
    </Box>
    <ScrollArea id="scroll" frame="bordered" style={{ width: 12, height: 4 }}><Box style={{ height: 12 }} /></ScrollArea>
    <TextArea id="editor" frame="bordered" style={{ width: 12, height: 4 }} />
    <Overlay id="overlay" frame="bordered" position={{ x: 13, y: 0 }} style={{ width: 5, height: 4 }} />
  </Root>;
  const runtime = new CellUiRuntime({ viewport });
  const before = runtime.render(view);
  for (const borderShape of ["rounded", "square"] as CellBorderShape[]) {
    runtime.setTheme({ borderShape });
    const frame = runtime.render(view);
    expect(frame.layout).toBe(before.layout);
    expect(frame.scene).toBe(before.scene);
    for (const id of ["box", "nested", "scroll", "editor", "overlay"]) {
      const bounds = frame.scene.entries.get(id)!.layoutBounds;
      expect(frame.buffer.get(bounds.x, bounds.y)?.text).toBe(borderShape === "rounded" ? "╭" : "┌");
      expect(hitTestCell(frame.scene, bounds)).toEqual(hitTestCell(before.scene, bounds));
    }
    const fresh = new CellUiRuntime({ viewport, theme: { borderShape } });
    const oracle = fresh.render(view);
    expect(frame.buffer.toText()).toBe(oracle.buffer.toText());
    for (let y = 0; y < viewport.height; y++) for (let x = 0; x < viewport.width; x++) {
      expect(frame.buffer.get(x, y)).toEqual(oracle.buffer.get(x, y));
    }
    expect(frame.buffer.get(13, 0)?.style.backgroundColor).toBe("#E6E6E6");
    fresh.dispose();
  }
  runtime.dispose();
});

it("local border shape overrides the theme without changing geometry or hit ownership", () => {
  const viewport = { width: 12, height: 7 };
  const view = <Root>
    <Box id="local" frame="bordered" borderShape="rounded" style={{ width: 6, height: 3 }} />
    <Box id="theme" frame="bordered" style={{ width: 6, height: 3 }} />
  </Root>;
  const runtime = new CellUiRuntime({ viewport, theme: { borderShape: "square" } });
  const before = runtime.render(view);
  const localBounds = before.scene.entries.get("local")!.layoutBounds;
  const themeBounds = before.scene.entries.get("theme")!.layoutBounds;

  expect(before.buffer.get(localBounds.x, localBounds.y)?.text).toBe("╭");
  expect(before.buffer.get(themeBounds.x, themeBounds.y)?.text).toBe("┌");

  runtime.setTheme({ borderShape: "rounded" });
  const after = runtime.render(view);
  expect(after.layout).toBe(before.layout);
  expect(after.scene).toBe(before.scene);
  expect(after.buffer.get(localBounds.x, localBounds.y)?.text).toBe("╭");
  expect(after.buffer.get(themeBounds.x, themeBounds.y)?.text).toBe("╭");
  expect(hitTestCell(after.scene, localBounds)).toEqual(hitTestCell(before.scene, localBounds));
  runtime.dispose();
});

import { expect, it } from "vitest";
import { paintBorder, type CellBorderShape } from "./border.js";
import { Box, CellBuffer, CellUiRuntime, Dialog, DialogTitle, Overlay, Root, ScrollArea, Text, TextArea, hitTestCell } from "./index.js";

it("keeps Block variants mutually exclusive in geometry, characters, and substrate", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 } });
  const frame = runtime.render(<Root style={{ direction: "row" }}>
    <Box id="plain" variant="plain" style={{ width: 4, height: 3 }}><Text>P</Text></Box>
    <Box id="raised" variant="raised" style={{ width: 4, height: 3 }}><Text>R</Text></Box>
    <Box id="bordered" variant="bordered" style={{ width: 4, height: 3 }}><Text>B</Text></Box>
  </Root>);

  expect(frame.layout.entries.get("plain")?.borderInsets)
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(frame.layout.entries.get("raised")?.borderInsets)
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(frame.layout.entries.get("bordered")?.borderInsets)
    .toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
  expect(frame.buffer.get(1, 1)?.style.backgroundColor).toBeUndefined();
  expect(frame.buffer.get(5, 1)?.style.backgroundColor).toBe("#E6E6E6");
  expect(frame.buffer.toText({ trimEnd: true })).toBe("P   R   ┌──┐\n        │B │\n        └──┘");
  runtime.dispose();
});

it("uses raised Overlay and bordered Dialog defaults", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 10, height: 5 } });
  const overlay = runtime.render(<Root>
    <Overlay id="overlay" position={{ x: 0, y: 0 }} style={{ width: 4, height: 3 }}><Text>O</Text></Overlay>
  </Root>);
  expect(overlay.tree.nodes.get("overlay")?.blockVariant).toBe("raised");
  expect(overlay.layout.entries.get("overlay")?.borderInsets)
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  expect(overlay.buffer.get(3, 2)?.style.backgroundColor).toBe("#E6E6E6");
  const dialog = runtime.render(<Root>
    <Dialog id="dialog"><DialogTitle>Title</DialogTitle></Dialog>
  </Root>);
  expect(dialog.tree.nodes.get("dialog")?.blockVariant).toBe("bordered");
  expect(dialog.layout.entries.get("dialog")?.borderInsets)
    .toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
  runtime.dispose();
});

it("invalidates Block geometry and paint at their owning boundaries", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 6, height: 3 } });
  const view = (variant: "plain" | "raised" | "bordered", borderShape: CellBorderShape = "square") => (
    <Root><Box id="block" variant={variant} borderShape={borderShape} style={{ width: 6, height: 3 }} /></Root>
  );
  runtime.render(view("plain"));
  const raised = runtime.render(view("raised"));
  expect(raised.invalidation.work).toMatchObject({ layout: "reused", paint: "computed" });
  const bordered = runtime.render(view("bordered"));
  expect(bordered.invalidation.work).toMatchObject({ layout: "computed", paint: "computed" });
  const rounded = runtime.render(view("bordered", "rounded"));
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
    <Box id="box" variant="bordered" style={{ width: 12, height: 5 }}>
      <Box id="nested" variant="bordered" style={{ width: 6, height: 3 }} />
    </Box>
    <ScrollArea id="scroll" variant="bordered" style={{ width: 12, height: 4 }}><Box style={{ height: 12 }} /></ScrollArea>
    <TextArea id="editor" variant="bordered" style={{ width: 12, height: 4 }} />
    <Overlay id="overlay" variant="bordered" position={{ x: 13, y: 0 }} style={{ width: 5, height: 4 }} />
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
    expect(frame.buffer.get(13, 0)?.style.backgroundColor).toBe("#FFFFFF");
    fresh.dispose();
  }
  runtime.dispose();
});

it("local border shape overrides the theme without changing geometry or hit ownership", () => {
  const viewport = { width: 12, height: 7 };
  const view = <Root>
    <Box id="local" variant="bordered" borderShape="rounded" style={{ width: 6, height: 3 }} />
    <Box id="theme" variant="bordered" style={{ width: 6, height: 3 }} />
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

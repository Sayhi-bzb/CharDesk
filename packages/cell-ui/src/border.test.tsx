import { expect, it } from "vitest";
import { paintBorder, type CellBorderShape } from "./border.js";
import { Box, CellBuffer, CellUiRuntime, Overlay, Root, ScrollArea, TextArea, hitTestCell } from "./index.js";

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
    <Box id="box" style={{ border: true, width: 12, height: 5 }}>
      <Box id="nested" style={{ border: true, width: 6, height: 3 }} />
    </Box>
    <ScrollArea id="scroll" style={{ border: true, width: 12, height: 4 }}><Box style={{ height: 12 }} /></ScrollArea>
    <TextArea id="editor" style={{ border: true, width: 12, height: 4 }} />
    <Overlay id="overlay" position={{ x: 13, y: 0 }} style={{ border: true, width: 5, height: 4 }} />
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
    <Box id="local" style={{ border: true, borderShape: "rounded", width: 6, height: 3 }} />
    <Box id="theme" style={{ border: true, width: 6, height: 3 }} />
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

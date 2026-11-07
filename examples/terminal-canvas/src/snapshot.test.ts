import { expect, test } from 'bun:test';
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { resolveSnapshotFont } from './snapshotFonts.ts';
import { TerminalCanvas } from './model.ts';
import {
  captureSelectionSnapshot,
  renderSelectionSnapshot,
  resolveSnapshotLayout,
} from './snapshot.ts';

const palette = { color: '#eeeeee', background: '#223344' };

test('snapshot expands a follower selection to whole CJK/emoji without the range overlay or adjacent content', async () => {
  const model = new TerminalCanvas('A界🦀Z');
  try {
    model.selection = { anchor: { x: 2, y: 0 }, focus: { x: 4, y: 0 } };
    const original = model.plane.materialize();
    const snapshot = captureSelectionSnapshot(model);
    expect(snapshot.entries.map((entry) => entry.cell.text)).toEqual(['界', '🦀']);
    expect(snapshot.entries.map((entry) => [entry.x, entry.cell.width])).toEqual([
      [9, 2],
      [27, 2],
    ]);
    expect(snapshot.width).toBe(108);
    expect(snapshot.height).toBe(120);
    const cjkFont = resolveSnapshotFont({
      grapheme: '界',
      route: 'text',
      bold: false,
      italic: false,
    });
    const emojiFont = resolveSnapshotFont({
      grapheme: '🦀',
      route: 'emoji',
      bold: false,
      italic: false,
    });
    expect(cjkFont).toMatch(/CharDesk Snapshot/);
    expect(emojiFont).toMatch(/CharDesk Snapshot/);
    expect(cjkFont).not.toBe(emojiFont);
    const image = renderSelectionSnapshot(snapshot, palette);
    expect([...image.rgba.subarray(0, 4)]).toEqual([34, 51, 68, 255]);
    const pixel = (x: number, y: number) => [
      ...image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
    ];
    // Both physical columns contain glyph ink, rather than clipping a wide glyph at its anchor.
    for (const [start, end] of [
      [18, 36],
      [36, 54],
      [54, 72],
      [72, 90],
    ]) {
      let ink = 0;
      for (let y = 40; y < 80; y++)
        for (let x = start!; x < end!; x++)
          if (pixel(x, y).some((v, i) => v !== [34, 51, 68, 255][i])) ink++;
      expect(ink).toBeGreaterThan(0);
    }
    const canvas = createCanvas(image.width, image.height);
    canvas
      .getContext('2d')
      .putImageData(
        new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height),
        0,
        0
      );
    const png = await canvas.encode('png');
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const decoded = await loadImage(png);
    expect([decoded.width, decoded.height]).toEqual([108, 120]);
    if (process.env.CHARDESK_SNAPSHOT_PREVIEW)
      writeFileSync(process.env.CHARDESK_SNAPSHOT_PREVIEW, png);
    expect(model.plane.materialize()).toEqual(original);
    expect(model.canUndo).toBe(false);
  } finally {
    model.dispose();
  }
});

test('snapshot omits envelope holes and padding neighbors and captures styles before async Host IO', () => {
  const model = new TerminalCanvas('\x1b[31;44;1mA界\x1b[0mZ\nABCDE');
  try {
    model.selection = { anchor: { x: 0, y: 0 }, focus: { x: 1, y: 1 } };
    const captured = captureSelectionSnapshot(model);
    expect(captured.entries.map((entry) => entry.cell.text)).toEqual(['A', '界', 'A', 'B']);
    expect(captured.entries[0]?.cell.attrs?.bold).toBe(true);
    expect(captured.entries[0]?.cell.bgColor).toBeDefined();
    model.commands.insert('CHANGED');
    expect(captured.entries.map((entry) => entry.cell.text)).toEqual(['A', '界', 'A', 'B']);
    const image = renderSelectionSnapshot(captured, palette);
    const offset = ((80 + 10) * image.width + 54 + 5) * 4; // lower envelope hole
    expect([...image.rgba.subarray(offset, offset + 4)]).toEqual([34, 51, 68, 255]);
  } finally {
    model.dispose();
  }
});

test('snapshot rejects empty and oversized selections before allocating raster memory', () => {
  const model = new TerminalCanvas('A');
  try {
    expect(() => captureSelectionSnapshot(model)).toThrow('empty-selection');
    model.selection = { anchor: { x: 0, y: 0 }, focus: { x: 1000, y: 0 } };
    expect(() => captureSelectionSnapshot(model)).toThrow('image-too-large');
    expect(resolveSnapshotLayout(400, 100)).toEqual({ width: 3600, height: 2000, scale: 1 });
    for (const [cols, rows] of [
      [0, 1],
      [-1, 1],
      [NaN, 1],
      [1, Infinity],
      [900, 900],
    ])
      expect(() => resolveSnapshotLayout(cols!, rows!)).toThrow('image-too-large');
  } finally {
    model.dispose();
  }
});

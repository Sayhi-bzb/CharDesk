import { describe, expect, it } from "vitest";
import {
  Box,
  CellBuffer,
  List,
  ListItem,
  Root,
  Text,
  createTestPilot,
  formatCellBuffer,
  formatCellProbe,
} from "./index.js";

describe("Cell probe", () => {
  it("formats Unicode for people while retaining exact Cell records", () => {
    const buffer = new CellBuffer({ width: 7, height: 2 });
    buffer.writeGrapheme(0, 0, "A", "ascii", { bold: true });
    buffer.writeGrapheme(1, 0, "中", "cjk");
    buffer.writeGrapheme(3, 0, "👨‍👩‍👧‍👦", "emoji");
    buffer.writeGrapheme(5, 0, "é", "combining");

    expect(formatCellBuffer(buffer, { trimEnd: true }))
      .toBe("A中👨‍👩‍👧‍👦é\n");
    expect(formatCellBuffer(buffer, {
      region: { x: 1, y: 0, width: 2, height: 1 },
      trimEnd: false,
    })).toBe("中");
    expect(formatCellBuffer(buffer, {
      region: { x: 2, y: 0, width: 1, height: 1 },
      trimEnd: false,
    })).toBe(" ");
    expect(formatCellBuffer(buffer, {
      region: { x: 1, y: 0, width: 1, height: 1 },
      trimEnd: false,
    })).toBe(" ");
  });

  it("trims only empty ASCII padding, not visible Unicode spaces", () => {
    const buffer = new CellBuffer({ width: 7, height: 1 });
    buffer.writeText(0, 0, "X\u00a0\u3000", "unicode-spaces");

    expect(buffer.toText({ trimEnd: true })).toBe("X\u00a0\u3000");
    expect(formatCellBuffer(buffer, { trimEnd: true })).toBe("X\u00a0\u3000");
  });

  it("captures deterministic JSON and diagnoses a rendered Cell", () => {
    const pilot = createTestPilot({
      viewport: { width: 12, height: 3 },
      render: () => (
        <Root id="root">
          <List id="actions" label="Actions">
            <ListItem id="open" focused selected><Text>Open 世界</Text></ListItem>
          </List>
        </Root>
      ),
    });

    const snapshot = pilot.probe({ x: 0, y: 0, width: 12, height: 1 });
    expect(snapshot).toMatchObject({
      schemaVersion: 3,
      probeId: null,
      region: { x: 0, y: 0, width: 12, height: 1 },
      viewport: { width: 12, height: 3 },
      focusedId: "open",
      text: "Open 世界",
    });
    expect(snapshot.cells).toHaveLength(12);
    expect(snapshot.cells.filter((cell) => cell.continuation)).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(formatCellProbe(snapshot, { header: true })).toBe(
      "cell-ui/probe@3  anonymous  12×1  focus=open\nOpen 世界"
    );

    expect(pilot.inspect({ x: 0, y: 0 })).toMatchObject({
      cell: { text: "O", ownerId: "open/text[0]" },
      hit: { ownerId: "open/text[0]", part: "content" },
      hitStack: ["open/text[0]", "open", "actions", "root"],
      focusedId: "open",
      ownerFocused: false,
    });
    expect(pilot.inspect({ x: 20, y: 20 })).toMatchObject({
      cell: null,
      owner: null,
      hit: null,
      hitStack: [],
    });
    pilot.dispose();
  });

  it("clips requested regions to the viewport", () => {
    const pilot = createTestPilot({
      viewport: { width: 4, height: 2 },
      render: () => <Root id="root"><Text id="text">AB</Text></Root>,
    });
    expect(pilot.probe({ x: 2, y: 1, width: 20, height: 20 })).toMatchObject({
      region: { x: 2, y: 1, width: 2, height: 1 },
      text: "",
    });
    pilot.dispose();
  });

  it("formats requested font routes and bounded glyph overflow diagnostics", () => {
    const pilot = createTestPilot({
      viewport: { width: 2, height: 1 },
      render: () => <Root><Text>W界</Text></Root>,
    });
    const snapshot = {
      ...pilot.probe(),
      probeId: "font-contract",
      presentation: {
        metrics: { cellWidth: 9, cellHeight: 19, fontSize: 15 },
        fontProfileId: "gallery/test-font",
        requestedFontRoutes: {
          "cell-glyph": { family: "'JuliaMono'", fontSize: 15, scaleX: 1, baselineShiftEm: 0, weightPolicy: "regular" as const },
          display: { family: "Test Font", fontSize: 15, scaleX: 1, baselineShiftEm: 0, weightPolicy: "inherit" as const },
          cjk: { family: "Test Font", fontSize: 15, scaleX: 1, baselineShiftEm: 0, weightPolicy: "inherit" as const },
          nerd: { family: "Nerd", fontSize: 15, scaleX: 0.6, baselineShiftEm: 0, weightPolicy: "regular" as const },
          symbol: { family: "Symbol", fontSize: 15, scaleX: 1, baselineShiftEm: 0, weightPolicy: "regular" as const },
          emoji: { family: "Emoji", fontSize: 15, scaleX: 1, baselineShiftEm: 0, weightPolicy: "regular" as const },
        },
        glyphOverflow: [{
          text: "W", row: 0, col: 0, spanCells: 1, measuredWidth: 12.5, availableWidth: 9,
        }],
      },
    };

    expect(formatCellProbe(snapshot, { header: true })).toBe(
      "cell-ui/probe@3  font-contract  2×1  focus=none\n" +
      "font-profile=gallery/test-font cell=9×19 base=15px\n" +
      "font display=Test Font size=15px scaleX=1\n" +
      "font cjk=Test Font size=15px scaleX=1\n" +
      "font cell-glyph='JuliaMono' size=15px scaleX=1\n" +
      "glyph-overflow \"W\"@(0,0) 12.5px>9px\n" +
      "W"
    );
    pilot.dispose();
  });

  it("serializes component chrome as Unicode Cell text", () => {
    const pilot = createTestPilot({
      viewport: { width: 4, height: 3 },
      render: () => <Root><Box id="box" style={{ border: true, width: 4, height: 3 }} /></Root>,
    });
    const snapshot = pilot.probe();
    expect(snapshot.text).toBe("┌──┐\n│  │\n└──┘");
    expect(snapshot.cells[0]).toMatchObject({ text: "┌", ownerId: "box" });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    pilot.dispose();
  });
});

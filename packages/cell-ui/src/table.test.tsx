import { expect, it } from "vitest";
import { Box, CellUiRuntime, CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME, Root, Table, TableCell, TableRow, Text, auditSemanticSnapshot, type CellUiTheme, type TableVariant } from "./index.js";

const columns = [
  { label: "Name", width: 12 },
  { label: "Status", width: 10 },
  { label: "Size", width: 7, align: "right" as const },
];

const render = (variant: TableVariant, theme?: CellUiTheme) => {
  const runtime = new CellUiRuntime({ viewport: { width: variant === "surface" ? 36 : 34, height: 6 }, theme });
  const frame = runtime.render(<Root><Table id="files" label="Files" columns={columns} variant={variant}>
    <TableRow id="notes"><TableCell>Notes.txt</TableCell><TableCell>Synced</TableCell><TableCell>12 KB</TableCell></TableRow>
    <TableRow id="draft"><TableCell><Text>Draft.md</Text></TableCell><TableCell>Editing</TableCell><TableCell>3 KB</TableCell></TableRow>
  </Table></Root>);
  runtime.dispose();
  return frame;
};

it("renders plain and outlined tables on the Cell grid", () => {
  expect(render("plain").buffer.toText({ trimEnd: true })).toContain("Name");
  expect(render("outline").buffer.toText({ trimEnd: true })).toContain([
    "┌────────────┬──────────┬───────┐",
    "│ Name       │ Status   │ Size  │",
    "├────────────┼──────────┼───────┤",
    "│ Notes.txt  │ Synced   │ 12 KB │",
    "│ Draft.md   │ Editing  │  3 KB │",
    "└────────────┴──────────┴───────┘",
  ].join("\n"));
});

it("keeps table lines above an inherited ghost background across Rich–Text–Rich", () => {
  const expected = [
    "┌────────────┬──────────┬───────┐",
    "│ Name       │ Status   │ Size  │",
    "├────────────┼──────────┼───────┤",
    "│ Notes.txt  │ Synced   │ 12 KB │",
    "│ Draft.md   │ Editing  │  3 KB │",
    "└────────────┴──────────┴───────┘",
  ].join("\n");
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 34, height: 6 }, theme });
    const view = <Root><Box variant="ghost"><Table id="files" label="Files" columns={columns} variant="outline">
      <TableRow><TableCell>Notes.txt</TableCell><TableCell>Synced</TableCell><TableCell>12 KB</TableCell></TableRow>
      <TableRow><TableCell>Draft.md</TableCell><TableCell>Editing</TableCell><TableCell>3 KB</TableCell></TableRow>
    </Table></Box></Root>;
    for (const presentation of ["rich", "text", "rich"] as const) {
      runtime.setPresentation(presentation);
      const frame = runtime.render(view);
      expect(frame.buffer.toText({ trimEnd: true })).toContain(expected);
      expect(frame.buffer.get(13, 1)?.ownerId).toBe("files");
      expect(frame.buffer.get(13, 2)?.ownerId).toBe("files");
    }
    runtime.dispose();
  }
});

it("preserves plain dividers and surface rows beneath an inherited ghost background", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 36, height: 4 } });
  const view = (variant: TableVariant) => <Root><Box variant="ghost"><Table label="Files" columns={columns} variant={variant}>
    <TableRow><TableCell>Notes.txt</TableCell><TableCell>Synced</TableCell><TableCell>12 KB</TableCell></TableRow>
  </Table></Box></Root>;
  const plain = runtime.render(view("plain"));
  expect(plain.buffer.toText({ trimEnd: true })).toContain("────────────  ──────────  ───────");
  const surface = runtime.render(view("surface"));
  expect(surface.buffer.toText({ trimEnd: true })).not.toMatch(/[┌┬┐├┼┤└┴┘│─]/u);
  runtime.setPresentation("text");
  const text = runtime.render(view("surface"));
  expect(text.buffer.toText({ trimEnd: true })).toContain("├────────────┼──────────┼───────┤");
  runtime.dispose();
});

it("fills the surface header and alternating rows without line glyphs", () => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const frame = render("surface", theme);
    const table = frame.layout.entries.get("files");
    expect(table?.rect.width).toBe(35);
    expect(table?.rect.height).toBe(3);
    expect(frame.buffer.toText({ trimEnd: true })).not.toMatch(/[┌┬┐├┼┤└┴┘│─]/u);
    expect(frame.buffer.get(0, 0)?.style.backgroundColor).toBe(theme.elevatedSurfaceStyle.backgroundColor);
    expect(frame.buffer.get(0, 1)?.style.backgroundColor).toBe(theme.surfaceStyle.backgroundColor);
    expect(frame.buffer.get(0, 2)?.style.backgroundColor).toBe(theme.elevatedSurfaceStyle.backgroundColor);
    expect(frame.buffer.get(14, 1)?.style.backgroundColor).toBe(theme.surfaceStyle.backgroundColor);
    expect(frame.semantics.nodes.get("files")?.role).toBe("table");
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
  }
});

it("exposes a read-only table hierarchy", () => {
  const frame = render("outline");
  expect(frame.semantics.nodes.get("files")?.role).toBe("table");
  expect(frame.semantics.nodes.get("notes")?.role).toBe("row");
  expect([...frame.semantics.nodes.values()].filter((node) => node.role === "columnheader")).toHaveLength(3);
  expect([...frame.semantics.nodes.values()].filter((node) => node.role === "cell")).toHaveLength(6);
  expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
});

it("truncates Cell text without truncating semantic labels", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 16, height: 4 } });
  const frame = runtime.render(<Root><Table label="Items" columns={[{ label: "Title", width: 8 }]}>
    <TableRow><TableCell id="long">世界 meeting</TableCell></TableRow>
  </Table></Root>);
  expect(frame.buffer.toText({ trimEnd: true })).toContain("世界 me…");
  expect(frame.semantics.nodes.get("long")?.label).toBe("世界 meeting");
  expect(frame.semantics.nodes.get("long")?.actions).toEqual([]);
  runtime.dispose();
});

it("rejects rows that do not match the declared columns", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 } });
  expect(() => runtime.render(<Root><Table label="Items" columns={columns}>
    <TableRow><TableCell>Only one</TableCell></TableRow>
  </Table></Root>)).toThrow(/exactly one TableCell per column/u);
  runtime.dispose();
});

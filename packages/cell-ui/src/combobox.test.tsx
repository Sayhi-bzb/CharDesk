import { expect, it } from "vitest";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  Root,
  Text,
  CellTextEditor,
  CellUiRuntime,
  auditSemanticSnapshot,
} from "./index.js";
import { filterCellComboboxItems } from "./browser-combobox.js";
import { formatCellBuffer } from "./probe.js";

const items = [
  { id: "maple", label: "Maple Mono" },
  { id: "jetbrains", label: "JetBrains Mono" },
  { id: "plex", label: "IBM Plex Mono" },
  { id: "fusion", label: "融合像素字体" },
] as const;

it("filters Combobox candidates by stable, case-insensitive substring", () => {
  expect(filterCellComboboxItems(items, "mono").map(({ id }) => id))
    .toEqual(["maple", "jetbrains", "plex"]);
  expect(filterCellComboboxItems(items, "MAPLE").map(({ id }) => id)).toEqual(["maple"]);
  expect(filterCellComboboxItems(items, "像素").map(({ id }) => id)).toEqual(["fusion"]);
  expect(filterCellComboboxItems(items, "  ")).toBe(items);
});

it("projects one focused Combobox with a separate active option", () => {
  const editor = new CellTextEditor({ value: "Maple Mono" });
  const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 } });
  const frame = runtime.render(<Root><Combobox id="font" label="Font" style={{ width: 22 }}>
    <ComboboxInput id="font-input" label="Font" state={editor.snapshot()} expanded
      activeDescendantId="jetbrains" focused />
    <ComboboxContent id="font-content" label="Font options">
      <ComboboxItem id="maple" selected><Text>Maple Mono</Text></ComboboxItem>
      <ComboboxItem id="jetbrains" active><Text>JetBrains Mono</Text></ComboboxItem>
      <ComboboxItem id="plex"><Text>IBM Plex Mono</Text></ComboboxItem>
    </ComboboxContent>
  </Combobox></Root>);

  const input = frame.semantics.nodes.get("font-input")!;
  expect(input.role).toBe("combobox");
  expect(input.controlsId).toBe("font-content");
  expect(input.activeDescendantId).toBe("jetbrains");
  expect(frame.semantics.nodes.get("jetbrains")?.focused).toBe(false);
  expect(frame.layout.entries.get("font-input")).toMatchObject({
    rect: { x: 0, y: 0, width: 22, height: 1 },
    borderInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    paddingInsets: { top: 0, right: 2, bottom: 0, left: 1 },
  });
  expect(frame.scene.entries.get("font-content")?.layoutBounds.y).toBe(1);
  expect(formatCellBuffer(frame.buffer, { trimEnd: true })).toMatch(/Maple Mono\s+✓/);
  expect(formatCellBuffer(frame.buffer, { trimEnd: true })).toContain("JetBrains Mono");
  expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
  runtime.dispose();
});

it("rejects composition that can split focus and candidate ownership", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 6 } });
  const editor = new CellTextEditor();
  expect(() => runtime.render(<Root><ComboboxInput state={editor.snapshot()} /></Root>))
    .toThrow(/direct children of Combobox/);
  expect(() => runtime.render(<Root><Combobox><ComboboxInput state={editor.snapshot()} expanded
    activeDescendantId="a" /><ComboboxContent><ComboboxItem id="a"><Text>A</Text></ComboboxItem>
  </ComboboxContent></Combobox></Root>)).toThrow(/active Item/);
  runtime.dispose();
});

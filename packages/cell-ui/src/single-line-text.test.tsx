import { expect, it } from "vitest";
import {
  Badge, Box, Button, CellTextEditor, CellUiRuntime, Checkbox, Combobox,
  ComboboxContent, ComboboxInput, ComboboxItem, RadioGroup, RadioItem, Root,
  Select, SelectContent, SelectItem, SelectTrigger, Tab, Tabs, Text, Toggle, extractCellRange,
} from "./index.js";
import { fitSingleLineText } from "./single-line-text.js";

it.each(["rich", "text"] as const)("keeps a %s Select Trigger on one row and protects its chrome", (presentation) => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 3 }, presentation });
  const view = (width: number) => <Root><Select style={{ width }}>
    <SelectTrigger id="trigger" label="icon + text"><Text>icon + text</Text></SelectTrigger>
  </Select></Root>;
  const narrow = runtime.render(view(presentation === "text" ? 15 : 13));
  const trigger = narrow.scene.entries.get("trigger")!;
  const label = narrow.scene.entries.get("trigger/text[0]")!;
  expect(trigger.layoutBounds.height).toBe(1);
  expect(label.layoutBounds.height).toBe(1);
  expect(narrow.buffer.get(label.contentBounds.x + label.contentBounds.width - 1, 0)?.text).toBe("…");
  expect(narrow.buffer.toText({ region: trigger.layoutBounds })).toContain("▾");
  expect(narrow.buffer.toText({ trimEnd: true }).split("\n").slice(1).every((line) => line.trim() === "")).toBe(true);
  expect(narrow.semantics.nodes.get("trigger")?.label).toBe("icon + text");
  expect(extractCellRange(narrow.buffer, trigger.layoutBounds)).toContain("…");

  const full = runtime.render(view(presentation === "text" ? 17 : 15));
  expect(full.buffer.toText({ region: full.scene.entries.get("trigger")!.layoutBounds })).toContain("icon + text");
  expect(full.buffer.toText({ trimEnd: true }).split("\n").slice(1).every((line) => line.trim() === "")).toBe(true);
  runtime.dispose();
});

it.each(["button", "badge", "checkbox", "toggle", "radio", "tab"] as const)(
  "keeps %s label text to one row without changing control semantics", (kind) => {
    const label = "Long label for control";
    const child = <Text id="label">{label}</Text>;
    const control = kind === "button" ? <Button id="control" style={{ width: 12 }}>{child}</Button>
      : kind === "badge" ? <Badge id="control" style={{ width: 12 }}>{child}</Badge>
      : kind === "checkbox" ? <Checkbox id="control" style={{ width: 12 }}>{child}</Checkbox>
      : kind === "toggle" ? <Toggle id="control" style={{ width: 12 }}>{child}</Toggle>
      : kind === "radio" ? <RadioGroup><RadioItem id="control" value="choice" style={{ width: 12 }}>{child}</RadioItem></RadioGroup>
      : <Tabs value="choice"><Tab id="control" value="choice" style={{ width: 12 }}>{child}</Tab></Tabs>;
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 }, presentation: "text" });
    const frame = runtime.render(<Root>{control}</Root>);
    const text = frame.scene.entries.get("label")!;
    expect(text.layoutBounds.height).toBe(1);
    expect(frame.buffer.toText({ region: text.contentBounds })).toContain("…");
    expect(frame.semantics.nodes.get("control")?.label).toBe(label);
    runtime.dispose();
  },
);

it.each(["select", "combobox"] as const)("keeps long %s options to one row", (kind) => {
  const label = "A long option label";
  const runtime = new CellUiRuntime({ viewport: { width: 18, height: 5 }, presentation: "text" });
  const frame = runtime.render(kind === "select"
    ? <Root><Select style={{ width: 12 }}>
      <SelectTrigger id="trigger" expanded label="Choice"><Text>Choice</Text></SelectTrigger>
      <SelectContent id="content"><SelectItem id="item" label={label}><Text id="label">{label}</Text></SelectItem></SelectContent>
    </Select></Root>
    : <Root><Combobox style={{ width: 12 }}>
      <ComboboxInput id="input" expanded label="Choice" state={new CellTextEditor().snapshot()} />
      <ComboboxContent id="content"><ComboboxItem id="item" label={label}><Text id="label">{label}</Text></ComboboxItem></ComboboxContent>
    </Combobox></Root>);
  const text = frame.scene.entries.get("label")!;
  expect(text.layoutBounds.height).toBe(1);
  expect(frame.buffer.toText({ region: text.contentBounds })).toContain("…");
  expect(frame.semantics.nodes.get("item")?.label).toBe(label);
  runtime.dispose();
});

it("measures and truncates Unicode graphemes without changing ordinary multiline Text", () => {
  expect(fitSingleLineText("中👩‍💻文", 4)).toBe("中…");
  expect(fitSingleLineText("abc", 1)).toBe("…");
  expect(fitSingleLineText("abc", 0)).toBe("");
  const runtime = new CellUiRuntime({ viewport: { width: 16, height: 4 } });
  const frame = runtime.render(<Root>
    <Box style={{ width: 4 }}><Text id="paragraph">abcdef</Text></Box>
    <Button id="single" style={{ width: 7 }}><Box><Text id="nested">中👩‍💻文档</Text></Box></Button>
  </Root>);
  expect(frame.scene.entries.get("paragraph")?.layoutBounds.height).toBe(2);
  expect(frame.scene.entries.get("nested")?.layoutBounds.height).toBe(1);
  expect(frame.buffer.toText({ trimEnd: true })).toContain("abcd\nef");
  runtime.dispose();
});

import { expect, it } from "vitest";
import { CellUiRuntime, Markdown, Root, createCellRangeSnapshot } from "./index.js";
import { highlightMarkdownCode } from "./markdown-code.js";
import { CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME } from "./theme.js";

it("classifies TSX, JSON, and shell code without changing source characters", () => {
  for (const [language, code, role] of [
    ["tsx", 'const view = <Button variant="outline" />;', "codeKey"],
    ["json", '{"key":"value"}', "codeKey"],
    ["sh", "npx shadcn@latest add @chardesk/cell-ui", "codeCommand"],
  ] as const) {
    const lines = highlightMarkdownCode(code, language)!;
    expect(lines.map((line) => line.map(({ content }) => content).join("")).join("\n")).toBe(code);
    expect(lines.flat().some((token) => token.role === role)).toBe(true);
  }
  expect(highlightMarkdownCode("const x = 1;", "text")).toBeUndefined();
  expect(highlightMarkdownCode("const x = 1;", "unknown")).toBeUndefined();
  expect(highlightMarkdownCode("const ready = true;", "ts")?.[0]?.[0]?.role).toBe("codeKey");
  expect(highlightMarkdownCode("# note\nnpx shadcn", "shell")?.[0]?.some((token) =>
    token.role === "codeComment")).toBe(true);
});

it("uses theme-resolved syntax colors while preserving code semantics and Cell Range copy", () => {
  const source = '```json\n{"key":"value"}\n```';
  const runtime = new CellUiRuntime({ viewport: { width: 28, height: 5 } });
  const inspect = () => {
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const lines = frame.buffer.toText({ trimEnd: true }).split("\n");
    const y = lines.findIndex((line) => line.includes('{"key":"value"}'));
    const x = lines[y]!.indexOf('{"key":"value"}');
    return { frame, x, y };
  };
  const light = inspect();
  expect(light.frame.buffer.get(light.x + 2, light.y)?.style.color)
    .toBe(CLASSIC_MAC_LIGHT_THEME.markdownColors.codeKey);
  expect(light.frame.buffer.get(light.x + 8, light.y)?.style.color)
    .toBe(CLASSIC_MAC_LIGHT_THEME.markdownColors.codeValue);
  expect([...light.frame.semantics.nodes.values()].some((node) => node.role === "code")).toBe(true);
  expect(createCellRangeSnapshot(light.frame.buffer, { x: light.x, y: light.y },
    { x: light.x + 14, y: light.y })?.text).toBe('{"key":"value"}');

  runtime.setTheme({ background: "#000000" });
  const dark = inspect();
  expect(dark.frame.buffer.get(dark.x + 2, dark.y)?.style.color)
    .toBe(CLASSIC_MAC_DARK_THEME.markdownColors.codeKey);
  runtime.setTheme({ markdownColors: { codeKey: "#123456" } });
  const custom = inspect();
  expect(custom.frame.buffer.get(custom.x + 2, custom.y)?.style.color).toBe("#123456");
  runtime.dispose();
});

it("lets a valid custom line highlighter override the built-in role", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 28, height: 5 } });
  const frame = runtime.render(<Root><Markdown source={'```json\n{"key":1}\n```'}
    highlightCodeLine={(line) => [{ content: line, color: "#aabbcc" }]} /></Root>);
  const lines = frame.buffer.toText({ trimEnd: true }).split("\n");
  const y = lines.findIndex((line) => line.includes('{"key":1}'));
  const x = lines[y]!.indexOf('{"key":1}');
  expect(frame.buffer.get(x + 2, y)?.style.color).toBe("#aabbcc");
  runtime.dispose();
});

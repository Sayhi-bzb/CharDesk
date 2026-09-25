import { expect, it } from "vitest";
import { CellUiRuntime, Markdown, Root, createCellRangeSnapshot } from "./index.js";

it("colors code tokens without changing Cell text, code semantics, or range copy", () => {
  const source = "```json\n{\"key\":\"value\"}\n```";
  const runtime = new CellUiRuntime({ viewport: { width: 28, height: 6 } });
  const frame = runtime.render(<Root><Markdown source={source} highlightCodeLine={(line) => line.startsWith("{")
    ? [
        { content: "{\"" }, { content: "key", color: "#0550ae" }, { content: "\":\"" },
        { content: "value", color: "#116329" }, { content: "\"}" },
      ] : undefined} /></Root>);
  const lines = frame.buffer.toText({ trimEnd: true }).split("\n");
  const y = lines.findIndex((line) => line.includes('{"key":"value"}'));
  const x = lines[y]!.indexOf('{"key":"value"}');
  expect(y).toBeGreaterThanOrEqual(0);
  expect(frame.buffer.get(x + 2, y)?.style.color).toBe("#0550ae");
  expect(frame.buffer.get(x + 8, y)?.style.color).toBe("#116329");
  expect([...frame.semantics.nodes.values()].some((node) => node.role === "code")).toBe(true);
  expect(createCellRangeSnapshot(frame.buffer, { x, y }, { x: x + 14, y })?.text)
    .toBe('{"key":"value"}');

  const fallback = runtime.render(<Root><Markdown source={source}
    highlightCodeLine={() => [{ content: "wrong", color: "#ff0000" }]} /></Root>);
  expect(fallback.buffer.toText({ trimEnd: true })).toContain('{"key":"value"}');
  expect(fallback.buffer.get(x + 2, y)?.style.color).not.toBe("#ff0000");
  runtime.dispose();
});

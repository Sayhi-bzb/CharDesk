import { describe, expect, it } from "vitest";
import { getCharGraphText } from "./fragments.js";
import { adaptMermaidXYChart, renderCartesianChart } from "./cartesian-chart.js";
import { parseXYChart } from "./vendor/xychart/parser.js";
import { renderMarkdown } from "./markdown-default.js";
import { parseVegaLiteChart } from "./vega-lite-chart.js";

const pointColumns = (text: string) => {
  const line = text.split("\n").find((value) => value.includes("●"));
  return line ? Array.from(line).flatMap((value, index) => value === "●" ? [index] : []) : [];
};

const tickRows = (text: string, labels: readonly string[]) => {
  const lines = text.split("\n");
  return labels.map((label) => lines.findIndex((line) =>
    new RegExp(`^\\s*${label}\\s+[│┤]`).test(line)
  ));
};

const expectUniformGaps = (text: string, rows: readonly number[]) => {
  expect(rows, text).not.toContain(-1);
  const gaps = rows.slice(1).map((row, index) => row - rows[index]!);
  expect(new Set(gaps).size).toBe(1);
};

describe("Cartesian charts", () => {
  it("uses equal cell gaps for equal values in an explicit Y domain", () => {
    const text = getCharGraphText(renderCartesianChart({
      x: { scale: "linear" },
      y: { scale: "linear", domain: [0, 2000] },
      series: [{
        mark: "line",
        points: [{ x: 0, y: 280 }, { x: 1, y: 1860 }, { x: 2, y: 310 }],
      }],
    }));
    const rows = tickRows(text, ["2000", "1500", "1000", "500", "0"]);

    expectUniformGaps(text, rows);
    expect(rows.slice(1).map((row, index) => row - rows[index]!))
      .toEqual([4, 4, 4, 4]);
  });

  it("keeps nice and offset Y domains uniformly quantized", () => {
    const auto = getCharGraphText(renderCartesianChart({
      x: { scale: "linear" },
      y: { scale: "linear" },
      series: [{
        mark: "point",
        points: [{ x: 0, y: 280 }, { x: 1, y: 1860 }],
      }],
    }));
    const offset = getCharGraphText(renderCartesianChart({
      x: { scale: "linear" },
      y: { scale: "linear", domain: [-0.1, 2.1] },
      series: [{
        mark: "errorbar",
        points: [{ x: 0, y: 1, yLow: 0, yHigh: 2 }],
      }],
    }));

    expectUniformGaps(auto, tickRows(auto, ["2000", "1500", "1000", "500", "0"]));
    expectUniformGaps(offset, tickRows(offset, ["2", "1.5", "1", "0.5", "0"]));
  });

  it("applies the same Y spacing contract to Mermaid XY charts", () => {
    const spec = adaptMermaidXYChart(parseXYChart([
      "xychart-beta",
      "x-axis [start, peak, recovery]",
      "y-axis 0 --> 2000",
      "line [280, 1860, 310]",
    ]));
    const text = getCharGraphText(renderCartesianChart(spec));

    expectUniformGaps(text, tickRows(text, ["2000", "1500", "1000", "500", "0"]));
  });

  it("projects irregular numeric x values instead of category indexes", () => {
    const text = getCharGraphText(renderCartesianChart({
      x: { scale: "linear" },
      y: { scale: "linear", domain: [0, 2] },
      series: [{
        mark: "point",
        points: [0, 0.5, 1, 2, 4, 8].map((x) => ({ x, y: 1 })),
      }],
    }));
    const columns = pointColumns(text);
    const gaps = columns.slice(1).map((column, index) => column - columns[index]!);

    expect(columns).toHaveLength(6);
    expect(new Set(gaps).size).toBeGreaterThan(1);
    expect(gaps.at(-1)).toBeGreaterThan(gaps[0]!);
  });

  it("adapts a Vega-Lite unit spec into named series", () => {
    const spec = parseVegaLiteChart(JSON.stringify({
      data: { values: [
        { x: 0, y: 1, group: "control" },
        { x: 2, y: 3, group: "treated" },
      ] },
      mark: "line",
      encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
        color: { field: "group", type: "nominal" },
      },
    }));

    expect(spec.x.scale).toBe("linear");
    expect(spec.series.map((series) => series.name)).toEqual(["control", "treated"]);
  });

  it("adapts Mermaid numeric ranges into explicit point coordinates", () => {
    const spec = adaptMermaidXYChart(parseXYChart([
      "xychart-beta",
      "x-axis 0 --> 8",
      "line [0, 2, 4]",
    ]));

    expect(spec.x).toEqual({ scale: "linear", domain: [0, 8] });
    expect(spec.series[0]?.points.map((point) => point.x)).toEqual([0, 4, 8]);
  });

  it("renders vega-lite fences and preserves unsupported specs", async () => {
    const valid = await renderMarkdown(`\`\`\`vega-lite\n${JSON.stringify({
      data: { values: [{ x: 0, y: 1 }, { x: 2, y: 2 }] },
      mark: "point",
      encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
      },
    })}\n\`\`\``);
    const unsupported = await renderMarkdown(`\`\`\`vega-lite\n${JSON.stringify({
      data: { values: [{ x: 0, y: 1 }] },
      transform: [{ filter: "datum.x > 0" }],
      mark: "point",
      encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
      },
    })}\n\`\`\``);

    expect(valid.diagnostics).toEqual([]);
    expect(getCharGraphText(valid)).toContain("●");
    expect(unsupported.diagnostics[0]?.code).toBe("markdown-chart-render-failed");
    expect(getCharGraphText(unsupported)).toContain("```vega-lite");
  });

  it("renders horizontal Vega-Lite bar charts with a quantitative x field", async () => {
    const rendered = await renderMarkdown(`\`\`\`vega-lite
${JSON.stringify({
      title: "SpaceX IPO 规模对比（$B）",
      data: { values: [
        { name: "IPO 募资", value: 85.7 },
        { name: "隐含估值", value: 1770 },
        { name: "2025 年收入", value: 18.67 },
        { name: "2025 年净亏损", value: 4.94 },
      ] },
      mark: { type: "bar", cornerRadiusEnd: 4 },
      encoding: {
        y: { field: "name", type: "nominal", sort: "-x" },
        x: { field: "value", type: "quantitative", title: "$B", scale: { zero: true } },
      },
    })}
\`\`\``);

    const text = getCharGraphText(rendered);
    const compact = text.replace(/\s+/g, "");
    expect(rendered.diagnostics).toEqual([]);
    expect(compact).toContain("IPO募资");
    expect(compact).toContain("隐含估值");
    expect(compact.indexOf("隐含估值")).toBeLessThan(compact.indexOf("IPO募资"));
    expect(text).toContain("█");
  });
});

import { getGraphemeCellWidth, splitGraphemes } from "@chardesk/protocol";
import { scaleBand, scaleLinear } from "d3-scale";
import type { CharGraphRenderResult } from "./model.js";
import type { MermaidStyleMap, MermaidStyleRole } from "./mermaid-style.js";
import type { AsciiRenderSurface, Canvas } from "./vendor/ascii/types.js";
import { surfaceToStyleRuns } from "./vendor/ascii/surface.js";
import type { XYChart } from "./vendor/xychart/types.js";

export type ChartValue = number | string;
export type CartesianChartAxis = {
  scale: "linear" | "band";
  title?: string;
  domain?: [number, number];
  zero?: boolean;
};
export type CartesianChartPoint = {
  x: ChartValue;
  y: number;
  yLow?: number;
  yHigh?: number;
  label?: string;
};
export type CartesianChartSeries = {
  name?: string;
  mark: "line" | "point" | "bar" | "errorbar";
  points: CartesianChartPoint[];
};
export type CartesianChartSpec = {
  title?: string;
  orientation?: "horizontal";
  categorySort?: "ascending" | "descending";
  legend?: boolean;
  x: CartesianChartAxis;
  y: CartesianChartAxis;
  series: CartesianChartSeries[];
};

export const adaptMermaidXYChart = (chart: XYChart): CartesianChartSpec => {
  const count = Math.max(0, ...chart.series.map((series) => series.data.length));
  const categories = chart.xAxis.categories;
  const range = chart.xAxis.range ?? { min: 0, max: Math.max(0, count - 1) };
  const xAt = (index: number): ChartValue => categories?.[index]
    ?? (count <= 1
      ? range.min
      : range.min + (range.max - range.min) * index / (count - 1));
  return {
    ...(chart.title ? { title: chart.title } : {}),
    x: {
      scale: categories ? "band" : "linear",
      ...(chart.xAxis.title ? { title: chart.xAxis.title } : {}),
      ...(!categories && chart.xAxis.range
        ? { domain: [range.min, range.max] as [number, number] }
        : {}),
    },
    y: {
      scale: "linear",
      ...(chart.yAxis.title ? { title: chart.yAxis.title } : {}),
      ...(chart.yAxis.range
        ? { domain: [chart.yAxis.range.min, chart.yAxis.range.max] as [number, number] }
        : {}),
    },
    series: chart.series.map((series) => ({
      mark: series.type,
      points: series.data.map((y, index) => ({ x: xAt(index), y })),
    })),
  };
};

type RoleCanvas = (MermaidStyleRole | null)[][];
const WIDTH = 60;
const TARGET_PLOT_SPAN = 15;
const SERIES_ROLES = [
  "series.1", "series.2", "series.3", "series.4", "series.5",
] as const;

const matrix = <T>(width: number, height: number, value: T) =>
  Array.from({ length: width }, () => Array.from({ length: height }, () => value));

const formatTick = (value: number) => Number.isInteger(value)
  ? String(value)
  : Number(value.toPrecision(4)).toString();

const displayWidth = (text: string) => splitGraphemes(text)
  .reduce((width, grapheme) => width + getGraphemeCellWidth(grapheme), 0);

const valueDomain = (spec: CartesianChartSpec): [number, number] => {
  if (spec.y.domain) return spec.y.domain;
  const values = spec.series.flatMap((series) => series.points.flatMap((point) => [
    point.y,
    ...(point.yLow === undefined ? [] : [point.yLow]),
    ...(point.yHigh === undefined ? [] : [point.yHigh]),
  ])).filter(Number.isFinite);
  if (spec.series.some((series) => series.mark === "bar")) values.push(0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (spec.y.zero) {
    if (min >= 0) return [0, max === 0 ? 1 : max];
    if (max <= 0) return [min === 0 ? -1 : min, 0];
  }
  if (min === max) return [min - 0.5, max + 0.5];
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
};

const numericXDomain = (spec: CartesianChartSpec): [number, number] => {
  if (spec.x.domain) return spec.x.domain;
  const values = spec.series.flatMap((series) => series.points.map((point) =>
    typeof point.x === "number" ? point.x : Number.NaN
  )).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  return min === max ? [min - 0.5, max + 0.5] : [min, max];
};

const write = (
  canvas: Canvas,
  roles: RoleCanvas,
  x: number,
  y: number,
  text: string,
  role: MermaidStyleRole
) => {
  let column = Math.round(x);
  for (const grapheme of splitGraphemes(text)) {
    if (canvas[column]?.[y] !== undefined) {
      canvas[column]![y] = grapheme;
      roles[column]![y] = role;
    }
    column += getGraphemeCellWidth(grapheme);
  }
};

const put = (
  canvas: Canvas,
  roles: RoleCanvas,
  x: number,
  y: number,
  text: string,
  role: MermaidStyleRole
) => {
  const column = Math.round(x);
  const row = Math.round(y);
  if (canvas[column]?.[row] === undefined) return;
  canvas[column]![row] = text;
  roles[column]![row] = role;
};

const drawLine = (
  canvas: Canvas,
  roles: RoleCanvas,
  from: { x: number; y: number },
  to: { x: number; y: number },
  role: MermaidStyleRole
) => {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const steps = Math.max(dx, dy, 1);
  for (let index = 0; index <= steps; index += 1) {
    const x = Math.round(from.x + (to.x - from.x) * index / steps);
    const y = Math.round(from.y + (to.y - from.y) * index / steps);
    const glyph = dy === 0 ? "─" : dx === 0 ? "│"
      : (to.x - from.x) * (to.y - from.y) > 0 ? "╲" : "╱";
    put(canvas, roles, x, y, glyph, role);
  }
};

const renderVerticalCartesianChartSurface = (
  spec: CartesianChartSpec
): AsciiRenderSurface => {
  const yScale = scaleLinear().domain(valueDomain(spec));
  if (!spec.y.domain) yScale.nice(5);
  const yTicks = yScale.ticks(5);
  const yDomain = yScale.domain();
  const domainSpan = Math.abs(yDomain[1]! - yDomain[0]!);
  const tickStep = yTicks.length > 1
    ? Math.abs(yTicks[1]! - yTicks[0]!)
    : domainSpan;
  const domainTickIntervals = tickStep > 0 ? domainSpan / tickStep : 1;
  const tickGap = Math.max(1, Math.round(TARGET_PLOT_SPAN / domainTickIntervals));
  const plotSpan = tickGap * domainTickIntervals;
  const plotHeight = Math.ceil(plotSpan) + 1;
  yScale.range([plotSpan, 0]);
  const yLabels = yTicks.map(formatTick);
  const left = Math.max(4, ...yLabels.map((label) => label.length)) + 2;
  const titleRows = spec.title ? 2 : 0;
  const named = spec.legend === false ? [] : spec.series.filter((series) => series.name);
  const legendRows = named.length > 0 ? 1 : 0;
  const top = titleRows + legendRows;
  const plotRight = left + WIDTH - 1;
  const axisRow = top + plotHeight;
  const bottomRows = 2 + (spec.x.title ? 1 : 0);
  const totalWidth = plotRight + 2;
  const totalHeight = axisRow + bottomRows;
  const canvas = matrix(totalWidth, totalHeight, " ");
  const roles = matrix<MermaidStyleRole | null>(totalWidth, totalHeight, null);

  const allX = spec.series.flatMap((series) => series.points.map((point) => point.x));
  const categories = [...new Set(allX.map(String))];
  const linearX = spec.x.scale === "linear"
    ? scaleLinear(numericXDomain(spec), [left, plotRight])
    : undefined;
  if (linearX && !spec.x.domain) linearX.nice(5);
  const bandX = spec.x.scale === "band"
    ? scaleBand(categories, [left, plotRight + 1]).padding(0.2)
    : undefined;
  const projectX = (value: ChartValue) => linearX
    ? linearX(Number(value))
    : (bandX?.(String(value)) ?? left) + (bandX?.bandwidth() ?? 0) / 2;

  if (spec.title) {
    write(canvas, roles, Math.max(0, Math.floor(
      (totalWidth - spec.title.length) / 2
    )), 0, spec.title, "title");
  }
  if (named.length > 0) {
    let x = left;
    named.forEach((series) => {
      const index = spec.series.indexOf(series);
      const role = SERIES_ROLES[index % SERIES_ROLES.length]!;
      write(canvas, roles, x, titleRows, `● ${series.name}`, role);
      x += (series.name?.length ?? 0) + 4;
    });
  }
  if (spec.y.title) write(canvas, roles, 0, top, spec.y.title, "chart.label");

  for (const tick of yTicks) {
    const y = top + Math.round(yScale(tick));
    const label = formatTick(tick);
    write(canvas, roles, left - label.length - 2, y, label, "chart.label");
    put(canvas, roles, left - 1, y, "┤", "chart.axis");
    for (let x = left; x <= plotRight; x += 1) {
      put(canvas, roles, x, y, "·", "chart.grid");
    }
  }
  for (let y = top; y < axisRow; y += 1) put(canvas, roles, left - 1, y, "│", "chart.axis");
  for (let x = left; x <= plotRight; x += 1) put(canvas, roles, x, axisRow, "─", "chart.axis");
  put(canvas, roles, left - 1, axisRow, "└", "chart.axis");

  const xTicks: ChartValue[] = linearX ? linearX.ticks(6) : categories;
  for (const tick of xTicks) {
    const x = Math.round(projectX(tick));
    const label = typeof tick === "number" ? formatTick(tick) : tick;
    put(canvas, roles, x, axisRow, "┴", "chart.axis");
    write(canvas, roles, x - Math.floor(label.length / 2), axisRow + 1, label, "chart.label");
  }
  if (spec.x.title) {
    write(canvas, roles, Math.max(left, Math.floor(
      left + (WIDTH - spec.x.title.length) / 2
    )), axisRow + 2, spec.x.title, "chart.label");
  }

  spec.series.forEach((series, seriesIndex) => {
    const role = SERIES_ROLES[seriesIndex % SERIES_ROLES.length]!;
    const points = series.points.filter((point) =>
      Number.isFinite(point.y) && (spec.x.scale === "band" || typeof point.x === "number")
    ).map((point) => ({
      point,
      x: projectX(point.x),
      y: top + yScale(point.y),
    })).sort((a, b) => a.x - b.x);
    if (series.mark === "line") {
      points.slice(1).forEach((point, index) =>
        drawLine(canvas, roles, points[index]!, point, role)
      );
      points.forEach((point) => put(canvas, roles, point.x, point.y, "●", role));
    } else if (series.mark === "point") {
      points.forEach((point) => put(canvas, roles, point.x, point.y, "●", role));
    } else if (series.mark === "bar") {
      const baseline = top + yScale(0);
      const width = Math.max(1, Math.floor((bandX?.bandwidth() ?? 3) / Math.max(1, spec.series.length)));
      points.forEach((point) => {
        const from = Math.round(Math.min(point.y, baseline));
        const to = Math.round(Math.max(point.y, baseline));
        for (let y = from; y <= to; y += 1) {
          for (let offset = 0; offset < width; offset += 1) {
            put(canvas, roles, point.x - Math.floor(width / 2) + offset, y, "█", role);
          }
        }
      });
    } else {
      points.forEach(({ point, x }) => {
        if (point.yLow === undefined || point.yHigh === undefined) return;
        const low = top + yScale(point.yLow);
        const high = top + yScale(point.yHigh);
        drawLine(canvas, roles, { x, y: low }, { x, y: high }, role);
        put(canvas, roles, x, low, "┴", role);
        put(canvas, roles, x, high, "┬", role);
      });
    }
  });

  return { canvas, styleRoleCanvas: roles, trimTrailingSpaces: true, trimTrailingLines: true };
};

const renderHorizontalBarChartSurface = (
  spec: CartesianChartSpec
): AsciiRenderSurface => {
  const xScale = scaleLinear().domain(valueDomain(spec));
  if (!spec.y.domain) xScale.nice(5);
  const xTicks = xScale.ticks(6);
  const xDomain = xScale.domain();
  const domainSpan = Math.abs(xDomain[1]! - xDomain[0]!);
  const tickStep = xTicks.length > 1
    ? Math.abs(xTicks[1]! - xTicks[0]!)
    : domainSpan;
  const domainTickIntervals = tickStep > 0 ? domainSpan / tickStep : 1;
  const tickGap = Math.max(1, Math.round(WIDTH / domainTickIntervals));
  const plotWidth = Math.ceil(tickGap * domainTickIntervals) + 1;
  const categoryScores = new Map<string, number>();
  spec.series.flatMap((series) => series.points).forEach((point) => {
    const category = String(point.x);
    categoryScores.set(category, Math.max(categoryScores.get(category) ?? -Infinity, point.y));
  });
  const categories = [...categoryScores.keys()];
  if (spec.categorySort) {
    categories.sort((a, b) => {
      const difference = (categoryScores.get(a) ?? 0) - (categoryScores.get(b) ?? 0);
      return spec.categorySort === "descending" ? -difference : difference;
    });
  }
  const titleRows = spec.title ? 2 : 0;
  const named = spec.legend === false ? [] : spec.series.filter((series) => series.name);
  const legendRows = named.length > 0 ? 1 : 0;
  const top = titleRows + legendRows;
  const plotHeight = Math.max(1, categories.length * 2 - 1);
  const axisRow = top + plotHeight;
  const labels = categories.map((category) => category);
  const left = Math.max(4, ...labels.map(displayWidth)) + 2;
  const plotRight = left + plotWidth - 1;
  const totalWidth = plotRight + 2;
  const totalHeight = axisRow + 2 + (spec.y.title ? 1 : 0);
  const canvas = matrix(totalWidth, totalHeight, " ");
  const roles = matrix<MermaidStyleRole | null>(totalWidth, totalHeight, null);
  const bandY = scaleBand(categories, [top, top + plotHeight]).padding(0.2);
  xScale.range([0, plotWidth - 1]);
  const projectX = (value: number) => left + xScale(value);

  if (spec.title) {
    write(canvas, roles, Math.max(0, Math.floor((totalWidth - spec.title.length) / 2)), 0, spec.title, "title");
  }
  if (named.length > 0) {
    let x = left;
    named.forEach((series) => {
      const index = spec.series.indexOf(series);
      const role = SERIES_ROLES[index % SERIES_ROLES.length]!;
      write(canvas, roles, x, titleRows, `● ${series.name}`, role);
      x += (series.name?.length ?? 0) + 4;
    });
  }
  for (const tick of xTicks) {
    const x = Math.round(projectX(tick));
    for (let y = top; y < axisRow; y += 1) put(canvas, roles, x, y, "·", "chart.grid");
    put(canvas, roles, x, axisRow, "┴", "chart.axis");
    const label = formatTick(tick);
    write(canvas, roles, x - Math.floor(label.length / 2), axisRow + 1, label, "chart.label");
  }
  for (const category of categories) {
    const row = Math.round((bandY(category) ?? top) + bandY.bandwidth() / 2);
    write(canvas, roles, left - displayWidth(category) - 2, row, category, "chart.label");
    put(canvas, roles, left - 1, row, "│", "chart.axis");
  }
  for (let x = left; x <= plotRight; x += 1) put(canvas, roles, x, axisRow, "─", "chart.axis");
  put(canvas, roles, left - 1, axisRow, "└", "chart.axis");
  if (spec.y.title) write(canvas, roles, Math.max(left, Math.floor(left + (plotWidth - spec.y.title.length) / 2)), axisRow + 2, spec.y.title, "chart.label");

  spec.series.forEach((series, seriesIndex) => {
    const role = SERIES_ROLES[seriesIndex % SERIES_ROLES.length]!;
    if (series.mark !== "bar") return;
    const width = Math.max(1, Math.floor((bandY.bandwidth() || 1) / Math.max(1, spec.series.length)));
    series.points.forEach((point) => {
      if (!Number.isFinite(point.y)) return;
      const row = Math.round((bandY(String(point.x)) ?? top) + bandY.bandwidth() / 2);
      const from = Math.round(Math.min(projectX(0), projectX(point.y)));
      const to = Math.round(Math.max(projectX(0), projectX(point.y)));
      for (let x = from; x <= to; x += 1) {
        for (let offset = 0; offset < width; offset += 1) put(canvas, roles, x, row - Math.floor(width / 2) + offset, "█", role);
      }
    });
  });

  return { canvas, styleRoleCanvas: roles, trimTrailingSpaces: true, trimTrailingLines: true };
};

export const renderCartesianChartSurface = (
  spec: CartesianChartSpec
): AsciiRenderSurface => spec.orientation === "horizontal"
  ? renderHorizontalBarChartSurface(spec)
  : renderVerticalCartesianChartSurface(spec);

export const renderCartesianChart = (
  spec: CartesianChartSpec,
  options: { source?: string; styles?: MermaidStyleMap } = {}
): CharGraphRenderResult => {
  const source = options.source ?? "";
  const runs = surfaceToStyleRuns(renderCartesianChartSurface(spec));
  return {
    fragments: runs.map(({ text, role }) => ({
      text,
      ...(role ? options.styles?.[role] : undefined),
      origin: { from: 0, to: source.length },
    })),
    recognized: true,
    diagnostics: [],
  };
};

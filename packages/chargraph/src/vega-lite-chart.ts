import type {
  CartesianChartAxis,
  CartesianChartPoint,
  CartesianChartSeries,
  CartesianChartSpec,
} from "./cartesian-chart.js";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class VegaLiteChartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VegaLiteChartError";
  }
}

const field = (encoding: JsonObject, channel: string) => {
  const value = encoding[channel];
  return object(value) && typeof value.field === "string" ? value.field : undefined;
};

const axis = (value: unknown): CartesianChartAxis => {
  if (!object(value)) throw new VegaLiteChartError("x and y encodings are required.");
  const scale = object(value.scale) ? value.scale : undefined;
  const domain = Array.isArray(scale?.domain)
    && scale.domain.length === 2
    && scale.domain.every((item) => typeof item === "number")
    ? scale.domain as [number, number]
    : undefined;
  return {
    scale: value.type === "ordinal" || value.type === "nominal" ? "band" : "linear",
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(object(value.scale) && typeof value.scale.zero === "boolean" ? { zero: value.scale.zero } : {}),
    ...(domain ? { domain } : {}),
  };
};

const markName = (value: unknown): CartesianChartSeries["mark"] => {
  const mark = typeof value === "string" ? value : object(value) ? value.type : undefined;
  if (mark === "line" || mark === "point" || mark === "bar" || mark === "errorbar") {
    return mark;
  }
  throw new VegaLiteChartError(`Unsupported Vega-Lite mark: ${String(mark)}.`);
};

type SeriesOptions = {
  transpose?: boolean;
  sortDescending?: boolean;
};

const seriesForUnit = (
  unit: JsonObject,
  inheritedData?: unknown,
  inheritedEncoding?: unknown,
  options: SeriesOptions = {}
): CartesianChartSeries[] => {
  const data = object(unit.data) ? unit.data : object(inheritedData) ? inheritedData : undefined;
  if (!data || !Array.isArray(data.values) || !data.values.every(object)) {
    throw new VegaLiteChartError("Only inline data.values is supported.");
  }
  const encoding = object(unit.encoding)
    ? { ...(object(inheritedEncoding) ? inheritedEncoding : {}), ...unit.encoding }
    : object(inheritedEncoding) ? inheritedEncoding : undefined;
  if (!encoding) throw new VegaLiteChartError("An encoding object is required.");
  const xField = field(encoding, "x");
  const yField = field(encoding, "y");
  if (!xField || !yField) throw new VegaLiteChartError("x and y fields are required.");
  const colorField = field(encoding, "color");
  const lowField = field(encoding, "yError");
  const highField = field(encoding, "yError2");
  const mark = markName(unit.mark);
  const groups = new Map<string, CartesianChartPoint[]>();
  for (const datum of data.values) {
    const rawX = datum[xField];
    const rawY = datum[yField];
    const x = options.transpose ? rawY : rawX;
    const y = options.transpose ? rawX : rawY;
    if ((typeof x !== "number" && typeof x !== "string") || typeof y !== "number") {
      throw new VegaLiteChartError(options.transpose
        ? "Horizontal bar charts require a nominal y field and quantitative x field."
        : "Chart x values must be strings or numbers and y values must be numbers.");
    }
    const group = colorField ? String(datum[colorField] ?? "") : "";
    const low = lowField && typeof datum[lowField] === "number" ? datum[lowField] : undefined;
    const high = highField && typeof datum[highField] === "number" ? datum[highField] : undefined;
    const point: CartesianChartPoint = {
      x,
      y,
      ...(low === undefined ? {} : { yLow: y - low }),
      ...(high === undefined
        ? low === undefined ? {} : { yHigh: y + low }
        : { yHigh: y + high }),
    };
    groups.set(group, [...(groups.get(group) ?? []), point]);
  }
  return Array.from(groups, ([name, points]) => ({
    mark,
    points: options.sortDescending !== undefined
      ? [...points].sort((a, b) => {
        return options.sortDescending ? b.y - a.y : a.y - b.y;
      })
      : points,
    ...(name ? { name } : {}),
  }));
};

export const parseVegaLiteChart = (source: string): CartesianChartSpec => {
  let root: unknown;
  try {
    root = JSON.parse(source);
  } catch {
    throw new VegaLiteChartError("Vega-Lite source must be valid JSON.");
  }
  if (!object(root)) throw new VegaLiteChartError("Vega-Lite source must be an object.");
  for (const unsupported of ["transform", "facet", "repeat", "concat", "hconcat", "vconcat"]) {
    if (unsupported in root) throw new VegaLiteChartError(`${unsupported} is not supported.`);
  }
  const rootEncoding = object(root.encoding) ? root.encoding : undefined;
  const units = Array.isArray(root.layer)
    ? root.layer.map((value) => {
        if (!object(value)) throw new VegaLiteChartError("Every layer must be an object.");
        return value;
      })
    : [root];
  const encoding = object(units[0]?.encoding) ? units[0]!.encoding : rootEncoding;
  if (!encoding) throw new VegaLiteChartError("An encoding object is required.");
  const sourceX = axis(encoding.x);
  const sourceY = axis(encoding.y);
  const marks = units.map((unit) => markName(unit.mark));
  const horizontalBars = sourceX.scale === "linear"
    && sourceY.scale === "band"
    && marks.every((mark) => mark === "bar");
  const yEncoding = object(encoding.y) ? encoding.y : undefined;
  const sort = yEncoding?.sort;
  const sortDescending = sort === "-x"
    || (object(sort) && sort.order === "descending");
  const colorField = field(encoding, "color");
  const categoryField = field(encoding, "y");
  return {
    ...(typeof root.title === "string" ? { title: root.title } : {}),
    ...(horizontalBars ? { orientation: "horizontal" as const } : {}),
    ...(horizontalBars && sort ? { categorySort: sortDescending ? "descending" as const : "ascending" as const } : {}),
    ...(horizontalBars && colorField === categoryField ? { legend: false } : {}),
    x: horizontalBars ? sourceY : sourceX,
    y: horizontalBars ? sourceX : sourceY,
    series: units.flatMap((unit) => seriesForUnit(
      unit,
      root.data,
      rootEncoding,
      horizontalBars ? { transpose: true, ...(sort ? { sortDescending } : {}) } : undefined
    )),
  };
};

export { serializeCharGraphAnsi } from "./ansi.js";
export {
  CharDeskTextCompileError,
  compileCharDeskText,
  compileCharDeskProtocolText,
  materializeCompiledCharDeskText,
  normalizeCharDeskTextRequest,
} from "./compiler.js";
export type {
  CharDeskSourceKind,
  CharDeskTextFormat,
  CharDeskTextRequest,
  CharDeskTextCompilerId,
  CompileCharDeskTextOptions,
  CompiledCharDeskText,
} from "./compiler.js";
export {
  createCharGraphFragment,
  createCharGraphTextFragments,
  getCharGraphFragmentsText,
  getCharGraphText,
  joinCharGraphLines,
  mergeCharGraphStyle,
  splitCharGraphLines,
  styleCharGraphFragments,
} from "./fragments.js";
export {
  defineCharGraphRenderer,
  renderCharGraph,
} from "./model.js";
export type {
  CharGraphAwaitable,
  CharGraphDiagnostic,
  CharGraphFragment,
  CharGraphHeading,
  CharGraphInlineAlignment,
  CharGraphRenderer,
  CharGraphRenderResult,
  CharGraphSourceRange,
  CharGraphVisualGroup,
} from "./model.js";
export {
  locateCharGraphSourceRange,
  normalizeCharGraphSource,
  restoreCharGraphSourceRanges,
} from "./source-map.js";
export type { NormalizedCharGraphSource } from "./source-map.js";
export { renderCharGraphText } from "./text.js";
export type {
  CharGraphTextMode,
  CharGraphTextRenderOptions,
  CharGraphTextRenderResult,
  CharGraphTextRendererId,
} from "./text.js";
export {
  adaptMermaidXYChart,
  renderCartesianChart,
  renderCartesianChartSurface,
} from "./cartesian-chart.js";
export type {
  ChartValue,
  CartesianChartAxis,
  CartesianChartPoint,
  CartesianChartSeries,
  CartesianChartSpec,
} from "./cartesian-chart.js";
export { parseVegaLiteChart, VegaLiteChartError } from "./vega-lite-chart.js";

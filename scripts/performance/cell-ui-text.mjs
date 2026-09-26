import { performance } from "node:perf_hooks";
import { getGraphemeCellWidth, iterateGraphemes } from "@chardesk/protocol";
import { walkCellTextRows, walkCellTextRowsInRange } from "../../packages/cell-ui/dist/text-lines.js";

const uncachedRows = (text, widthLimit, onGlyph) => {
  let column = 0;
  let row = 0;
  let widest = 0;
  for (const { index, segment } of iterateGraphemes(text)) {
    if (segment === "\n") {
      widest = Math.max(widest, column);
      column = 0;
      row += 1;
      continue;
    }
    const width = getGraphemeCellWidth(segment);
    if (column > 0 && column + width > widthLimit) {
      widest = Math.max(widest, column);
      column = 0;
      row += 1;
    }
    if (onGlyph?.({ segment, offset: index, column, row, width }) === false) break;
    column += width;
  }
  return { width: Math.max(widest, column), height: row + 1 };
};

const paragraph = "Cell UI keeps source readable: 中文 👩🏽‍💻 é, links, code, and tabs\tstay in Cells. ".repeat(6);
const unique = Array.from({ length: 500 }, (_, index) => `${paragraph}${index}`);
const short = Array.from({ length: 1_000 }, (_, index) => `Item ${index}`);
const workloads = [
  ["repeated-long", () => Array.from({ length: 1_000 }, (_, index) =>
    [paragraph, index % 2 ? 40 : 80])],
  ["repeated-paint", () => Array.from({ length: 1_000 }, () => [paragraph, 40]),
    ({ row }) => row < 3],
  ["unique-long", (run) => unique.map((value) => [`${value}-${run}`, 60])],
  ["short-labels", () => short.map((value) => [value, 20])],
];
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const [name, inputs, onGlyph] of workloads) {
  const samples = { uncached: [], prepared: [] };
  let checksum = 0;
  for (let run = 0; run < 7; run += 1) {
    const batch = inputs(run);
    const variants = run % 2 === 0
      ? [["uncached", uncachedRows], ["prepared", walkCellTextRows]]
      : [["prepared", walkCellTextRows], ["uncached", uncachedRows]];
    for (const [variant, walk] of variants) {
      const start = performance.now();
      for (const [value, width] of batch) {
        const measured = walk(value, width, onGlyph);
        checksum += measured.width + measured.height;
      }
      samples[variant].push(performance.now() - start);
    }
  }
  console.log(JSON.stringify({ workload: name, iterations: inputs().length,
    medianMs: Object.fromEntries(Object.entries(samples).map(([variant, values]) =>
      [variant, Math.round(median(values.slice(2)) * 10) / 10])), checksum }));
}

const deepText = Array.from({ length: 2_500 }, (_, index) =>
  `Row ${String(index).padStart(4, "0")}: 中文 👩🏽‍💻 é and source text.\n`).join("");
const firstVisibleRow = 2_000;
const lastVisibleRow = firstVisibleRow + 8;
const fullWindow = (value) => {
  let count = 0;
  walkCellTextRows(value, 40, ({ row }) => {
    if (row >= lastVisibleRow) return false;
    if (row >= firstVisibleRow) count += 1;
  });
  return count;
};
const indexedWindow = (value) => {
  let count = 0;
  walkCellTextRowsInRange(value, 40, firstVisibleRow, lastVisibleRow, () => { count += 1; });
  return count;
};
if (fullWindow(deepText) !== indexedWindow(deepText)) {
  throw new Error("Deep-scroll row window differs from the full walk.");
}
const deepSamples = { full: [], indexed: [] };
let deepChecksum = 0;
for (let run = 0; run < 7; run += 1) {
  for (const [name, visit] of run % 2 === 0
    ? [["full", fullWindow], ["indexed", indexedWindow]]
    : [["indexed", indexedWindow], ["full", fullWindow]]) {
    const start = performance.now();
    for (let index = 0; index < 20; index += 1) deepChecksum += visit(deepText);
    deepSamples[name].push(performance.now() - start);
  }
}
const coldText = `${deepText}cold`;
const coldStart = performance.now();
deepChecksum += indexedWindow(coldText);
const coldBuildMs = performance.now() - coldStart;
console.log(JSON.stringify({ workload: "deep-scroll-static-text", iterations: 20,
  medianMs: Object.fromEntries(Object.entries(deepSamples).map(([variant, values]) =>
    [variant, Math.round(median(values.slice(2)) * 10) / 10])),
  coldBuildMs: Math.round(coldBuildMs * 10) / 10,
  indexBudget: { entries: 16, sourceCodeUnits: 2_000_000, rowsPerEntry: 100_000 },
  checksum: deepChecksum }));

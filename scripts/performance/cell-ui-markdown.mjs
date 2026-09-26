import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import {
  CellUiRuntime, Markdown, Root, ScrollArea, YogaLayoutEngine,
  composeScene, createSemanticSnapshot, createWidgetDescriptor,
  paintScene, reconcileWidgetTree, resolveCellUiScrollLayout,
} from "../../packages/cell-ui/dist/index.js";
import { createRuntimeWidgetDescriptor, MarkdownDescriptorCache } from "../../packages/cell-ui/dist/react.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const viewport = { width: 80, height: 25 };
const overlay = { x: 0, y: 0, ...viewport };
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const workloads = [
  ["guide-markdown", read("apps/cell-ui/public/guides/markdown.md")],
  ["component-menu", read("apps/cell-ui/public/components/menu.md")],
  ["prose-1000", Array.from({ length: 1_000 }, (_, index) =>
    `Paragraph ${index}: **bold** [link](https://example.com) text with cells and 世界.`).join("\n\n")],
  ["code-1000", `\`\`\`ts\n${Array.from({ length: 1_000 }, (_, index) =>
    `const value${index} = ${index};`).join("\n")}\n\`\`\``],
];
const view = (source, scrollY) => React.createElement(Root, null,
  React.createElement(ScrollArea, { id: "scroll", scrollY, style: viewport },
    React.createElement(Markdown, { source })));
const timed = (run) => {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
};
const rounded = (value) => Math.round(value * 10) / 10;
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return rounded(sorted[Math.floor(sorted.length / 2)]);
};
const summarize = (samples) => Object.fromEntries(Object.keys(samples[0]).map((key) =>
  [key, median(samples.map((sample) => sample[key]))]));

for (const [name, source] of workloads) {
  const engine = new YogaLayoutEngine();
  const stages = {};
  const descriptor = timed(() => createWidgetDescriptor(view(source, 0)));
  stages.describe = rounded(descriptor.ms);
  const reconciled = timed(() => reconcileWidgetTree(undefined, descriptor.value));
  stages.reconcile = rounded(reconciled.ms);
  const laidOut = timed(() => resolveCellUiScrollLayout(reconciled.value.tree, viewport, overlay, engine));
  stages.layoutAndScene = rounded(laidOut.ms);
  const semantics = timed(() => createSemanticSnapshot(reconciled.value.tree, laidOut.value.scene, 1, null));
  stages.semantics = rounded(semantics.ms);
  const painted = timed(() => paintScene(reconciled.value.tree, laidOut.value.scene));
  stages.paint = rounded(painted.ms);

  let previousTree = reconciled.value.tree;
  let previousBuffer = painted.value;
  const scrollStages = [];
  for (let scrollY = 1; scrollY <= 6; scrollY += 1) {
    const sample = {};
    const nextDescriptor = timed(() => createWidgetDescriptor(view(source, scrollY)));
    sample.describe = nextDescriptor.ms;
    const nextTree = timed(() => reconcileWidgetTree(previousTree, nextDescriptor.value));
    sample.reconcile = nextTree.ms;
    const nextScene = timed(() => composeScene(nextTree.value.tree, laidOut.value.layout, overlay));
    sample.scene = nextScene.ms;
    sample.semantics = timed(() => createSemanticSnapshot(nextTree.value.tree, nextScene.value, scrollY + 1, null)).ms;
    const nextPaint = timed(() => paintScene(nextTree.value.tree, nextScene.value, new Map(), undefined, {
      previous: previousBuffer,
      dirtyRegions: [overlay],
    }));
    sample.paint = nextPaint.ms;
    previousTree = nextTree.value.tree;
    previousBuffer = nextPaint.value;
    scrollStages.push(sample);
  }

  const cache = new MarkdownDescriptorCache();
  let preparedTree = reconcileWidgetTree(undefined,
    createRuntimeWidgetDescriptor(view(source, 0), {}, "rich", cache)).tree;
  let preparedBuffer = painted.value;
  const preparedScrollStages = [];
  for (let scrollY = 1; scrollY <= 6; scrollY += 1) {
    const sample = {};
    const nextDescriptor = timed(() => createRuntimeWidgetDescriptor(view(source, scrollY), {}, "rich", cache));
    sample.describe = nextDescriptor.ms;
    const nextTree = timed(() => reconcileWidgetTree(preparedTree, nextDescriptor.value));
    sample.reconcile = nextTree.ms;
    const nextScene = timed(() => composeScene(nextTree.value.tree, laidOut.value.layout, overlay));
    sample.scene = nextScene.ms;
    sample.semantics = timed(() => createSemanticSnapshot(nextTree.value.tree, nextScene.value, scrollY + 1, null)).ms;
    const nextPaint = timed(() => paintScene(nextTree.value.tree, nextScene.value, new Map(), undefined, {
      previous: preparedBuffer,
      dirtyRegions: [overlay],
    }));
    sample.paint = nextPaint.ms;
    preparedTree = nextTree.value.tree;
    preparedBuffer = nextPaint.value;
    preparedScrollStages.push(sample);
  }
  cache.clear();
  engine.dispose();

  const runtime = new CellUiRuntime({ viewport });
  const cold = timed(() => runtime.render(view(source, 0)));
  const scroll = [];
  for (let scrollY = 1; scrollY <= 6; scrollY += 1) {
    const next = timed(() => runtime.render(view(source, scrollY)));
    scroll.push(next.ms);
    if (next.value.invalidation.work.layout !== "reused") {
      throw new Error(`${name}: steady scroll unexpectedly recomputed layout`);
    }
  }
  runtime.dispose();
  console.log(JSON.stringify({
    workload: name,
    sourceLines: source.split("\n").length,
    nodes: reconciled.value.tree.nodes.size,
    initialStagesMs: stages,
    scrollStagesMedianMs: summarize(scrollStages),
    preparedScrollStagesMedianMs: summarize(preparedScrollStages),
    runtimeInitialMs: rounded(cold.ms),
    runtimeScrollMedianMs: median(scroll),
  }));
}

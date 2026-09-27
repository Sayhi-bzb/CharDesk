import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import React from "react";
import { Badge, Box, Button, CellUiRuntime, Checkbox, Root, ScrollArea, Text,
  YogaLayoutEngine, composeScene, createSemanticSnapshot } from "../../packages/cell-ui/dist/index.js";
import { Overlay } from "../../packages/cell-ui/dist/react.js";
import { composeSceneForScroll } from "../../packages/cell-ui/dist/scene.js";
import { updateSemanticSnapshotForScroll } from "../../packages/cell-ui/dist/semantics.js";

const viewport = { width: 80, height: 24 };
const overlay = { x: 0, y: 0, ...viewport };
const el = React.createElement;
const median = (samples) => {
  const values = [...samples].sort((a, b) => a - b);
  return Math.round(values[Math.floor(values.length / 2)] * 10) / 10;
};
const timed = (run) => {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
};
const rows = (prefix) => Array.from({ length: 400 }, (_, index) => {
  const label = el(Text, { id: `${prefix}-label-${index}` }, `${prefix} ${index} — Cell UI`);
  const kind = index % 4;
  return kind === 0 ? el(Button, { id: `${prefix}-${index}`, key: index }, label)
    : kind === 1 ? el(Checkbox, { id: `${prefix}-${index}`, key: index, checked: index % 2 === 0 }, label)
      : kind === 2 ? el(Badge, { id: `${prefix}-${index}`, key: index, tone: "success" }, label)
        : el(Text, { id: `${prefix}-${index}`, key: index }, `${prefix} ${index} — Cell UI`);
});
const leftRows = rows("left");
const rightRows = rows("right");
const view = (leftScroll, rightScroll, checked = false, showOverlay = false, stableRows = true) => el(Root, { id: "root" },
  el(Box, { id: "columns", style: { direction: "row", width: 80 } },
    el(ScrollArea, { id: "left", scrollY: leftScroll, style: { width: 40, height: 24 } },
      el(Checkbox, { id: "local-state", checked }, el(Text, null, "Local state")), stableRows ? leftRows : rows("left")),
    el(ScrollArea, { id: "right", scrollY: rightScroll, style: { width: 40, height: 24 } },
      stableRows ? rightRows : rows("right"))),
  showOverlay ? el(Overlay, { id: "overlay", position: { x: 1, y: 1 } }, el(Text, null, "Overlay")) : null);

const runtime = new CellUiRuntime({ viewport });
let previous = runtime.render(view(0, 0));
const results = { runtime: [], freshElementRuntime: [], fullScene: [], partialScene: [],
  fullSemantics: [], partialSemantics: [] };
const freshRuntime = new CellUiRuntime({ viewport });
freshRuntime.render(view(0, 0, false, false, false));
for (let index = 1; index <= 12; index += 1) {
  const stableView = view(index, 0);
  const freshView = view(index, 0, false, false, false);
  const rendered = timed(() => runtime.render(stableView));
  const freshRendered = timed(() => freshRuntime.render(freshView));
  const frame = rendered.value;
  assert.equal(frame.buffer.toText(), freshRendered.value.buffer.toText());
  const fullScene = timed(() => composeScene(frame.tree, frame.layout, overlay));
  const partialScene = timed(() => composeSceneForScroll(frame.tree, frame.layout, overlay,
    previous.scene, new Set(["left"])));
  const fullSemantics = timed(() => createSemanticSnapshot(frame.tree, fullScene.value,
    frame.revision, frame.semantics.focusedId));
  const leftIds = new Set(["left", "local-state", ...frame.tree.nodes.keys()].filter((id) =>
    id === "left" || id === "local-state" || id.startsWith("left-") || id.startsWith("left/")));
  const partialSemantics = timed(() => updateSemanticSnapshotForScroll(previous.semantics,
    partialScene.value, frame.revision, leftIds));
  assert.deepEqual(partialScene.value, fullScene.value);
  assert.deepEqual(partialSemantics.value, fullSemantics.value);
  results.runtime.push(rendered.ms);
  results.freshElementRuntime.push(freshRendered.ms);
  results.fullScene.push(fullScene.ms);
  results.partialScene.push(partialScene.ms);
  results.fullSemantics.push(fullSemantics.ms);
  results.partialSemantics.push(partialSemantics.ms);
  previous = frame;
}
const fallbackSamples = { localState: [], overlay: [], resize: [] };
for (let index = 0; index < 8; index += 1) {
  fallbackSamples.localState.push(timed(() => runtime.render(view(12, 0, index % 2 === 0))).ms);
}
for (let index = 0; index < 8; index += 1) {
  fallbackSamples.overlay.push(timed(() => runtime.render(view(12, 0, true, index % 2 === 0))).ms);
}
for (let index = 0; index < 8; index += 1) {
  runtime.resize({ width: index % 2 === 0 ? 82 : 80, height: 24 });
  fallbackSamples.resize.push(timed(() => runtime.render(view(12, 0, true))).ms);
}
runtime.dispose();
freshRuntime.dispose();
console.log(JSON.stringify({ workload: "two-independent-mixed-scroll-areas", nodes: previous.tree.nodes.size,
  medianMs: Object.fromEntries(Object.entries(results).map(([key, samples]) => [key, median(samples.slice(2))])),
  fallbackMedianMs: Object.fromEntries(Object.entries(fallbackSamples).map(([key, samples]) =>
    [key, median(samples.slice(2))])) }));

for (const perSide of [100, 400, 1_000]) {
  const stable = (prefix) => Array.from({ length: perSide }, (_, index) =>
    el(Text, { id: `${prefix}-${index}`, key: index, style: { height: 1 } }, `${prefix} ${index}`));
  const left = stable("left");
  const right = stable("right");
  const yoga = new YogaLayoutEngine();
  let layoutCalls = 0;
  let layoutMs = 0;
  const localRuntime = new CellUiRuntime({ viewport, layoutEngine: {
    compute: (tree, size) => {
      layoutCalls += 1;
      const measured = timed(() => yoga.compute(tree, size));
      layoutMs += measured.ms;
      return measured.value;
    },
    dispose: () => yoga.dispose(),
  } });
  const localView = (label) => el(Root, { id: "root" },
    el(Box, { style: { direction: "row" } },
      el(Box, { style: { width: 40 } }, el(Text, { id: "changed", style: { height: 1 } }, label), ...left),
      el(Box, { style: { width: 40 } }, ...right)));
  let label = "A";
  let frame = localRuntime.render(localView(label));
  const localSamples = { unchanged: [], changed: [] };
  for (let index = 0; index < 18; index += 1) {
    for (const variant of ["unchanged", "changed"]) {
      if (variant === "changed") label = label === "A" ? "B" : "A";
      const beforeCalls = layoutCalls;
      const beforeLayout = layoutMs;
      const measured = timed(() => localRuntime.render(localView(label)));
      frame = measured.value;
      localSamples[variant].push({
        total: measured.ms,
        layout: layoutMs - beforeLayout,
        calls: layoutCalls - beforeCalls,
        damage: frame.invalidation.dirtyRegions.reduce((area, region) => area + region.width * region.height, 0),
      });
    }
  }
  const oracle = new CellUiRuntime({ viewport });
  assert.equal(frame.buffer.toText(), oracle.render(localView(label)).buffer.toText());
  oracle.dispose();
  localRuntime.dispose();
  console.log(JSON.stringify({ workload: "single-label-in-two-subtrees", nodes: frame.tree.nodes.size,
    median: Object.fromEntries(Object.entries(localSamples).map(([variant, samples]) => {
      const settled = samples.slice(3);
      return [variant, {
        totalMs: median(settled.map((sample) => sample.total)),
        layoutMs: median(settled.map((sample) => sample.layout)),
        layoutCalls: median(settled.map((sample) => sample.calls)),
        dirtyCellArea: median(settled.map((sample) => sample.damage)),
      }];
    })) }));
}

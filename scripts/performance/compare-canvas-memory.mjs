import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , baselinePath, candidatePath, outputPath] = process.argv;
if (!baselinePath || !candidatePath) {
  console.error("Usage: npm run compare:memory -- <baseline.json> <candidate.json> [output.md]");
  process.exitCode = 1;
} else {
  const [baseline, candidate] = await Promise.all([
    readFile(path.resolve(baselinePath), "utf8").then(JSON.parse),
    readFile(path.resolve(candidatePath), "utf8").then(JSON.parse),
  ]);
  if (baseline.schemaVersion !== candidate.schemaVersion) {
    throw new Error(`Incompatible memory report schemas: ${baseline.schemaVersion} and ${candidate.schemaVersion}`);
  }
  const context = (report) => ({
    scope: report.scope,
    exclusions: report.exclusions,
    environment: report.environment,
    settings: {
      ...report.settings,
      inputCommitCadenceMs: undefined,
    },
  });
  if (JSON.stringify(context(baseline)) !== JSON.stringify(context(candidate))) {
    throw new Error("Memory reports use different environments or settings");
  }
  const candidateById = new Map(candidate.workloads.map((workload) => [workload.id, workload]));
  const pct = (before, after) => before === 0 ? "n/a" : `${(((after - before) / before) * 100).toFixed(1)}%`;
  const mib = (value) => (value / 1024 / 1024).toFixed(2);
  const lines = [
    "# Canvas memory comparison",
    "",
    `Baseline: ${baseline.label ?? baseline.gitCommit}`,
    `Candidate: ${candidate.label ?? candidate.gitCommit}`,
    `Input cadence: ${baseline.settings.inputCommitCadenceMs} → ${candidate.settings.inputCommitCadenceMs} ms`,
    "",
    "Negative byte deltas use less memory.",
    "",
    "| Workload | Metric | Baseline median (MiB) | Candidate median (MiB) | Delta |",
    "| --- | --- | ---: | ---: | ---: |",
  ];
  const regressions = [];
  for (const beforeWorkload of baseline.workloads) {
    const afterWorkload = candidateById.get(beforeWorkload.id);
    if (!afterWorkload) throw new Error(`Candidate is missing workload ${beforeWorkload.id}`);
    for (const metric of [
      "loadedRetainedDeltaBytes",
      "interactionPeakDeltaBytes",
      "retainedDeltaBytes",
      "releasedResidualBytes",
      "releasedHistoryBytes",
      "unattributedProjectionCacheBytes",
      "cycleHeapSlopeBytes",
    ]) {
      const before = beforeWorkload.summary[metric].median;
      const after = afterWorkload.summary[metric].median;
      const delta = after - before;
      lines.push(`| ${beforeWorkload.label} | ${metric} | ${mib(before)} | ${mib(after)} | ${pct(before, after)} |`);
      const allowed = Math.max(
        candidate.thresholds.maxComparisonRegressionBytes,
        Math.abs(before) * candidate.thresholds.maxComparisonRegressionRatio,
      );
      if (delta > allowed) regressions.push(`${beforeWorkload.id}:${metric}`);
    }
  }
  lines.push(
    "",
    "## Managed input batching",
    "",
    "| Workload | Metric | Baseline median | Candidate median | Delta |",
    "| --- | --- | ---: | ---: | ---: |",
  );
  for (const beforeWorkload of baseline.workloads) {
    const afterWorkload = candidateById.get(beforeWorkload.id);
    for (const metric of [
      "inputBatches",
      "inputTextLength",
      "firstInputBatches",
      "burstInputBatches",
      "boundaryInputBatches",
      "firstInputCommitP95Ms",
      "burstInputCommitP95Ms",
      "burstInputCommitMaxMs",
    ]) {
      const before = beforeWorkload.summary[metric].median;
      const after = afterWorkload.summary[metric].median;
      lines.push(
        `| ${beforeWorkload.label} | ${metric} | ${before.toFixed(1)} | ${after.toFixed(1)} | ${pct(before, after)} |`,
      );
    }
  }
  lines.push(
    "",
    "## Render and mutation work",
    "",
    "| Workload | Metric | Baseline median | Candidate median | Delta |",
    "| --- | --- | ---: | ---: | ---: |",
  );
  for (const beforeWorkload of baseline.workloads) {
    const afterWorkload = candidateById.get(beforeWorkload.id);
    for (const metric of [
      "operations",
      "historyActions",
      "contentFrames",
      "fullContentFrames",
      "partialContentFrames",
      "renderedGlyphs",
      "dirtyCellArea",
    ]) {
      const before = beforeWorkload.summary[metric].median;
      const after = afterWorkload.summary[metric].median;
      lines.push(
        `| ${beforeWorkload.label} | ${metric} | ${before.toFixed(0)} | ${after.toFixed(0)} | ${pct(before, after)} |`,
      );
    }
  }
  lines.push("", regressions.length ? `Guard regressions: ${regressions.join(", ")}` : "Guard regressions: none", "");
  const markdown = lines.join("\n");
  if (outputPath) await writeFile(path.resolve(outputPath), markdown);
  process.stdout.write(markdown);
  if (regressions.length) process.exitCode = 2;
}

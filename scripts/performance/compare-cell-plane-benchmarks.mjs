import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , baselinePath, candidatePath, outputPath] = process.argv;

if (!baselinePath || !candidatePath) {
  console.error(
    "Usage: npm run compare:engine-perf -- <baseline-report.json> <candidate-report.json> [output.md]",
  );
  process.exitCode = 1;
} else {
  const [baseline, candidate] = await Promise.all([
    readFile(path.resolve(baselinePath), "utf8").then(JSON.parse),
    readFile(path.resolve(candidatePath), "utf8").then(JSON.parse),
  ]);

  if (baseline.schemaVersion !== candidate.schemaVersion) {
    throw new Error(
      `Incompatible report schemas: ${baseline.schemaVersion} and ${candidate.schemaVersion}`,
    );
  }
  const comparisonContext = (report) => ({
    environment: report.environment,
    settings: report.settings,
  });
  if (
    JSON.stringify(comparisonContext(baseline)) !==
    JSON.stringify(comparisonContext(candidate))
  ) {
    throw new Error("Reports use different environments or sampling settings");
  }

  const candidateById = new Map(
    candidate.workloads.map((workload) => [workload.id, workload]),
  );
  const percentage = (before, after) =>
    before === 0 ? "n/a" : `${(((after - before) / before) * 100).toFixed(1)}%`;
  const lines = [
    "# CellPlane benchmark comparison",
    "",
    `Baseline: ${baseline.label ?? `\`${baseline.gitCommit}\``}${baseline.gitDirty ? " (dirty)" : ""} (${baseline.generatedAt})`,
    `Candidate: ${candidate.label ?? `\`${candidate.gitCommit}\``}${candidate.gitDirty ? " (dirty)" : ""} (${candidate.generatedAt})`,
    "",
    "Negative deltas are faster. Compare reports captured on the same machine and runtime.",
    "",
    "| Workload | Phase | Baseline median (ms) | Candidate median (ms) | Median delta | p95 delta |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
  ];

  for (const baselineWorkload of baseline.workloads) {
    const candidateWorkload = candidateById.get(baselineWorkload.id);
    if (!candidateWorkload) {
      throw new Error(`Candidate report is missing workload ${baselineWorkload.id}`);
    }
    if (
      baselineWorkload.operationCount !== candidateWorkload.operationCount ||
      baselineWorkload.sourceCellCount !== candidateWorkload.sourceCellCount ||
      baselineWorkload.projectedCellCount !== candidateWorkload.projectedCellCount ||
      baselineWorkload.projectionChecksum !== candidateWorkload.projectionChecksum ||
      baselineWorkload.renderedCellCount !== candidateWorkload.renderedCellCount ||
      baselineWorkload.renderedGlyphCount !== candidateWorkload.renderedGlyphCount ||
      baselineWorkload.fillTextCalls !== candidateWorkload.fillTextCalls ||
      baselineWorkload.invalidatedRenderedCellCount !==
        candidateWorkload.invalidatedRenderedCellCount ||
      baselineWorkload.invalidatedRenderedGlyphCount !==
        candidateWorkload.invalidatedRenderedGlyphCount ||
      baselineWorkload.invalidatedFillTextCalls !==
        candidateWorkload.invalidatedFillTextCalls
    ) {
      throw new Error(`Projection changed for workload ${baselineWorkload.id}`);
    }
    for (const phase of Object.keys(baselineWorkload.phases)) {
      const before = baselineWorkload.phases[phase];
      const after = candidateWorkload.phases[phase];
      if (!after) throw new Error(`Candidate report is missing phase ${phase}`);
      lines.push(
        `| ${baselineWorkload.label} | ${phase} | ${before.medianMs.toFixed(3)} | ${after.medianMs.toFixed(3)} | ${percentage(before.medianMs, after.medianMs)} | ${percentage(before.p95Ms, after.p95Ms)} |`,
      );
    }
  }

  const markdown = `${lines.join("\n")}\n`;
  if (outputPath) await writeFile(path.resolve(outputPath), markdown);
  process.stdout.write(markdown);
}

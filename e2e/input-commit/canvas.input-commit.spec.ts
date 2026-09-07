import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CANVAS_INPUT_COMMIT_SCHEMA,
  createInputCommitMarkdown,
  evaluatePairedOperationHypothesis,
  summarizeInputCommitSamples,
  type InputCommitReport,
  type InputCommitSample,
} from '../../scripts/performance/canvas-input-commit-support';

type GridCell = { char: string; color: string };
type GridEntry = [string, GridCell];
type MutationStats = {
  samples: number;
  stages: Record<string, { median: number }>;
  changedCells: { median: number };
  forwardBytes: { median: number };
  inverseBytes: { median: number };
};
type Diagnostics = {
  ready: () => Promise<void>;
  activeSessionId: () => string;
  switchSession: (id: string) => Promise<boolean>;
  removeSession: (id: string) => Promise<boolean>;
  loadSession: (snapshot: { mode: 'freeform'; grid: GridEntry[]; scene: []; components: [] }) => string;
  writeText: (value: string, start?: { x: number; y: number }) => number;
  undo: () => boolean;
  redo: () => boolean;
  gridEntries: () => GridEntry[];
  cellCount: () => number;
  memoryStats: () => Record<string, number>;
  mutationStats: () => MutationStats;
  resetMutationStats: () => void;
};

const WARMUPS = Math.max(0, Number(process.env.CHARDESK_INPUT_COMMIT_WARMUPS ?? 3));
const MEASURED_RUNS = Math.max(1, Number(process.env.CHARDESK_INPUT_COMMIT_RUNS ?? 15));
const REPORT_DIR = path.resolve(
  process.env.CANVAS_INPUT_COMMIT_REPORT_DIR ?? 'test-results/canvas-input-commit'
);
const FILTER = new Set((process.env.CHARDESK_INPUT_COMMIT_WORKLOADS ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean));

const textFor = (characterSet: 'ascii' | 'unicode', count: number) => {
  if (characterSet === 'ascii') return 'x'.repeat(count);
  const characters = ['你', '👩🏽‍💻', 'é', 'A'];
  return Array.from({ length: count }, (_, index) => characters[index % characters.length]).join('');
};

const baseGrid = (target: 'empty' | 'overwrite', count: number): GridEntry[] => {
  const background = Array.from({ length: 5_000 }, (_, index): GridEntry => [
    `${index % 100},${20 + Math.floor(index / 100)}`,
    { char: 'b', color: '#111827' },
  ]);
  if (target === 'empty') return background;
  return [
    ...Array.from({ length: Math.max(5_000, count * 2) }, (_, x): GridEntry => [
      `${x},0`, { char: 'o', color: '#dc2626' },
    ]),
    ...background,
  ];
};

const checksum = (entries: readonly GridEntry[]) => {
  let hash = 2166136261;
  const ordered = [...entries].sort(([left], [right]) => left.localeCompare(right));
  for (const [key, cell] of ordered) {
    const value = `${key}\0${cell.char}\0${cell.color}`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16);
};

const cases = ([64, 256, 1_000, 2_500] as const).flatMap((textLength) =>
  (['ascii', 'unicode'] as const).flatMap((characterSet) =>
    (['empty', 'overwrite'] as const).map((target) => ({
      id: `${characterSet}-${target}-${textLength}`,
      label: `${characterSet} ${target} ${textLength.toLocaleString()}`,
      characterSet,
      target,
      textLength,
    }))
  )
).filter(({ id }) => FILTER.size === 0 || FILTER.has(id));

test('measures synchronous canvas text commits by phase', async ({ page }) => {
  await page.goto(
    '/?canvas-stress=1&canvas-input-commit=1&canvas-stress-input-commit-ms=32',
    { waitUntil: 'domcontentloaded' }
  );
  const handle = await page.waitForFunction(() =>
    (window as Window & { __chardeskCanvasStress?: Diagnostics }).__chardeskCanvasStress
  );
  await handle.evaluate((api) => api.ready());
  const baselineId = await handle.evaluate((api) => api.activeSessionId());
  const workloads: InputCommitReport['workloads'] = [];

  for (const workload of cases) {
    const samples: InputCommitSample[] = [];
    const text = textFor(workload.characterSet, workload.textLength);
    for (let run = 0; run < WARMUPS + MEASURED_RUNS; run += 1) {
      const grid = baseGrid(workload.target, workload.textLength);
      const sessionId = await handle.evaluate(
        (api, value) => api.loadSession({ mode: 'freeform', grid: value, scene: [], components: [] }),
        grid
      );
      await handle.evaluate((api) => api.ready());
      const before = await handle.evaluate((api) => ({
        cells: api.cellCount(), memory: api.memoryStats(), entries: api.gridEntries(),
      }));
      await handle.evaluate((api) => api.resetMutationStats());
      const totalMs = await handle.evaluate((api, value) => api.writeText(value), text);
      const after = await handle.evaluate((api) => ({
        cells: api.cellCount(), memory: api.memoryStats(), entries: api.gridEntries(),
        mutation: api.mutationStats(),
      }));
      expect(after.mutation.samples).toBe(1);
      expect((after.memory.operations ?? 0) - (before.memory.operations ?? 0)).toBe(1);
      expect((after.memory.historyActions ?? 0) - (before.memory.historyActions ?? 0)).toBe(1);
      const writtenChecksum = checksum(after.entries);
      expect(await handle.evaluate((api) => api.undo())).toBe(true);
      expect(checksum(await handle.evaluate((api) => api.gridEntries()))).toBe(checksum(before.entries));
      expect(await handle.evaluate((api) => api.redo())).toBe(true);
      expect(checksum(await handle.evaluate((api) => api.gridEntries()))).toBe(writtenChecksum);

      if (run >= WARMUPS) {
        const stages = Object.fromEntries(Object.entries(after.mutation.stages)
          .map(([name, distribution]) => [name, distribution.median]));
        stages.textPreparationAndStateMs = Math.max(
          0,
          totalMs - (stages.totalMs ?? 0)
        );
        samples.push({
          totalMs,
          stages,
          changedCells: after.mutation.changedCells.median,
          forwardBytes: after.mutation.forwardBytes.median,
          inverseBytes: after.mutation.inverseBytes.median,
          operationDelta: (after.memory.operations ?? 0) - (before.memory.operations ?? 0),
          historyActionDelta:
            (after.memory.historyActions ?? 0) - (before.memory.historyActions ?? 0),
          cellDelta: after.cells - before.cells,
        });
      }
      await handle.evaluate((api, id) => api.switchSession(id), baselineId);
      await handle.evaluate((api, id) => api.removeSession(id), sessionId);
    }
    workloads.push({ ...workload, samples, summary: summarizeInputCommitSamples(samples) });
  }

  const report: InputCommitReport = {
    schemaVersion: CANVAS_INPUT_COMMIT_SCHEMA,
    generatedAt: new Date().toISOString(),
    ...(process.env.CANVAS_INPUT_COMMIT_LABEL
      ? { label: process.env.CANVAS_INPUT_COMMIT_LABEL }
      : {}),
    gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    gitDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
    settings: { warmups: WARMUPS, measuredRuns: MEASURED_RUNS, implementation: 'legacy' },
    hypothesis: evaluatePairedOperationHypothesis(workloads),
    workloads,
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(REPORT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(path.join(REPORT_DIR, 'report.md'), createInputCommitMarkdown(report)),
  ]);
});

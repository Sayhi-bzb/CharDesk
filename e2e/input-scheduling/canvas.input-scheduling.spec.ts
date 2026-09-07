import { expect, test, type Browser, type JSHandle, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CANVAS_INPUT_SCHEDULING_SCHEMA,
  createInputSchedulingMarkdown,
  evaluateInputSchedulingHypothesis,
  summarizeInputSchedulingSamples,
  type InputSchedulingReport,
  type InputSchedulingSample,
} from '../../scripts/performance/canvas-input-scheduling-support';

type GridCell = { char: string; color: string };
type GridEntry = [string, GridCell];
type ManagedInputStats = {
  managedInputBatches: number;
  managedInputTextLength: number;
  firstManagedInputBatches: number;
  burstManagedInputBatches: number;
  capacityManagedInputBatches: number;
  boundaryManagedInputBatches: number;
  managedInputCommitP95Ms: number;
  managedInputCommitMaxMs: number;
  managedInputQueueP95Ms: number;
  managedInputQueueMaxMs: number;
  managedInputEndToEndP95Ms: number;
  managedInputEndToEndMaxMs: number;
  managedInputBatchTextLengthP95: number;
  managedInputBatchTextLengthMax: number;
};
type Diagnostics = {
  ready: () => Promise<void>;
  createSession: (mode?: 'freeform' | 'structured') => string;
  setTextCursor: (point: { x: number; y: number }) => void;
  managedInputCursor: () => { x: number; y: number } | null;
  undo: () => boolean;
  redo: () => boolean;
  gridEntries: () => GridEntry[];
  memoryStats: () => Record<string, number>;
  renderStats: () => ManagedInputStats | null;
  resetManagedInputStats: () => void;
  focusManagedInput: () => boolean;
  managedInputIdentity: () => string | null;
};

const WARMUPS = Math.max(0, Number(process.env.CHARDESK_INPUT_SCHEDULING_WARMUPS ?? 3));
const MEASURED_RUNS = Math.max(
  1,
  Number(process.env.CHARDESK_INPUT_SCHEDULING_RUNS ?? 15)
);
const REPORT_DIR = path.resolve(
  process.env.CANVAS_INPUT_SCHEDULING_REPORT_DIR ??
    'test-results/canvas-input-scheduling'
);
const FILTER = new Set((process.env.CHARDESK_INPUT_SCHEDULING_WORKLOADS ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean));

const policies = [
  { id: 'unbounded', label: 'unbounded', query: 'unbounded' },
  { id: 'bounded-512', label: 'bounded 512', query: '512' },
] as const;
const cases = [
  ...[250, 1_000, 2_500].map((textLength) => ({
    inputMode: 'type' as const,
    characterSet: 'ascii' as const,
    textLength,
    delayMs: 0,
  })),
  {
    inputMode: 'type' as const,
    characterSet: 'ascii' as const,
    textLength: 250,
    delayMs: 5,
  },
  {
    inputMode: 'insert-text' as const,
    characterSet: 'unicode' as const,
    textLength: 1_000,
    delayMs: 0,
  },
];

const textFor = (characterSet: 'ascii' | 'unicode', count: number): string => {
  if (characterSet === 'ascii') return 'x'.repeat(count);
  const characters = ['你', '👩🏽‍💻', 'é', 'A'];
  return Array.from(
    { length: count },
    (_, index) => characters[index % characters.length]
  ).join('');
};

const checksum = (entries: readonly GridEntry[]): string => {
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

const readStats = async (handle: JSHandle<Diagnostics>) => {
  const stats = await handle.evaluate((api) => api.renderStats());
  if (!stats) throw new Error('Managed input stats unavailable');
  return stats;
};

const focusCanvas = async (
  page: Page,
  handle: JSHandle<Diagnostics>
): Promise<void> => {
  await expect.poll(
    () => handle.evaluate((api) => api.focusManagedInput()),
    { timeout: 15_000 }
  ).toBe(true);
  const textarea = page.locator('[data-canvas-managed-input="true"]');
  await textarea.focus();
  await expect(textarea).toBeFocused();
};

const settleCanvas = async (page: Page): Promise<void> => {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
};

const measureRun = async (
  browser: Browser,
  policy: (typeof policies)[number],
  workloadCase: (typeof cases)[number],
  text: string
): Promise<InputSchedulingSample> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(
      `/?canvas-stress=1&canvas-stress-input-commit-ms=32&canvas-stress-input-buffer-limit=${policy.query}`,
      { waitUntil: 'domcontentloaded' }
    );
    await page.locator('canvas').first().waitFor({ timeout: 30_000 });
    const handle = await page.waitForFunction(() =>
      (window as Window & { __chardeskCanvasStress?: Diagnostics }).__chardeskCanvasStress
    ) as JSHandle<Diagnostics>;
    await handle.evaluate((api) => api.ready());
    const sessionId = await handle.evaluate((api) => api.createSession());
    await expect.poll(
      () => handle.evaluate((api) => api.managedInputIdentity()),
      { timeout: 15_000 }
    ).toBe(sessionId);
    await expect.poll(
      () => handle.evaluate((api) => api.activeSessionId()),
      { timeout: 15_000 }
    ).toBe(sessionId);
    await handle.evaluate((api) => api.setTextCursor({ x: 0, y: 0 }));
    await expect.poll(
      () => handle.evaluate((api) => api.managedInputCursor()),
      { timeout: 15_000 }
    ).toEqual({ x: 0, y: 0 });
    await settleCanvas(page);
    await expect.poll(
      () => handle.evaluate((api) => api.renderStats() !== null),
      { timeout: 15_000 }
    ).toBe(true);
    await settleCanvas(page);
    await focusCanvas(page, handle);
    await handle.evaluate((api) => api.resetManagedInputStats());
    const before = await handle.evaluate((api) => ({
      entries: api.gridEntries(),
      memory: api.memoryStats(),
    }));
    if (workloadCase.inputMode === 'insert-text') {
      await page.keyboard.insertText(text);
    } else {
      await page.keyboard.type(text, { delay: workloadCase.delayMs });
    }
    await expect.poll(
      async () => (await readStats(handle)).managedInputTextLength,
      { timeout: 15_000 }
    ).toBe(text.length);
    const baselineChecksum = checksum(before.entries);
    await expect.poll(
      async () => checksum(await handle.evaluate((api) => api.gridEntries())),
      { timeout: 15_000 }
    ).not.toBe(baselineChecksum);
    const stats = await readStats(handle);
    const after = await handle.evaluate((api) => ({
      entries: api.gridEntries(),
      memory: api.memoryStats(),
    }));
    const operationDelta =
      (after.memory.operations ?? 0) - (before.memory.operations ?? 0);
    const historyActionDelta =
      (after.memory.historyActions ?? 0) - (before.memory.historyActions ?? 0);
    expect(operationDelta).toBe(stats.managedInputBatches);
    expect(historyActionDelta).toBe(operationDelta);
    const writtenChecksum = checksum(after.entries);
    for (let index = 0; index < historyActionDelta; index += 1) {
      expect(await handle.evaluate((api) => api.undo())).toBe(true);
    }
    await expect.poll(
      async () => checksum(await handle.evaluate((api) => api.gridEntries()))
    ).toBe(baselineChecksum);
    for (let index = 0; index < historyActionDelta; index += 1) {
      expect(await handle.evaluate((api) => api.redo())).toBe(true);
    }
    await expect.poll(
      async () => checksum(await handle.evaluate((api) => api.gridEntries()))
    ).toBe(writtenChecksum);
    return {
      queueP95Ms: stats.managedInputQueueP95Ms,
      queueMaxMs: stats.managedInputQueueMaxMs,
      commitP95Ms: stats.managedInputCommitP95Ms,
      commitMaxMs: stats.managedInputCommitMaxMs,
      endToEndP95Ms: stats.managedInputEndToEndP95Ms,
      endToEndMaxMs: stats.managedInputEndToEndMaxMs,
      batchTextLengthP95: stats.managedInputBatchTextLengthP95,
      batchTextLengthMax: stats.managedInputBatchTextLengthMax,
      batches: stats.managedInputBatches,
      firstBatches: stats.firstManagedInputBatches,
      burstBatches: stats.burstManagedInputBatches,
      capacityBatches: stats.capacityManagedInputBatches,
      boundaryBatches: stats.boundaryManagedInputBatches,
      operationDelta,
      historyActionDelta,
    };
  } finally {
    await context.close();
  }
};

test('compares bounded and unbounded managed-input scheduling', async ({ browser }) => {
  const workloads: InputSchedulingReport['workloads'] = [];
  for (const policy of policies) {
    for (const workloadCase of cases) {
      const id = `${policy.id}-${workloadCase.characterSet}-${workloadCase.inputMode}-${workloadCase.delayMs}ms-${workloadCase.textLength}`;
      if (FILTER.size > 0 && !FILTER.has(id)) continue;
      const samples: InputSchedulingSample[] = [];
      const text = textFor(workloadCase.characterSet, workloadCase.textLength);
      for (let run = 0; run < WARMUPS + MEASURED_RUNS; run += 1) {
        process.stdout.write(`[input-scheduling] ${id} run ${run + 1}/${WARMUPS + MEASURED_RUNS}\n`);
        const sample = await measureRun(browser, policy, workloadCase, text);
        if (run >= WARMUPS) {
          samples.push(sample);
        }
      }
      workloads.push({
        id,
        label: `${policy.label} ${workloadCase.characterSet} ${workloadCase.inputMode} ${workloadCase.delayMs}ms ${workloadCase.textLength.toLocaleString()}`,
        policy: policy.id,
        ...workloadCase,
        samples,
        summary: summarizeInputSchedulingSamples(samples),
      });
    }
  }

  const report: InputSchedulingReport = {
    schemaVersion: CANVAS_INPUT_SCHEDULING_SCHEMA,
    generatedAt: new Date().toISOString(),
    ...(process.env.CANVAS_INPUT_SCHEDULING_LABEL
      ? { label: process.env.CANVAS_INPUT_SCHEDULING_LABEL }
      : {}),
    gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    gitDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
    settings: { warmups: WARMUPS, measuredRuns: MEASURED_RUNS, cadenceMs: 32, batchLimit: 512 },
    hypothesis: evaluateInputSchedulingHypothesis(workloads),
    workloads,
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(REPORT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(path.join(REPORT_DIR, 'report.md'), createInputSchedulingMarkdown(report)),
  ]);
});

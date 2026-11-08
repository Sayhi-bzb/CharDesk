import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { NativeSession } from '@opentui/core';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from '../../packages/local-runtime/src/model.ts';
import { TerminalWorkspace } from '../../packages/local-runtime/src/workspace.ts';
import { WorkspacePersistence } from '../../packages/local-runtime/src/persistence.ts';
import { attachControls } from '../../packages/terminal/src/controller.ts';
import { CANVAS_TOP, CanvasSurface } from '../../packages/terminal/src/surface.ts';
import { watchWorkspaceSources } from '../../packages/terminal/src/sourceMonitor.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
type Config = {
  cells: number;
  kind: 'ascii' | 'unicode' | 'sparse' | 'persistence';
  samples: number;
};
const tick = () => new Promise<void>((done) => setImmediate(done));
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] ?? 0;
  return { samples: values.length, median: at(0.5), p95: at(0.95), max: at(1) };
}
class Output extends Writable {
  readonly isTTY = true;
  readonly columns = 120;
  readonly rows = 40;
  bytes = 0;
  writes = 0;
  delayMs = 0;
  _write(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error) => void) {
    this.bytes += chunk.byteLength;
    this.writes++;
    if (this.delayMs) setTimeout(done, this.delayMs);
    else done();
  }
  getColorDepth() {
    return 24;
  }
}
function populate(model: TerminalCanvas, config: Config) {
  const width = 200;
  const unit = config.kind === 'unicode' ? 'a界🦀' : '0123456789';
  const unitWidth = config.kind === 'unicode' ? 5 : 10;
  const text = unit.repeat(width / unitWidth);
  const rows = Array.from({ length: config.cells / width }, (_, i) => ({
    y: config.kind === 'sparse' ? (i % 2 ? -1 : 1) * (1_000_000_000 + i * 17) : i,
    erase: [],
    spans: [{ x: config.kind === 'sparse' ? i * 100_003 : 0, text, color: '#91a7ff' }],
  }));
  model.apply({ rows });
  model.documents.clearHistory();
  model.markSaved();
  assert.equal(
    model.plane.get({ x: rows[0]!.spans[0]!.x, y: rows[0]!.y })?.char,
    config.kind === 'unicode' ? 'a' : '0'
  );
  return {
    width,
    rows: rows.length,
    occupiedGridCells: config.cells,
    glyphAnchors: config.kind === 'unicode' ? (config.cells * 3) / 5 : config.cells,
  };
}
async function renderWorker(config: Config) {
  const output = new Output();
  const session = new NativeSession(output);
  const clock = new ManualClock();
  const setup = await createTestRenderer({
    width: 120,
    height: 40,
    screenMode: 'alternate-screen',
    stdout: output as unknown as NodeJS.WriteStream,
    nativeSession: session,
    bufferedOutput: 'stdout',
    kittyKeyboard: true,
    clock,
    nativeSceneVerify: false,
  });
  const model = new TerminalCanvas();
  const before = process.memoryUsage();
  const start = performance.now();
  const dataset = populate(model, config);
  const loadMs = performance.now() - start;
  const surface = new CanvasSurface(setup.renderer, model, 'stress.chardesk', 'darwin');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, {
    read: async () => ({}),
    write: async () => ({ status: 'written' }),
  });
  const phases: Record<
    string,
    { ms: ReturnType<typeof summary>; ansiBytes: ReturnType<typeof summary> }
  > = {};
  const memoryLifecycle = {
    beforeDialogsGC: before,
    afterDialogsGC: before,
    afterDisposeGC: before,
  };
  let sampledPeakRss = process.memoryUsage().rss;
  const measure = async (name: string, count: number, run: (i: number) => void | Promise<void>) => {
    const times: number[] = [],
      bytes: number[] = [];
    for (let i = 0; i < count; i++) {
      const beginBytes = output.bytes,
        begin = performance.now();
      await run(i);
      await setup.renderOnce();
      // Includes native ANSI generation and drain to a nonblocking counting sink, not terminal display.
      clock.advance(0);
      await session.idle();
      times.push(performance.now() - begin);
      bytes.push(output.bytes - beginBytes);
      sampledPeakRss = Math.max(sampledPeakRss, process.memoryUsage().rss);
    }
    process.stderr.write(`${name} complete (${output.bytes} bytes)\n`);
    phases[name] = { ms: summary(times), ansiBytes: summary(bytes) };
  };
  const camera = (i: number) => {
    model.pan(
      ((i * 7) % 70) - model.viewport.x,
      ((i * 3) % Math.max(1, Math.min(dataset.rows - 38, 70))) - model.viewport.y
    );
    surface.requestRender();
  };
  try {
    await measure('firstFrame', 1, () => {
      model.viewport = { ...model.viewport, x: 0, y: 0 };
    });
    for (let i = 0; i < 5; i++) {
      camera(i);
      await setup.renderOnce();
    }
    clock.advance(0);
    await session.idle();
    await measure('pan', config.samples, camera);
    await measure('minimapCold', 1, () => {
      surface.minimapOpen = true;
      surface.requestRender();
    });
    await measure('panWithMinimap', config.samples, camera);
    await measure('editWithMinimap', 20, (i) => {
      model.apply({
        rows: [{ y: 0, erase: [], spans: [{ x: 0, text: i % 2 ? 'X' : 'Y', color: '#91a7ff' }] }],
      });
    });
    surface.minimapOpen = false;
    await setup.mockMouse.pressDown(40, CANVAS_TOP + 20);
    await measure('handDrag', config.samples, async (i) => {
      await setup.mockMouse.emitMouseEvent('drag', 40 + (i % 20), CANVAS_TOP + 20 + (i % 3));
    });
    await setup.mockMouse.release(50, CANVAS_TOP + 20);
    surface.setTool('edit');
    model.viewport = { ...model.viewport, x: 0, y: 0 };
    await setup.renderOnce();
    await setup.mockMouse.pressDown(2, CANVAS_TOP + 2);
    await measure('selectionDrag', config.samples, async (i) => {
      await setup.mockMouse.emitMouseEvent('drag', 20 + (i % 60), CANVAS_TOP + 12);
    });
    await setup.mockMouse.release(50, CANVAS_TOP + 12);
    assert.ok(model.selectionBounds);
    const deleteRows = Math.min(dataset.rows, 250);
    await measure('deleteUpTo50kCells', 1, () => {
      model.selection = { anchor: { x: 0, y: 0 }, focus: { x: 199, y: deleteRows - 1 } };
      setup.mockInput.pressBackspace();
      assert.equal(model.plane.get({ x: 0, y: 0 }), undefined);
      assert.equal(model.plane.get({ x: 198, y: deleteRows - 1 }), undefined);
    });
    await measure('undoDelete', 1, () => {
      model.undo();
      assert.equal(model.plane.get({ x: 0, y: 0 })?.char, 'X');
      if (config.kind !== 'sparse')
        assert.equal(
          model.plane.get({ x: 198, y: deleteRows - 1 })?.char,
          config.kind === 'unicode' ? '🦀' : '8'
        );
    });
    model.selection = null;
    model.commands.pointAt({ x: 0, y: dataset.rows + 5 });
    const pasteText = Array.from({ length: 50 }, () => 'plain text'.repeat(20)).join('\n');
    await measure('paste10kCells', 1, async () => {
      await setup.mockInput.pasteBracketedText(pasteText);
      // Paste completion runs on the shared command queue.
      for (let i = 0; i < 100 && model.plane.get({ x: 0, y: dataset.rows + 5 })?.char !== 'p'; i++)
        await tick();
      assert.equal(model.plane.get({ x: 0, y: dataset.rows + 5 })?.char, 'p');
    });
    Bun.gc(true);
    memoryLifecycle.beforeDialogsGC = process.memoryUsage();
    await measure('settingsOpenClose', 100, (i) => {
      if (i % 2 === 0) surface.activateDock('settings');
      else {
        setup.mockInput.pressEscape();
        clock.advance(40);
      }
    });
    if (surface.panel) {
      setup.mockInput.pressEscape();
      clock.advance(40);
    }
    Bun.gc(true);
    memoryLifecycle.afterDialogsGC = process.memoryUsage();
    surface.setTool('hand');
    output.delayMs = 5;
    await measure('panSlowSink5ms', 10, camera);
    output.delayMs = 0;
    assert.ok(output.bytes > 0, 'must measure native ANSI output');
    const memoryAfterWork = process.memoryUsage();
    const native = setup.getNativeStats();
    return {
      config,
      dataset,
      loadMs,
      phases,
      before,
      memoryAfterWork,
      memoryLifecycle,
      sampledPeakRss,
      native,
      totalAnsiBytes: output.bytes,
    };
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
    Bun.gc(true);
    memoryLifecycle.afterDisposeGC = process.memoryUsage();
  }
}
async function persistenceWorker(config: Config) {
  const directory = await mkdtemp(
    join(process.env.CHARDESK_PERF_ROOT ?? tmpdir(), 'chardesk-terminal-perf-')
  );
  const path = join(directory, 'canvas.chardesk');
  const checkpoint = join(directory, 'workspace.json');
  const workspace = await TerminalWorkspace.open(path);
  const persistence = await WorkspacePersistence.open(checkpoint);
  const output = new Output();
  const session = new NativeSession(output);
  const setup = await createTestRenderer({
    width: 120,
    height: 40,
    screenMode: 'alternate-screen',
    stdout: output as unknown as NodeJS.WriteStream,
    nativeSession: session,
    bufferedOutput: 'stdout',
    nativeSceneVerify: false,
  });
  const surface = new CanvasSurface(setup.renderer, workspace.model, path, 'darwin');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, undefined, workspace);
  let unwatch = () => {};
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  try {
    populate(workspace.model, { ...config, kind: 'ascii' });
    await workspace.saveAll();
    workspace.model.viewport = { ...workspace.model.viewport, x: 0, y: 0 };
    await setup.renderOnce();
    await session.idle();
    unwatch = watchWorkspaceSources(workspace, setup.renderer, () => surface.requestRender());
    const events: { phase: string; scope: string }[] = [];
    // Shortened timers intentionally overlap checkpoint/save with edits.
    persistence.start(workspace, {
      autosaveMs: 80,
      checkpointMs: 40,
      onStatus: (status) => {
        events.push(status);
        assert.notEqual(status.phase, 'error');
      },
    });
    const eventLoopDelay: number[] = [],
      edits: number[] = [],
      frames: number[] = [];
    let previous = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      eventLoopDelay.push(Math.max(0, now - previous - 10));
      previous = now;
    }, 10);
    const started = performance.now();
    for (let i = 0; i < 20; i++) {
      const begin = performance.now();
      workspace.model.apply({
        rows: [{ y: 0, erase: [], spans: [{ x: i, text: 'Z', color: '#91a7ff' }] }],
      });
      edits.push(performance.now() - begin);
      await setup.renderOnce();
      await session.idle();
      frames.push(performance.now() - begin);
      await Bun.sleep(i % 5 === 4 ? 100 : 20);
    }
    await Bun.sleep(120);
    await persistence.close();
    closed = true;
    const workElapsedMs = performance.now() - started;
    clearInterval(timer);
    timer = undefined;
    assert.equal(workspace.dirty, false);
    await setup.renderOnce();
    await session.idle();
    const idleStart = performance.now(),
      idleCpuStart = process.cpuUsage(),
      idleBytes = output.bytes;
    await Bun.sleep(2200); // Includes at least one real source-monitor poll.
    const idle = {
      elapsedMs: performance.now() - idleStart,
      cpuMicros: process.cpuUsage(idleCpuStart),
      ansiBytes: output.bytes - idleBytes,
    };
    unwatch();
    const restored = await TerminalWorkspace.open(path);
    try {
      for (let i = 0; i < 20; i++)
        assert.equal(restored.model.plane.get({ x: i, y: 0 })?.char, 'Z');
    } finally {
      restored.dispose();
    }
    const recovery = await WorkspacePersistence.open(checkpoint);
    const recovered = await recovery.restore({});
    try {
      assert.ok(recovered);
      for (let i = 0; i < 20; i++)
        assert.equal(recovered.model.plane.get({ x: i, y: 0 })?.char, 'Z');
    } finally {
      recovered?.dispose();
      await recovery.abandon();
    }
    return {
      config,
      workElapsedMs,
      editMs: summary(edits),
      editToOutputMs: summary(frames),
      idle,
      eventLoopDelayMs: summary(eventLoopDelay),
      events,
      fileBytes: (await stat(path)).size,
      checkpointBytes: (await stat(checkpoint)).size,
      memoryAfterWork: process.memoryUsage(),
      roundtrip: 'document and recovery verified',
    };
  } finally {
    if (timer) clearInterval(timer);
    unwatch();
    detach();
    await setup.dispose();
    if (!closed) await persistence.abandon();
    workspace.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}
type Result =
  Awaited<ReturnType<typeof renderWorker>> | Awaited<ReturnType<typeof persistenceWorker>>;
function markdown(results: Result[], completed: boolean) {
  const lines = [
    '# TUI performance baseline',
    '',
    `Status: ${completed ? 'complete' : 'partial'}. See latest.json for environment, exact samples and counters.`,
    '',
    '120×40 native retained renderer, verification repaint disabled, serial isolated Bun workers. ANSI output is drained to a counting Writable; terminal emulator display latency is excluded. Rendering uses ManualClock; persistence/idle use real timers.',
    '',
    'Each size is occupied grid columns: Unicode contains 60% as many glyph anchors. Dense rows are 200 columns wide. Sparse rows are around ±1 billion; sparse pan stays at the origin, away from these rows. Memory is sampled process RSS, including the runtime, history and caches; it is not a leak measurement.',
    '',
    'Timing values are milliseconds. Repeated phases show p95 (pan/drag: 30; minimap edits: 20; dialog transitions: 100). Cold/open/delete/undo/paste each have one sample, so their values are individual observations.',
    '',
    '| Workload | Pan p95 | Minimap pan p95 | Minimap cold | Minimap edit p95 | Hand drag p95 | Range drag p95 | Delete ≤50k | Undo | Paste 10k | Sampled RSS MiB |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const result of results) {
    if (!('phases' in result)) continue;
    const names = [
      'pan',
      'panWithMinimap',
      'minimapCold',
      'editWithMinimap',
      'handDrag',
      'selectionDrag',
      'deleteUpTo50kCells',
      'undoDelete',
      'paste10kCells',
    ];
    lines.push(
      `| ${result.config.kind} ${result.config.cells.toLocaleString('en-US')} | ${names.map((name) => result.phases[name]!.ms.p95.toFixed(1)).join(' | ')} | ${(result.sampledPeakRss / 1048576).toFixed(0)} |`
    );
  }
  lines.push(
    '',
    'Persistence stress uses 80ms autosave / 40ms checkpoint, with 20 edits and a 100ms pause every fifth edit. It verifies both saved document and recovery content. Event-loop delays use a 10ms interval. The 2.2s idle observation includes a source-monitor poll and may include GC from preceding work; it is not a steady-state CPU or leak test.',
    '',
    '| Cells | Edit→output p95 ms | Event-loop delay p95 ms | Maximum delay ms | Idle CPU % of one core | Idle ANSI bytes | Roundtrip |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |'
  );
  for (const result of results) {
    if ('phases' in result) continue;
    const idleCpu =
      (result.idle.cpuMicros.user + result.idle.cpuMicros.system) / (result.idle.elapsedMs * 10);
    lines.push(
      `| ${result.config.cells.toLocaleString('en-US')} | ${result.editToOutputMs.p95.toFixed(1)} | ${result.eventLoopDelayMs.p95.toFixed(1)} | ${result.eventLoopDelayMs.max.toFixed(1)} | ${idleCpu.toFixed(1)} | ${result.idle.ansiBytes} | verified |`
    );
  }
  return lines.join('\n') + '\n';
}
const workerIndex = process.argv.indexOf('--worker');
if (workerIndex !== -1) {
  const config = JSON.parse(process.argv[workerIndex + 1]!) as Config;
  const result =
    config.kind === 'persistence' ? await persistenceWorker(config) : await renderWorker(config);
  // Native stats contain bigint counters.
  process.stdout.write(
    JSON.stringify(result, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
  );
} else {
  const sizesArg = process.argv.find((arg) => arg.startsWith('--sizes='));
  const sizes = (sizesArg?.slice(8) ?? '10000,100000,1000000').split(',').map(Number);
  assert.ok(
    sizes.every((n) => Number.isSafeInteger(n) && n >= 10000 && n <= 1000000 && n % 200 === 0),
    'sizes must be multiples of 200, between 10,000 and 1,000,000 cells'
  );
  const configs: Config[] = sizes.flatMap((cells) =>
    (['ascii', 'unicode'] as const).map((kind) => ({ cells, kind, samples: 30 }))
  );
  configs.push({ cells: 10000, kind: 'sparse', samples: 30 });
  configs.push(
    ...sizes
      .filter((cells) => cells >= 100000)
      .map((cells) => ({ cells, kind: 'persistence' as const, samples: 20 }))
  );
  const results: Result[] = [];
  const environment = {
    timestamp: new Date().toISOString(),
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(
      execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
    ),
  };
  const directory = resolve(root, 'test-results/terminal-performance');
  await mkdir(directory, { recursive: true });
  for (const config of configs) {
    console.log(`Testing ${config.kind} ${config.cells.toLocaleString()} cells…`);
    const workerRoot = await mkdtemp(join(tmpdir(), 'chardesk-terminal-worker-'));
    const child = Bun.spawn(
      [
        process.execPath,
        '--tsconfig-override',
        join(root, 'examples/terminal-canvas/tsconfig.json'),
        fileURLToPath(import.meta.url),
        '--worker',
        JSON.stringify(config),
      ],
      {
        cwd: root,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          CHARDESK_HOME: join(workerRoot, 'home'),
          CHARDESK_PERF_ROOT: workerRoot,
        },
      }
    );
    const timeout = setTimeout(() => child.kill('SIGKILL'), 180_000);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]).finally(async () => {
      clearTimeout(timeout);
      await rm(workerRoot, { recursive: true, force: true });
    });
    assert.equal(exitCode, 0, `${config.kind}/${config.cells} failed: ${stderr}\n${stdout}`);
    results.push(JSON.parse(stdout));
    await writeFile(
      join(directory, 'latest.json'),
      JSON.stringify(
        {
          schema: 1,
          completed: results.length === configs.length,
          environment,
          method: {
            viewport: '120x40',
            samples: 30,
            nativeSceneVerify: false,
            isolatedWorkers: true,
            output:
              'native ANSI drained to nonblocking Writable; excludes terminal emulator display',
            persistence:
              'real timers, 80ms autosave / 40ms checkpoint, 20 edits; 20ms pauses, 100ms every fifth edit',
          },
          results,
        },
        null,
        2
      )
    );
    await writeFile(
      join(directory, 'latest.md'),
      markdown(results, results.length === configs.length)
    );
    console.log(`  Completed; partial results saved.`);
  }
  console.log(`Report: ${join(directory, 'latest.json')}`);
}

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { CanvasFile } from './document.ts';
import { TerminalCanvas } from './model.ts';
import { TerminalWorkspace } from './workspace.ts';
import { LocalSessions } from './sessions.ts';
import { resolveAppPaths } from './appPaths.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';

// Shared by the standalone diagnostic command and the default regression gate.
export const architectureProbes: Array<{ id: string; run: () => void | Promise<void> }> = [];
function probe(id: string, run: () => void | Promise<void>) {
  architectureProbes.push({ id, run });
}

const patch = (text: string) => ({
  rows: [{ y: 0, erase: [], spans: [{ x: 0, text, color: '#000000' }] }],
});

probe('content-history-independence', () => {
  const model = new TerminalCanvas('A');
  try {
    assert.equal(model.dirty, false);
    const content = model.documents.getContentVersion();
    model.documents.applyCellPlanePatch(patch('B'), 'none');
    assert.notEqual(model.documents.getContentVersion(), content);
    assert.equal(model.plane.get({ x: 0, y: 0 })?.char, 'B');
    assert.equal(model.dirty, true, 'Content changed without undo history, but dirty remained false.');
  } finally {
    model.dispose();
  }
});

probe('save-acknowledges-only-captured-content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-architecture-save-'));
  const { file, model } = await CanvasFile.open(join(root, 'canvas.chardesk'), 'A');
  try {
    await file.save(model);
    model.commands.insert('X');
    file.afterCapture = () => model.documents.applyCellPlanePatch(patch('B'), 'none');
    await file.save(model);
    const reopened = await CanvasFile.open(file.path);
    try {
      assert.equal(reopened.model.plane.get({ x: 0, y: 0 })?.char, 'X');
      assert.equal(model.plane.get({ x: 0, y: 0 })?.char, 'B');
      assert.equal(model.dirty, true, 'Disk has captured X; live content is B, but save acknowledged it as clean.');
    } finally {
      reopened.model.dispose();
    }
  } finally {
    model.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

async function until(check: () => boolean) {
  const deadline = performance.now() + 3000;
  while (!check()) {
    if (performance.now() > deadline) throw new Error('Audit setup timed out.');
    await Bun.sleep(1);
  }
}

probe('dismissed-close-cannot-commit-later', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-architecture-close-'));
  const sessions = await LocalSessions.open(resolveAppPaths({ environment: { CHARDESK_HOME: root } }));
  const workspace = TerminalWorkspace.empty();
  await sessions.attach(workspace);
  const file = await sessions.create('Audit close');
  workspace.model.commands.insert('UNSAVED');
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 90, height: 26, kittyKeyboard: true, clock });
  const surface = new CanvasSurface(setup.renderer, workspace.model, 'audit', 'darwin', true, resolveTerminalPolicy({}));
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, undefined, workspace, sessions);
  let release!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  let saving = false;
  const save = workspace.saveFile.bind(workspace);
  workspace.saveFile = (...args) => {
    saving = true;
    return gate.then(() => save(...args));
  };
  let completion: Promise<void> | undefined;
  const close = sessions.close.bind(sessions);
  sessions.close = (...args) => (completion = close(...args));
  try {
    await setup.renderOnce();
    setup.mockInput.pressKey('w', { super: true });
    await until(() => saving);
    assert.equal(surface.panel?.title, 'Closing canvas');
    setup.mockInput.pressEscape();
    clock.advance(40);
    assert.equal(surface.panel, null);
    release();
    await completion?.catch((error) => assert.equal(error.code, 'operation_cancelled'));
    assert.ok(workspace.files.includes(file), 'Escape dismissed Close, but its pending save still closed the canvas.');
  } finally {
    release();
    await completion?.catch(() => {});
    detach();
    await setup.dispose();
    await sessions.dispose();
    workspace.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

probe('closing-freezes-all-input-channels', async () => {
  const setup = await createTestRenderer({ width: 90, height: 26, kittyKeyboard: true, clock: new ManualClock() });
  const model = new TerminalCanvas('A');
  const surface = new CanvasSurface(setup.renderer, model, 'audit', 'darwin', true, resolveTerminalPolicy({}));
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  try {
    await setup.renderOnce();
    surface.activateDock('settings');
    surface.panel!.onTab!(3); // Shortcuts search input.
    const panel = surface.panel!;
    assert.equal(typeof panel.input, 'string');
    const input = panel.input;
    surface.closing = true;
    await setup.mockInput.typeText('KEY', 0);
    assert.equal(panel.input, input, 'Closing did not block keyboard input.');
    await setup.mockInput.pasteBracketedText('PASTE');
    assert.equal(panel.input, input, 'Closing blocks keys, but paste still changes the active modal input.');
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});


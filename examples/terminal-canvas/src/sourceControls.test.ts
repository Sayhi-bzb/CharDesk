import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import { TerminalCanvas } from './model.ts';
import { TerminalWorkspace } from './workspace.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';

test('native source monitoring is advisory; Source reload retains the view and disposal cancels monitoring', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-source-ui-'));
  const workspace = await TerminalWorkspace.open(join(root, 'canvas.chardesk'), 'Before');
  const external = new TerminalCanvas('🦀external');
  const clock = new ManualClock(),
    setup = await createTestRenderer({ width: 110, height: 30, kittyKeyboard: true, clock });
  const surface = new CanvasSurface(setup.renderer, workspace.model, 'Source', 'darwin');
  setup.renderer.root.add(surface);
  await workspace.saveFile();
  const detach = attachControls(surface, () => {}, undefined, workspace);
  let detached = false;
  const wait = async (done: () => boolean) => {
    for (let i = 0; i < 100 && !done(); i++) await Bun.sleep(5);
    expect(done()).toBe(true);
  };
  try {
    surface.setTool('edit');
    workspace.model.commands.selectAll();
    workspace.model.pan(10, -20);
    const view = workspace.model.viewAt(workspace.model.documents.getActiveAddress());
    await setup.renderOnce();
    await writeFile(
      workspace.active.path,
      serializeCanvasDocument(external.documents.getDocumentDraft()!)
    );
    clock.advance(2000);
    await wait(() => surface.sourceStatus.includes('changed on disk'));
    expect(workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('B');
    setup.mockInput.pressKey('F12', { shift: true });
    expect(surface.panel?.title).toBe('Source');
    await setup.mockInput.typeText('ignored', 0);
    expect(workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('B');
    surface.panel!.selected = 1;
    setup.mockInput.pressEnter();
    await wait(() => workspace.model.plane.get({ x: 0, y: 0 })?.char === '🦀');
    expect(workspace.model.viewAt(workspace.model.documents.getActiveAddress())).toEqual(view);
    expect(surface.sourceStatus).toBe('');
    expect(workspace.model.canUndo).toBe(false);
    setup.mockInput.pressEscape();
    clock.advance(40);
    await rm(workspace.active.path);
    clock.advance(2000);
    await wait(() => surface.sourceStatus.includes('missing'));
    expect(workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('🦀');
    const notice = surface.sourceStatus;
    detach();
    detached = true;
    await writeFile(workspace.active.path, workspace.active.baselineSource!);
    clock.advance(6000);
    setup.renderer.emit('focus');
    await Bun.sleep(10);
    expect(surface.sourceStatus).toBe(notice);
  } finally {
    if (!detached) detach();
    await setup.dispose();
    workspace.dispose();
    external.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

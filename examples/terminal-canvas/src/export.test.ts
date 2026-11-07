import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { parseCanvasDocument } from '@chardesk/editor-core/documentText';
import { TerminalWorkspace } from './workspace.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { deliverExportFile } from './exportFile.ts';

const settle = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i++) await Bun.sleep(5);
  expect(done()).toBe(true);
};

test('native export dialog delivers all formats without changing document identity, selection, history or dirty baseline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-export-'));
  const workspace = await TerminalWorkspace.open(join(root, 'original.chardesk'), '🦀界');
  const { model } = workspace;
  const setup = await createTestRenderer({
    width: 110,
    height: 30,
    kittyKeyboard: true,
    clock: new ManualClock(),
  });
  const surface = new CanvasSurface(setup.renderer, model, 'Export', 'darwin');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, undefined, workspace);
  await setup.renderOnce();
  try {
    surface.appearance.acceptPalette(
      { defaultForeground: '#ffffff', defaultBackground: '#000000', palette: [] } as never,
      'dark'
    );
    surface.setTool('edit');
    model.selection = { anchor: { x: 1, y: 0 }, focus: { x: 1, y: 0 } };
    const address = model.documents.getActiveAddress(),
      path = workspace.active.path;
    const view = { ...model.viewport },
      interaction = structuredClone(model.getSnapshot().interaction),
      version = model.version,
      dirty = model.dirty,
      baseline = workspace.active.baselineDigest;
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const target = join(root, `export-${index}`);
      setup.mockInput.pressKey('F7', { shift: true });
      expect(surface.panel?.title).toBe('Export');
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toContain('Canvas');
      surface.panel!.selected = index;
      setup.mockInput.pressEnter();
      expect(surface.panel?.title).toContain('Export');
      surface.panel!.input = target;
      setup.mockInput.pressEnter();
      await settle(() => surface.panel === null || Boolean(surface.panel?.error));
      expect(surface.panel?.error).toBeUndefined();
      const bytes = await readFile(target);
      if (index % 4 === 3) {
        expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        const image = await loadImage(bytes);
        expect(image.width).toBeGreaterThan(0);
      } else if (index % 4 === 2) {
        const page = parseCanvasDocument(bytes.toString()).document.pages[0]!;
        expect(new Map(page.grid).get('0,0')?.char).toBe('🦀');
        expect(new Map(page.grid).get('2,0')?.char).toBe(index < 4 ? '界' : undefined);
      } else expect(bytes.toString()).toContain(index < 4 ? '🦀界' : '🦀');
      expect(model.version).toBe(version);
      expect(model.dirty).toBe(dirty);
      expect(workspace.active.baselineDigest).toBe(baseline);
      expect(model.documents.getActiveAddress()).toEqual(address);
      expect(model.getSnapshot().interaction).toEqual(interaction);
      expect(model.viewport).toEqual(view);
      expect(workspace.active.path).toBe(path);
      expect(model.canUndo).toBe(false);
    }
    // A failed publication remains editable; reopening never silently replaces existing data.
    setup.mockInput.pressKey('F7', { shift: true });
    setup.mockInput.pressEnter();
    surface.panel!.input = join(root, 'export-0');
    setup.mockInput.pressEnter();
    await settle(() => Boolean(surface.panel?.error));
    expect(surface.panel?.error).toContain('already exists');
    expect(surface.panel?.busy).toBe(false);
  } finally {
    detach();
    await setup.dispose();
    workspace.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('file export atomically refuses races and symlinks, cleans staging files and preserves binary data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-export-file-'));
  try {
    const target = join(root, 'new');
    const results = await Promise.allSettled([
      deliverExportFile(target, new Uint8Array([0, 255, 128])),
      deliverExportFile(target, 'other'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await symlink(target, join(root, 'link'));
    await expect(deliverExportFile(join(root, 'link'), 'replace')).rejects.toThrow(
      'already exists'
    );
    expect((await readFile(target)).toString()).not.toBe('replace');
    expect((await readdir(root)).sort()).toEqual(['link', 'new']);
    let current = true;
    const pending = deliverExportFile(join(root, 'cancelled'), 'snapshot', () => current);
    current = false;
    await expect(pending).rejects.toThrow('Export cancelled');
    expect((await readdir(root)).sort()).toEqual(['link', 'new']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

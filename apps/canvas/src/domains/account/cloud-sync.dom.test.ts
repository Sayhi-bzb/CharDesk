import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ me: vi.fn(), list: vi.fn(), updateBackup: vi.fn(),
  createBackup: vi.fn(), readBackup: vi.fn() }));
vi.mock('./cloud-workspace-api', () => ({
  cloudWorkspaceConfigured: true,
  cloudWorkspaceApi: api,
  CloudWorkspaceRequestError: class extends Error {
    readonly status: number;
    constructor(status: number) { super(String(status)); this.status = status; }
  },
}));
vi.mock('@/domains/export/public', () => ({
  prepareTextExport: (context: { surface: { content: string } }) =>
    ({ ok: true, value: { content: context.surface.content } }),
}));
vi.mock('@/domains/document/public', () => ({
  parseDocumentSessionSource: async (raw: string) => ({ mode: 'freeform', grid: [], content: raw }),
}));

import { bindCloudSession, getCloudSyncState, startCloudSync, unbindCloudWork } from './cloud-sync';
import { CloudWorkspaceRequestError } from './cloud-workspace-api';

describe('cloud background sync', () => {
  let content: string;
  let stop: (() => void) | null;
  const descriptor = { id: 'session-1', name: 'Draft', mode: 'freeform' as const };
  const canvas = {
    ready: Promise.resolve(),
    getState: () => ({ canvasSessions: [descriptor] }),
    materializeSession: async () => ({ id: descriptor.id, name: descriptor.name,
      mode: descriptor.mode, surface: { content }, slideDeck: null }),
    subscribe: () => () => undefined,
    documents: { subscribeMutations: () => () => undefined },
    commands: { sessions: {
      replaceSnapshot: vi.fn((_id: string, parsed: { content: string }) => { content = parsed.content; }),
      rename: vi.fn(),
    } },
  } as unknown as Parameters<typeof startCloudSync>[0];

  beforeEach(async () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    localStorage.clear();
    content = 'initial';
    stop = null;
    api.me.mockResolvedValue({ user: { id: 'github:17' } });
    api.list.mockResolvedValue({ works: [{ id: 'work-1', title: 'Draft', revision: 1 }] });
    await bindCloudSession('github:17', 'session-1', 'work-1', 1, 'Draft', content);
  });
  afterEach(() => { stop?.(); vi.clearAllMocks(); localStorage.clear(); });

  it('updates the bound work once when local content changes', async () => {
    api.updateBackup.mockResolvedValue({ work: { id: 'work-1', revision: 2 } });
    stop = startCloudSync(canvas);
    await waitFor(() => expect(api.me).toHaveBeenCalled());
    content = 'changed';
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(api.updateBackup).toHaveBeenCalledWith('work-1', 1, 'Draft', 'changed'));
    await waitFor(() => expect(getCloudSyncState('github:17', 'session-1')).toBe('synced'));
    expect(api.createBackup).not.toHaveBeenCalled();
  });

  it('forks a conflict copy without overwriting the stale remote version', async () => {
    api.updateBackup.mockRejectedValue(new CloudWorkspaceRequestError(409));
    api.readBackup.mockResolvedValue({ title: 'Draft', content: 'remote edit', revision: 2 });
    api.createBackup.mockResolvedValue({ work: { id: 'conflict-1', revision: 1 } });
    stop = startCloudSync(canvas);
    await waitFor(() => expect(api.me).toHaveBeenCalled());
    content = 'other edit';
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(api.createBackup).toHaveBeenCalledWith('canvas', 'Draft (conflict copy)',
      'other edit', 'work-1'));
    await waitFor(() => expect(getCloudSyncState('github:17', 'session-1')).toBe('conflict-copy'));
    expect(api.updateBackup).toHaveBeenCalledWith('work-1', 1, 'Draft', 'other edit');
  });

  it('adopts an identical remote update without creating a duplicate', async () => {
    api.updateBackup.mockRejectedValue(new CloudWorkspaceRequestError(409));
    api.readBackup.mockResolvedValue({ title: 'Draft', content: 'same edit', revision: 2 });
    stop = startCloudSync(canvas);
    await waitFor(() => expect(api.me).toHaveBeenCalled());
    content = 'same edit';
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(api.readBackup).toHaveBeenCalledWith('work-1'));
    await waitFor(() => expect(getCloudSyncState('github:17', 'session-1')).toBe('synced'));
    expect(api.createBackup).not.toHaveBeenCalled();
  });

  it('stops syncing a deleted cloud work without removing its local session', () => {
    expect(getCloudSyncState('github:17', 'session-1')).toBe('synced');
    unbindCloudWork('github:17', 'work-1');
    expect(getCloudSyncState('github:17', 'session-1')).toBeNull();
  });

  it('pulls a newer remote revision into an unchanged local session', async () => {
    api.list.mockResolvedValue({ works: [{ id: 'work-1', title: 'Draft', revision: 2 }] });
    api.readBackup.mockResolvedValue({ title: 'Draft', content: 'remote edit', revision: 2 });
    stop = startCloudSync(canvas);
    await waitFor(() => expect(canvas.commands.sessions.replaceSnapshot).toHaveBeenCalled());
    expect(content).toBe('remote edit');
    expect(api.updateBackup).not.toHaveBeenCalled();
    expect(api.createBackup).not.toHaveBeenCalled();
  });

  it('forks when both devices changed before the next pull', async () => {
    api.list.mockResolvedValue({ works: [{ id: 'work-1', title: 'Draft', revision: 2 }] });
    api.readBackup.mockResolvedValue({ title: 'Draft', content: 'remote edit', revision: 2 });
    api.createBackup.mockResolvedValue({ work: { id: 'conflict-1', revision: 1 } });
    content = 'local edit';
    stop = startCloudSync(canvas);
    await waitFor(() => expect(api.createBackup).toHaveBeenCalledWith('canvas', 'Draft (conflict copy)',
      'local edit', 'work-1'));
    expect(canvas.commands.sessions.replaceSnapshot).not.toHaveBeenCalled();
    expect(content).toBe('local edit');
  });

  it('does not apply a remote snapshot when local content changes during download', async () => {
    api.list.mockResolvedValue({ works: [{ id: 'work-1', title: 'Draft', revision: 2 }] });
    api.readBackup.mockImplementation(async () => {
      content = 'edit during download';
      return { title: 'Draft', content: 'remote edit', revision: 2 };
    });
    stop = startCloudSync(canvas);
    await waitFor(() => expect(getCloudSyncState('github:17', 'session-1')).toBe('checking'));
    expect(canvas.commands.sessions.replaceSnapshot).not.toHaveBeenCalled();
    expect(content).toBe('edit during download');
  });
});

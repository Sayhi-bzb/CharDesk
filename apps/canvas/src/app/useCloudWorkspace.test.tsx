import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudWorkspaceRequestError } from '@/domains/account/public';
import { useCloudWorkspace } from './useCloudWorkspace';

const account = vi.hoisted(() => ({
  me: vi.fn(), list: vi.fn(), createBackup: vi.fn(), rename: vi.fn(), remove: vi.fn(), logout: vi.fn(),
}));

vi.mock('@/domains/account/public', () => ({
  cloudWorkspaceConfigured: true,
  cloudWorkspaceApi: account,
  bindCloudSession: vi.fn().mockResolvedValue(undefined),
  unbindCloudWork: vi.fn(),
  subscribeCloudCatalog: () => () => undefined,
  CloudWorkspaceRequestError: class extends Error {
    readonly status: number;
    constructor(status: number) { super(`Request failed: ${status}`); this.status = status; }
  },
}));

describe('useCloudWorkspace', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('loads catalog metadata and keeps it distinct from local work', async () => {
    account.me.mockResolvedValue({ user: { id: 'github:17', login: 'maker', avatarUrl: null } });
    account.list.mockResolvedValue({ works: [{
      id: 'work-id', kind: 'canvas', title: 'Cloud sketch',
      createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
      contentStatus: 'not-uploaded',
    }] });
    const { result } = renderHook(() => useCloudWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.login).toBe('maker');
    expect(result.current.works).toEqual([expect.objectContaining({ title: 'Cloud sketch', contentStatus: 'not-uploaded' })]);
    expect(account.list).toHaveBeenCalledOnce();
  });

  it('does not erase rows on a failed delete', async () => {
    account.me.mockResolvedValue({ user: { id: 'github:17', login: 'maker', avatarUrl: null } });
    account.list.mockResolvedValue({ works: [{
      id: 'work-id', kind: 'canvas', title: 'Cloud sketch',
      createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
      contentStatus: 'not-uploaded',
    }] });
    account.remove.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCloudWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { expect(await result.current.remove(result.current.works[0])).toBe(false); });
    expect(result.current.works).toHaveLength(1);
    expect(result.current.error).toBe(true);
  });

  it('adds an uploaded backup only after the server confirms it', async () => {
    account.me.mockResolvedValue({ user: { id: 'github:17', login: 'maker', avatarUrl: null } });
    account.list.mockResolvedValue({ works: [], limits: { maxWorkBytes: 10, maxAccountBytes: 100, usedBytes: 0 } });
    account.createBackup.mockResolvedValue({ work: {
      id: 'backup-id', kind: 'canvas', title: 'Draft',
      createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
      contentStatus: 'uploaded', contentBytes: 52,
    } });
    const { result } = renderHook(() => useCloudWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { expect(await result.current.backup('canvas', 'Draft', 'snapshot')).toBe(true); });
    expect(account.createBackup).toHaveBeenCalledWith('canvas', 'Draft', 'snapshot');
    expect(result.current.works).toMatchObject([{ id: 'backup-id', contentStatus: 'uploaded' }]);
    expect(result.current.limits?.usedBytes).toBe(52);
  });

  it('keeps the catalog unchanged and reports quota rejection', async () => {
    account.me.mockResolvedValue({ user: { id: 'github:17', login: 'maker', avatarUrl: null } });
    account.list.mockResolvedValue({ works: [] });
    account.createBackup.mockRejectedValue(new CloudWorkspaceRequestError(413));
    const { result } = renderHook(() => useCloudWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { expect(await result.current.backup('canvas', 'Draft', 'snapshot')).toBe(false); });
    expect(result.current.works).toEqual([]);
    expect(result.current.limitExceeded).toBe(true);
  });
});

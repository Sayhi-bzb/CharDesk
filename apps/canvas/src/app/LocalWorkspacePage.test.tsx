import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUiLanguage } from '@/shared/i18n';
import { LocalWorkspacePage } from './LocalWorkspacePage';

const fixtures = vi.hoisted(() => ({
  materializeSession: vi.fn(),
  importSession: vi.fn(),
  backup: vi.fn(),
  readBackup: vi.fn(),
  switchSession: vi.fn(),
  conflictWith: null as string | null,
  configured: true,
  user: { id: 'github:17', login: 'maker', avatarUrl: null } as
    { id: string; login: string; avatarUrl: null } | null,
  loading: false,
  error: false,
  signOut: vi.fn(),
}));

vi.mock('@/domains/canvas/public', () => ({
  useCanvasRuntime: () => ({
    materializeSession: fixtures.materializeSession,
    getState: () => ({ activeCanvasId: 'local', canvasSessions: [{ id: 'local', name: 'Draft', mode: 'freeform' }] }),
    commands: { sessions: { import: fixtures.importSession, switch: fixtures.switchSession } },
  }),
  useCanvasState: (select: (state: unknown) => unknown) =>
    select({ canvasSessions: [{ id: 'local', name: 'Draft', mode: 'freeform' }] }),
}));

vi.mock('@/domains/blackboard/public', () => ({
  useBlackboardRuntime: () => ({ repository: {
    listWorkspaces: () => Promise.resolve([]), subscribe: () => () => undefined,
  } }),
}));

vi.mock('@/domains/account/public', () => ({
  cloudSignInUrl: 'https://example.test/login',
  cloudWorkspaceApi: { readBackup: fixtures.readBackup },
  bindCloudSession: vi.fn().mockResolvedValue(undefined),
  getBoundCloudWorkId: () => null,
  getCloudConflict: () => fixtures.conflictWith,
  getCloudSyncState: () => null,
  resolveCloudConflict: vi.fn(),
  subscribeCloudSync: () => () => undefined,
}));

vi.mock('@/domains/export/public', () => ({
  prepareTextExport: () => ({ ok: true, value: { content: 'exported snapshot' } }),
}));

vi.mock('./useCloudWorkspace', () => ({
  useCloudWorkspace: () => ({
    configured: fixtures.configured, user: fixtures.user,
    works: [
      { id: 'cloud-id', title: 'Cloud draft', kind: 'canvas', contentStatus: 'uploaded', contentBytes: 17 },
      ...(fixtures.conflictWith ? [{ id: 'parent-id', title: 'Original draft', kind: 'canvas',
        contentStatus: 'uploaded', contentBytes: 17 }] : []),
    ],
    loading: fixtures.loading, error: fixtures.error, limitExceeded: false, busy: false,
    limits: { maxWorkBytes: 10 * 1024 * 1024, maxAccountBytes: 100 * 1024 * 1024, usedBytes: 0 },
    backup: fixtures.backup,
    signOut: fixtures.signOut,
  }),
}));

describe('LocalWorkspacePage backups', () => {
  beforeEach(() => {
    setUiLanguage('en');
    window.history.replaceState(null, '', '/workspace');
    fixtures.materializeSession.mockResolvedValue({
      id: 'local', name: 'Draft', mode: 'freeform', surface: {}, slideDeck: null,
    });
    fixtures.backup.mockResolvedValue(true);
    fixtures.readBackup.mockResolvedValue({ title: 'Cloud draft', content: 'saved snapshot', revision: 1 });
    fixtures.importSession.mockResolvedValue({ id: 'restored' });
    fixtures.switchSession.mockResolvedValue(true);
    fixtures.conflictWith = null;
    fixtures.configured = true;
    fixtures.user = { id: 'github:17', login: 'maker', avatarUrl: null };
    fixtures.loading = false;
    fixtures.error = false;
    fixtures.signOut.mockResolvedValue(true);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('backs up a local work and restores a separate local copy', async () => {
    render(<LocalWorkspacePage />);
    const local = screen.getByRole('row', { name: /Draft Canvas/ });
    fireEvent.pointerDown(within(local).getByRole('button', { name: 'Actions for Draft' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Back up to cloud' }));
    await waitFor(() => expect(fixtures.backup).toHaveBeenCalledWith('canvas', 'Draft', 'exported snapshot', 'local'));

    const cloud = screen.getByRole('row', { name: /Cloud draft Canvas Backed up/ });
    fireEvent.pointerDown(within(cloud).getByRole('button', { name: 'Actions for Cloud draft' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open on this device' }));
    await waitFor(() => expect(fixtures.importSession).toHaveBeenCalledWith('saved snapshot', {
      name: 'Cloud draft', sourceName: 'Cloud draft.chardesk',
    }));
    expect(fixtures.readBackup).toHaveBeenCalledWith('cloud-id');
  });

  it('shows both preserved copies before continuing the local conflict copy', async () => {
    fixtures.conflictWith = 'parent-id';
    render(<LocalWorkspacePage />);
    const local = screen.getByRole('row', { name: /Draft Canvas/ });
    fireEvent.pointerDown(within(local).getByRole('button', { name: 'Actions for Draft' }),
      { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Review versions' }));
    const dialog = await screen.findByRole('dialog', { name: 'Two versions are saved' });
    expect(within(dialog).getByText('This copy: Draft')).toBeVisible();
    expect(within(dialog).getByText('Other cloud copy: Original draft')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue this copy' }));
    await waitFor(() => expect(fixtures.switchSession).toHaveBeenCalledWith('local'));
  });

  it('keeps works visible and opens the account dialog from the footer route', () => {
    render(<LocalWorkspacePage />);
    expect(screen.getByRole('table', { name: 'My workspace' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'maker' }));
    expect(window.location.search).toBe('?view=account');
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeVisible();
    expect(screen.getByText('0 of 100 MiB used · 10 MiB per backup')).toBeVisible();
    expect(document.querySelector('table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(fixtures.signOut).toHaveBeenCalledOnce();
  });

  it('shows a GitHub-only sign-in card and an honest unavailable state', () => {
    fixtures.user = null;
    const { rerender } = render(<LocalWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign in to CharDesk' });
    expect(within(dialog).getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    fixtures.configured = false;
    rerender(<LocalWorkspacePage />);
    expect(within(dialog).getByText('Cloud account is not configured. Local works remain available.')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Sign in with GitHub' })).not.toBeInTheDocument();
  });

  it('keeps loading and account errors inside the same card', () => {
    fixtures.user = null;
    fixtures.loading = true;
    const { rerender } = render(<LocalWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Loading account…' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign in to CharDesk' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Loading account…');
    expect(within(dialog).queryByRole('button', { name: 'Sign in with GitHub' })).not.toBeInTheDocument();
    fixtures.loading = false;
    fixtures.error = true;
    rerender(<LocalWorkspacePage />);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Cloud action failed');
    expect(within(dialog).getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  });
});

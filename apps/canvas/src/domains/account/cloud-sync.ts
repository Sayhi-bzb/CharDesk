import type { CanvasRuntime } from '@/domains/canvas/public';
import { parseDocumentSessionSource } from '@/domains/document/public';
import { isSourceBackedCanvasSession } from '@/domains/sessions/public';
import { prepareTextExport } from '@/domains/export/public';
import { cloudWorkspaceApi, cloudWorkspaceConfigured, CloudWorkspaceRequestError } from './cloud-workspace-api';

type SyncCanvas = Pick<CanvasRuntime, 'ready' | 'getState' | 'materializeSession' | 'subscribe' | 'documents' | 'commands'>;

const STORAGE_KEY = 'chardesk-cloud-sync-v1';
const CHANGE_EVENT = 'chardesk-cloud-sync-change';
const CATALOG_EVENT = 'chardesk-cloud-catalog-change';
const INTERVAL_MS = 60_000;
const CONFLICT_SUFFIX = ' (conflict copy)';
const conflictTitle = (title: string) => `${title.slice(0, 120 - CONFLICT_SUFFIX.length)}${CONFLICT_SUFFIX}`;

type Binding = { userId: string; sessionId: string; workId: string; revision: number;
  digest: string; conflictCopy?: boolean; conflictWith?: string };
type SyncState = 'checking' | 'syncing' | 'synced' | 'conflict-copy' | 'offline' | 'error';
const state = new Map<string, SyncState>();

const readBindings = (): Binding[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Binding => typeof item === 'object' && item !== null &&
      typeof item.userId === 'string' && typeof item.sessionId === 'string' &&
      typeof item.workId === 'string' && Number.isSafeInteger(item.revision) && item.revision > 0 &&
      typeof item.digest === 'string' &&
      (item.conflictWith === undefined || typeof item.conflictWith === 'string'));
  } catch { return []; }
};

const writeBinding = (binding: Binding) => {
  const next = readBindings().filter((item) => item.userId !== binding.userId || item.sessionId !== binding.sessionId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next, binding]));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const getCloudBinding = (userId: string, key: string) =>
  readBindings().find((item) => item.userId === userId && item.sessionId === key) ?? null;
export const updateCloudBinding = writeBinding;
export const notifyCloudSync = (key: string, next: SyncState) => notify(key, next);
export const notifyCloudCatalog = () => window.dispatchEvent(new Event(CATALOG_EVENT));

export const digestSnapshot = async (title: string, content: string): Promise<string> => {
  const bytes = new TextEncoder().encode(`${title}\0${content}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const bindCloudSession = async (userId: string, sessionId: string, workId: string,
  revision: number, title: string, content: string, conflictWith?: string | null) => {
  if (readBindings().some((item) => item.userId === userId && item.sessionId === sessionId)) return;
  writeBinding({ userId, sessionId, workId, revision, digest: await digestSnapshot(title, content),
    ...(conflictWith ? { conflictWith, conflictCopy: true } : {}) });
  state.set(sessionId, 'synced');
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const unbindCloudWork = (userId: string, workId: string) => {
  const bindings = readBindings();
  const removed = bindings.filter((item) => item.userId === userId && item.workId === workId);
  if (removed.length === 0) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings.filter((item) =>
    item.userId !== userId || item.workId !== workId)));
  removed.forEach((item) => state.delete(item.sessionId));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const getBoundCloudWorkId = (userId: string, sessionId: string): string | null =>
  readBindings().find((item) => item.userId === userId && item.sessionId === sessionId)?.workId ?? null;

export const getCloudConflict = (userId: string, sessionId: string): string | null =>
  readBindings().find((item) => item.userId === userId && item.sessionId === sessionId)?.conflictWith ?? null;

export const resolveCloudConflict = (userId: string, sessionId: string) => {
  const binding = readBindings().find((item) => item.userId === userId && item.sessionId === sessionId);
  if (!binding?.conflictWith) return;
  writeBinding({ ...binding, conflictWith: undefined });
  notify(sessionId, 'synced');
};

export const getCloudSyncState = (userId: string, sessionId: string): SyncState | null => {
  const binding = readBindings().find((item) => item.userId === userId && item.sessionId === sessionId);
  if (!binding) return null;
  const current = state.get(sessionId) ?? 'checking';
  return binding.conflictWith && current === 'synced' ? 'conflict-copy' : current;
};

export const subscribeCloudSync = (listener: () => void) => {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
};

const notify = (sessionId: string, next: SyncState) => {
  state.set(sessionId, next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const snapshot = async (canvas: SyncCanvas, sessionId: string) => {
  const session = await canvas.materializeSession(sessionId);
  if (!session) return null;
  const exported = prepareTextExport({ canvasMode: session.mode, surface: session.surface,
    slideDeck: session.slideDeck, documentName: session.name, includeColor: true, showGrid: false }, 'chardesk');
  if (!exported.ok) return null;
  return { title: session.name, content: exported.value.content };
};

export const startCloudSync = (canvas: SyncCanvas): (() => void) => {
  if (!cloudWorkspaceConfigured) return () => undefined;
  let stopped = false;
  let running = false;
  let debounce: number | undefined;
  const localEpoch = new Map<string, number>();
  const tick = async () => {
    if (stopped || running) return;
    if (!navigator.onLine) {
      readBindings().forEach((binding) => notify(binding.sessionId, 'offline'));
      return;
    }
    running = true;
    try {
      await canvas.ready;
      const { user } = await cloudWorkspaceApi.me();
      if (!user) return;
      const { works } = await cloudWorkspaceApi.list();
      window.dispatchEvent(new Event(CATALOG_EVENT));
      for (const binding of readBindings().filter((item) => item.userId === user.id)) {
        if (stopped) return;
        const descriptor = canvas.getState().canvasSessions.find((item) => item.id === binding.sessionId);
        if (!descriptor || descriptor.collaboration || isSourceBackedCanvasSession(descriptor)) continue;
        const startingEpoch = localEpoch.get(binding.sessionId) ?? 0;
        const current = await snapshot(canvas, binding.sessionId);
        if (!current) continue;
        const digest = await digestSnapshot(current.title, current.content);
        const remoteWork = works.find((item) => item.id === binding.workId);
        if (!remoteWork || remoteWork.revision === null) {
          notify(binding.sessionId, 'error');
          continue;
        }
        if (remoteWork.revision > binding.revision) {
          notify(binding.sessionId, 'syncing');
          try {
            const remote = await cloudWorkspaceApi.readBackup(binding.workId);
            if (remote.revision <= binding.revision) continue;
            if (remote.content === current.content && remote.title === current.title) {
              writeBinding({ ...binding, revision: remote.revision, digest });
              notify(binding.sessionId, 'synced');
              continue;
            }
            if (digest !== binding.digest) {
              const latest = await snapshot(canvas, binding.sessionId);
              if (!latest || await digestSnapshot(latest.title, latest.content) !== digest ||
                (localEpoch.get(binding.sessionId) ?? 0) !== startingEpoch) {
                notify(binding.sessionId, 'checking');
                schedule();
                continue;
              }
              const { work } = await cloudWorkspaceApi.createBackup(
                descriptor.mode === 'slide' ? 'slides' : 'canvas', conflictTitle(current.title), current.content,
                binding.workId);
              writeBinding({ ...binding, workId: work.id, revision: work.revision!, digest,
                conflictCopy: true, conflictWith: binding.workId });
              notify(binding.sessionId, 'conflict-copy');
              window.dispatchEvent(new Event(CATALOG_EVENT));
              continue;
            }
            const parsed = await parseDocumentSessionSource(remote.content, { sourceName: `${remote.title}.chardesk` });
            if (parsed.mode !== descriptor.mode) throw new Error('Cloud work mode changed');
            const latest = await snapshot(canvas, binding.sessionId);
            if (!latest || await digestSnapshot(latest.title, latest.content) !== binding.digest ||
              (localEpoch.get(binding.sessionId) ?? 0) !== startingEpoch) {
              notify(binding.sessionId, 'checking');
              schedule();
              continue;
            }
            canvas.commands.sessions.replaceSnapshot(binding.sessionId, parsed, { preserveViewport: true, resetHistory: true });
            if (descriptor.name !== remote.title) canvas.commands.sessions.rename(binding.sessionId, remote.title);
            const applied = await snapshot(canvas, binding.sessionId);
            if (!applied) throw new Error('Applied cloud snapshot unavailable');
            writeBinding({ ...binding, revision: remote.revision,
              digest: await digestSnapshot(applied.title, applied.content) });
            notify(binding.sessionId, 'synced');
            continue;
          } catch { notify(binding.sessionId, 'error'); continue; }
        }
        if (remoteWork.revision < binding.revision) {
          notify(binding.sessionId, 'error');
          continue;
        }
        if (digest === binding.digest) {
          if (state.get(binding.sessionId) !== 'synced' && state.get(binding.sessionId) !== 'conflict-copy') {
            notify(binding.sessionId, 'synced');
          }
          continue;
        }
        notify(binding.sessionId, 'syncing');
        try {
          const { work } = await cloudWorkspaceApi.updateBackup(binding.workId, binding.revision,
            binding.conflictCopy ? conflictTitle(current.title) : current.title, current.content);
          writeBinding({ ...binding, revision: work.revision!, digest });
          notify(binding.sessionId, 'synced');
          window.dispatchEvent(new Event(CATALOG_EVENT));
        } catch (error) {
          if (error instanceof CloudWorkspaceRequestError && error.status === 409) {
            try {
              const remote = await cloudWorkspaceApi.readBackup(binding.workId);
              if (remote.content === current.content && remote.title === current.title) {
                writeBinding({ ...binding, revision: remote.revision, digest });
                notify(binding.sessionId, 'synced');
                continue;
              }
              const latest = await snapshot(canvas, binding.sessionId);
              if (!latest || await digestSnapshot(latest.title, latest.content) !== digest ||
                (localEpoch.get(binding.sessionId) ?? 0) !== startingEpoch) {
                notify(binding.sessionId, 'checking');
                schedule();
                continue;
              }
              const { work } = await cloudWorkspaceApi.createBackup(
                descriptor.mode === 'slide' ? 'slides' : 'canvas', conflictTitle(current.title), current.content,
                binding.workId);
              writeBinding({ ...binding, workId: work.id, revision: work.revision!, digest,
                conflictCopy: true, conflictWith: binding.workId });
              notify(binding.sessionId, 'conflict-copy');
              window.dispatchEvent(new Event(CATALOG_EVENT));
            } catch { notify(binding.sessionId, 'error'); }
          } else notify(binding.sessionId, 'error');
        }
      }
    } catch {
      readBindings().forEach((binding) => notify(binding.sessionId, 'error'));
    }
    finally { running = false; }
  };
  const timer = window.setInterval(() => { void tick(); }, INTERVAL_MS);
  const refresh = () => { void tick(); };
  const schedule = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(refresh, 2_000);
  };
  const unsubscribeMutations = canvas.documents.subscribeMutations(({ documentId }) => {
    localEpoch.set(documentId, (localEpoch.get(documentId) ?? 0) + 1);
    if (readBindings().some((item) => item.sessionId === documentId)) schedule();
  });
  const unsubscribeSessions = canvas.subscribe((next, previous) => {
    if (next.canvasSessions === previous.canvasSessions) return;
    if (readBindings().some((binding) => {
      const current = next.canvasSessions.find((item) => item.id === binding.sessionId);
      const prior = previous.canvasSessions.find((item) => item.id === binding.sessionId);
      if (current?.name === prior?.name) return false;
      localEpoch.set(binding.sessionId, (localEpoch.get(binding.sessionId) ?? 0) + 1);
      return true;
    })) schedule();
  });
  window.addEventListener('online', refresh);
  window.addEventListener(CHANGE_EVENT, refresh);
  const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  void tick();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.clearTimeout(debounce);
    unsubscribeMutations();
    unsubscribeSessions();
    window.removeEventListener('online', refresh);
    window.removeEventListener(CHANGE_EVENT, refresh);
    document.removeEventListener('visibilitychange', onVisible);
  };
};

export const subscribeCloudCatalog = (listener: () => void) => {
  window.addEventListener(CATALOG_EVENT, listener);
  return () => window.removeEventListener(CATALOG_EVENT, listener);
};

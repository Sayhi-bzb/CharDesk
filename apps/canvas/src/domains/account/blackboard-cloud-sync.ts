import type { BlackboardWorkspaceRepository } from '@/domains/blackboard/public';
import { parseBlackboardSource, serializeBlackboardSource } from '@/domains/blackboard/public';
import { cloudWorkspaceApi, cloudWorkspaceConfigured, CloudWorkspaceRequestError } from './cloud-workspace-api';
import { blackboardSyncKey, digestSnapshot, getCloudBinding, notifyCloudCatalog,
  notifyCloudSync, updateCloudBinding } from './cloud-sync';

const INTERVAL_MS = 60_000;
const conflictTitle = (title: string) => `${title.slice(0, 104)} (conflict copy)`;

export const startBlackboardCloudSync = (repository: BlackboardWorkspaceRepository): (() => void) => {
  if (!cloudWorkspaceConfigured) return () => undefined;
  let stopped = false;
  let running = false;
  let debounce: number | undefined;
  const schedule = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => { void tick(); }, 2_000);
  };
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const { user } = await cloudWorkspaceApi.me();
      if (!user) return;
      const workspaces = await repository.listWorkspaces();
      if (!navigator.onLine) {
        workspaces.forEach((item) => {
          const key = blackboardSyncKey(item.id);
          if (getCloudBinding(user.id, key)) notifyCloudSync(key, 'offline');
        });
        return;
      }
      const { works } = await cloudWorkspaceApi.list();
      notifyCloudCatalog();
      for (const item of workspaces) {
        if (stopped) return;
        const key = blackboardSyncKey(item.id);
        const binding = getCloudBinding(user.id, key);
        if (!binding) continue;
        const local = await repository.readWorkspace(item.id);
        if (!local) continue;
        const content = serializeBlackboardSource(local);
        const digest = await digestSnapshot(local.workspace.title, content);
        const remote = works.find((work) => work.id === binding.workId && work.kind === 'blackboard');
        if (!remote?.revision) { notifyCloudSync(key, 'error'); continue; }
        const stillCurrent = async () =>
          (await repository.readWorkspace(item.id))?.workspace.revision === local.workspace.revision &&
          getCloudBinding(user.id, key)?.workId === binding.workId;
        const fork = async () => {
          if (!await stillCurrent()) { schedule(); return; }
          const { work } = await cloudWorkspaceApi.createBackup('blackboard', conflictTitle(local.workspace.title),
            content, binding.workId);
          updateCloudBinding({ ...binding, workId: work.id, revision: work.revision!, digest,
            conflictWith: binding.workId, conflictCopy: true });
          notifyCloudSync(key, 'conflict-copy');
          notifyCloudCatalog();
        };
        try {
          if (remote.revision > binding.revision) {
            notifyCloudSync(key, 'syncing');
            const latest = await cloudWorkspaceApi.readBackup(binding.workId);
            if (latest.revision <= binding.revision) continue;
            if (!await stillCurrent()) { schedule(); continue; }
            if (latest.content === content) {
              updateCloudBinding({ ...binding, revision: latest.revision, digest });
              notifyCloudSync(key, binding.conflictWith ? 'conflict-copy' : 'synced');
              continue;
            }
            if (digest !== binding.digest) { await fork(); continue; }
            const files = parseBlackboardSource(latest.content);
            const applied = await repository.replaceWorkspace(item.id, files, local.workspace.revision);
            updateCloudBinding({ ...binding, revision: latest.revision,
              digest: await digestSnapshot(applied.workspace.title, serializeBlackboardSource(applied)) });
            notifyCloudSync(key, 'synced');
          } else if (remote.revision < binding.revision) {
            notifyCloudSync(key, 'error');
          } else if (digest === binding.digest) {
            notifyCloudSync(key, binding.conflictWith ? 'conflict-copy' : 'synced');
          } else {
            notifyCloudSync(key, 'syncing');
            const { work } = await cloudWorkspaceApi.updateBackup(binding.workId, binding.revision,
              binding.conflictCopy ? conflictTitle(local.workspace.title) : local.workspace.title, content);
            updateCloudBinding({ ...binding, revision: work.revision!, digest });
            notifyCloudSync(key, binding.conflictWith ? 'conflict-copy' : 'synced');
            notifyCloudCatalog();
            if (!await stillCurrent()) schedule();
          }
        } catch (error) {
          if (error instanceof CloudWorkspaceRequestError && error.status === 409) {
            try {
              const latest = await cloudWorkspaceApi.readBackup(binding.workId);
              if (!await stillCurrent()) { schedule(); continue; }
              if (latest.content === content) {
                updateCloudBinding({ ...binding, revision: latest.revision, digest });
                notifyCloudSync(key, binding.conflictWith ? 'conflict-copy' : 'synced');
              } else await fork();
            } catch { notifyCloudSync(key, 'error'); }
          } else if (error instanceof Error && error.name === 'BlackboardRevisionConflictError') {
            notifyCloudSync(key, 'checking'); schedule();
          } else notifyCloudSync(key, 'error');
        }
      }
    } catch { /* Keep local source untouched; retry on the next event. */ }
    finally { running = false; }
  };
  const timer = window.setInterval(() => { void tick(); }, INTERVAL_MS);
  const unsubscribe = repository.subscribe(schedule);
  const online = () => { void tick(); };
  const visible = () => { if (document.visibilityState === 'visible') void tick(); };
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', visible);
  void tick();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.clearTimeout(debounce);
    unsubscribe();
    window.removeEventListener('online', online);
    document.removeEventListener('visibilitychange', visible);
  };
};

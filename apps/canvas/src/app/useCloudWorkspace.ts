import { useEffect, useState } from 'react';
import {
  cloudWorkspaceApi, cloudWorkspaceConfigured, CloudWorkspaceRequestError,
  bindCloudSession, subscribeCloudCatalog,
  unbindCloudWork,
  type CloudUser, type CloudWork, type CloudStorageLimits,
} from '@/domains/account/public';

export function useCloudWorkspace() {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [works, setWorks] = useState<CloudWork[]>([]);
  const [limits, setLimits] = useState<CloudStorageLimits | null>(null);
  const [loading, setLoading] = useState(cloudWorkspaceConfigured);
  const [error, setError] = useState(false);
  const [limitExceeded, setLimitExceeded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cloudWorkspaceConfigured) return;
    let current = true;
    void cloudWorkspaceApi.me().then(async ({ user: account }) => {
      if (!current) return;
      setUser(account);
      if (account) {
        const result = await cloudWorkspaceApi.list();
        if (current) {
          setWorks(result.works);
          setLimits(result.limits);
        }
      }
    }).catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => subscribeCloudCatalog(() => {
    if (!user) return;
    void cloudWorkspaceApi.list().then((result) => {
      setWorks(result.works);
      setLimits(result.limits);
    }).catch(() => setError(true));
  }), [user]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(false);
    setLimitExceeded(false);
    try { await action(); return true; }
    catch (cause) {
      setError(true);
      setLimitExceeded(cause instanceof CloudWorkspaceRequestError && cause.status === 413);
      return false;
    }
    finally { setBusy(false); }
  };

  return {
    configured: cloudWorkspaceConfigured,
    user, works, limits, loading, error, limitExceeded, busy,
    backup: (kind: 'canvas' | 'slides' | 'blackboard', title: string, content: string, sessionId?: string) => run(async () => {
      const { work } = await cloudWorkspaceApi.createBackup(kind, title, content);
      setWorks((current) => [work, ...current]);
      setLimits((current) => current && { ...current, usedBytes: current.usedBytes + (work.contentBytes ?? 0) });
      if (user && sessionId && work.revision) {
        try { await bindCloudSession(user.id, sessionId, work.id, work.revision, title, content); }
        catch { /* The saved backup remains available even if this browser cannot store its sync binding. */ }
      }
    }),
    rename: (work: CloudWork, title: string) => run(async () => {
      await cloudWorkspaceApi.rename(work.id, title);
      setWorks((current) => current.map((item) => item.id === work.id ? { ...item, title } : item));
    }),
    remove: (work: CloudWork) => run(async () => {
      await cloudWorkspaceApi.remove(work.id);
      if (user) unbindCloudWork(user.id, work.id);
      setWorks((current) => current.filter((item) => item.id !== work.id));
      setLimits((current) => current && { ...current, usedBytes: Math.max(0, current.usedBytes - (work.contentBytes ?? 0)) });
    }),
    signOut: () => run(async () => {
      await cloudWorkspaceApi.logout();
      setUser(null);
      setWorks([]);
      setLimits(null);
    }),
  };
}

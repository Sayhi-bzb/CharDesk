export type CloudUser = { id: string; login: string; avatarUrl: string | null };
export type CloudWork = {
  id: string;
  kind: 'canvas' | 'slides' | 'blackboard';
  title: string;
  createdAt: string;
  updatedAt: string;
  contentStatus: 'not-uploaded' | 'uploaded';
  contentBytes: number | null;
  revision: number | null;
  conflictWith: string | null;
};
export type CloudStorageLimits = { maxWorkBytes: number; maxAccountBytes: number; usedBytes: number };

const endpoint = import.meta.env.VITE_ACCOUNT_API_ENDPOINT?.trim().replace(/\/$/, '') ?? '';

export const cloudWorkspaceConfigured = Boolean(endpoint);
export const cloudSignInUrl = endpoint ? `${endpoint}/v1/account/login` : '';

export class CloudWorkspaceRequestError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Cloud workspace request failed: ${status}`);
    this.status = status;
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  if (!endpoint) throw new Error('Cloud workspace is not configured');
  const response = await fetch(`${endpoint}/v1/account${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...init?.headers, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!response.ok) throw new CloudWorkspaceRequestError(response.status);
  return response.json() as Promise<T>;
};

export const cloudWorkspaceApi = {
  me: () => request<{ user: CloudUser | null }>('/me'),
  list: () => request<{ works: CloudWork[]; limits: CloudStorageLimits }>('/works'),
  create: (kind: CloudWork['kind'], title: string) => request<{ work: CloudWork }>('/works', {
    method: 'POST', body: JSON.stringify({ kind, title }),
  }),
  createBackup: (kind: CloudWork['kind'], title: string, content: string, conflictWith?: string) =>
    request<{ work: CloudWork }>('/works/backups', {
      method: 'POST', body: JSON.stringify({ kind, title, content, conflictWith }),
    }),
  readBackup: (id: string) => request<{ title: string; content: string; revision: number }>(`/works/${encodeURIComponent(id)}/content`),
  updateBackup: (id: string, expectedRevision: number, title: string, content: string) =>
    request<{ work: CloudWork }>(`/works/${encodeURIComponent(id)}/content`, {
      method: 'PUT', body: JSON.stringify({ expectedRevision, title, content }),
    }),
  rename: (id: string, title: string) => request<{ ok: boolean }>(`/works/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ title }),
  }),
  remove: (id: string) => request<{ ok: boolean }>(`/works/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  logout: () => request<{ ok: boolean }>('/logout', { method: 'POST' }),
};

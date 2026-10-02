type LocalAgentStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type LocalAgentPermission = 'inspect' | 'read' | 'search' | 'write';
export type LocalAgentPermissions = Readonly<Record<LocalAgentPermission, boolean>>;
export const DEFAULT_LOCAL_AGENT_PERMISSIONS: LocalAgentPermissions = Object.freeze({ inspect: true, read: true, search: true, write: true });

type LocalAgentPort = Readonly<{
  scope: () => string | null;
  canvasId?: () => string | null;
  execute: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}>;

let port: LocalAgentPort | undefined;
let socket: WebSocket | undefined;
let status: LocalAgentStatus = 'idle';
let revision = 0;
const pairingKey = 'chardesk.local-agent.pairing';
const enabledKey = 'chardesk.local-agent.enabled';
const MAX_AGENT_RESPONSE_BYTES = 900 * 1024;
export const DEFAULT_LOCAL_AGENT_URL = 'ws://127.0.0.1:9494/bridge';
type Pairing = { url: string; scope: string; expiresAt: number; permissions: LocalAgentPermissions };
let retry: ReturnType<typeof setTimeout> | undefined;
let automatic = false;
let enabled = false;
const readEnabled = () => {
  try { return localStorage.getItem(enabledKey) === 'true'; } catch { return enabled; }
};
export function getRememberedLocalAgent(): Pairing | null {
  try {
    const saved = JSON.parse(localStorage.getItem(pairingKey) ?? 'null') as Pairing | null;
    if (saved && typeof saved.url === 'string' && typeof saved.scope === 'string'
      && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now()) {
      // Pairings created before permission grants were persisted remain scoped to
      // their original Canvas. They are never widened to application scope.
      const legacyPermissions = saved.permissions ?? DEFAULT_LOCAL_AGENT_PERMISSIONS;
      if (Object.keys(DEFAULT_LOCAL_AGENT_PERMISSIONS).every((key) => typeof legacyPermissions[key as LocalAgentPermission] === 'boolean')) {
        return { ...saved, permissions: legacyPermissions };
      }
    }
    localStorage.removeItem(pairingKey);
  } catch { /* Storage may be unavailable; explicit pairing still works. */ }
  return null;
}
const listeners = new Set<() => void>();
const publish = (next: LocalAgentStatus) => {
  status = next;
  revision++;
  for (const listener of listeners) listener();
};

export const subscribeLocalAgent = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getLocalAgentStatus = () => status;
export const getLocalAgentEnabled = () => enabled || readEnabled();
export const getLocalAgentRevision = () => revision;
export const configureLocalAgent = (next: LocalAgentPort) => { port = next; enabled = readEnabled(); restoreLocalAgent(); };

export function restoreLocalAgent() {
  const saved = getRememberedLocalAgent();
  const currentScope = port?.scope();
  const currentCanvas = port?.canvasId?.() ?? currentScope;
  const matches = saved && (saved.scope === 'application' ? saved.scope === currentScope : saved.scope === currentCanvas);
  if (getLocalAgentEnabled() && !socket && currentScope && (!saved || matches)) {
    try { connectLocalAgent(matches ? saved.url : DEFAULT_LOCAL_AGENT_URL, true, matches ? saved.permissions : DEFAULT_LOCAL_AGENT_PERMISSIONS, matches ? saved.scope : undefined); } catch { /* Retry when the local agent becomes available. */ }
  }
}

export function forgetLocalAgent() {
  try { localStorage.removeItem(pairingKey); } catch { /* No stored pairing to remove. */ }
  enabled = false;
  try { localStorage.removeItem(enabledKey); } catch { /* Storage may be unavailable. */ }
  if (socket?.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify({ method: 'revoke' })); } catch { /* The bridge may already be closing. */ }
  }
  disconnectLocalAgent();
}

export const disconnectLocalAgent = () => {
  automatic = false;
  clearTimeout(retry);
  const previous = socket;
  socket = undefined;
  previous?.close(1000, 'Disconnected by page');
  publish('idle');
};

export const setLocalAgentEnabled = (next: boolean, grant = DEFAULT_LOCAL_AGENT_PERMISSIONS) => {
  enabled = next;
  try {
    if (next) localStorage.setItem(enabledKey, 'true');
    else localStorage.removeItem(enabledKey);
  } catch { /* Storage may be unavailable; the in-memory switch still applies. */ }
  if (!next) { disconnectLocalAgent(); return; }
  const saved = getRememberedLocalAgent();
  try { connectLocalAgent(saved?.url || DEFAULT_LOCAL_AGENT_URL, true, saved?.permissions ?? grant, saved?.scope); }
  catch { /* The retry loop will connect when a local agent starts. */ }
  publish(status);
};

let permissions: LocalAgentPermissions = DEFAULT_LOCAL_AGENT_PERMISSIONS;
export const getLocalAgentPermissions = () => permissions;

export function connectLocalAgent(value = DEFAULT_LOCAL_AGENT_URL, remember = false, grant = DEFAULT_LOCAL_AGENT_PERMISSIONS, requestedScope?: string): void {
  const url = new URL(value.trim() || DEFAULT_LOCAL_AGENT_URL);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port
    || url.pathname !== '/bridge' || url.username || url.password || url.hash
    || [...url.searchParams.keys()].some((key) => key !== 'token')
    || (url.searchParams.has('token') && !/^[a-f0-9]{64}$/.test(url.searchParams.get('token') ?? ''))) {
    throw new Error('Invalid local pairing URL');
  }
  const activePort = port;
  const applicationScope = activePort?.scope();
  const scope = requestedScope ?? applicationScope;
  const currentCanvas = activePort?.canvasId?.() ?? applicationScope;
  if (!activePort || !applicationScope || !scope || (scope !== 'application' && currentCanvas !== scope)) throw new Error('Open a Canvas first');
  if (remember) {
    enabled = true;
    try { localStorage.setItem(enabledKey, 'true'); } catch { /* Storage may be unavailable. */ }
  }
  disconnectLocalAgent();
  automatic = remember;
  permissions = { ...DEFAULT_LOCAL_AGENT_PERMISSIONS, ...grant };
  const connection = new WebSocket(url.href);
  socket = connection;
  publish('connecting');
  const timeout = window.setTimeout(() => {
    if (socket === connection && status === 'connecting') {
      connection.close();
      publish('error');
    }
  }, 10_000);
  connection.onopen = () => {
    window.clearTimeout(timeout);
    if (socket === connection) publish('connected');
  };
  connection.onerror = () => {
    if (socket === connection) publish('error');
  };
  connection.onclose = () => {
    window.clearTimeout(timeout);
    if (socket === connection) {
      socket = undefined;
      publish('error');
      const saved = getRememberedLocalAgent();
      const currentScope = saved?.scope === 'application' ? activePort.scope() : (activePort.canvasId?.() ?? activePort.scope());
      if (automatic && getLocalAgentEnabled() && (!saved || saved.scope === currentScope)) {
        retry = setTimeout(restoreLocalAgent, 5_000);
      }
    }
  };
  let queue = Promise.resolve();
  const completed = new Map<string, { request: string; response: string }>();
  connection.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (typeof data !== 'string' || new TextEncoder().encode(data).byteLength > 1024 * 1024) {
      connection.close(1009, 'Invalid request size');
      return;
    }
    try {
      const message = JSON.parse(data) as { method?: string; expiresAt?: number };
      if (message.method === 'paired') {
        if (socket !== connection) return;
        connection.send(JSON.stringify({ method: 'authorize', grant: {
          scope: scope === 'application' ? 'application' : 'canvas',
          ...(scope === 'application' ? {} : { canvasId: scope }),
          permissions,
        } }));
        if (remember && Number.isFinite(message.expiresAt) && message.expiresAt! > Date.now()) {
          localStorage.setItem(pairingKey, JSON.stringify({ url: url.href, scope, permissions,
            expiresAt: Math.min(message.expiresAt!, Date.now() + 30 * 24 * 60 * 60 * 1000) }));
          publish(status);
        }
        return;
      }
      if (message.method === 'authorized') {
        if (socket === connection) publish('connected');
        return;
      }
      if (message.method === 'authorization_denied') {
        if (socket === connection) { automatic = false; connection.close(1008, 'Authorization denied'); publish('error'); }
        return;
      }
    } catch {
      // A requested persistent pairing must not silently become temporary.
      if (remember) { automatic = false; connection.close(); publish('error'); return; }
    }
    queue = queue.then(async () => {
      if (socket !== connection || connection.readyState !== WebSocket.OPEN) return;
      const currentScope = scope === 'application' ? activePort.scope() : (activePort.canvasId?.() ?? activePort.scope());
      if (currentScope !== scope) { disconnectLocalAgent(); return; }
      let id: string | undefined;
      let response: string;
      try {
        const request = JSON.parse(data) as { id?: unknown; method?: unknown; params?: { name?: unknown; input?: unknown } };
        if (typeof request.id !== 'string' || request.id.length > 128) throw new Error('Invalid request ID');
        id = request.id;
        const cached = completed.get(id);
        if (cached) {
          if (cached.request !== data) throw new Error('Request ID reused with different input');
          connection.send(cached.response);
          return;
        }
        const name = request.params?.name;
        const input = request.params?.input;
        if (request.method !== 'call' || !['chardesk_canvas_manage', 'chardesk_canvas_read', 'chardesk_canvas_search', 'chardesk_canvas_write', 'chardesk_canvas_code'].includes(String(name))
          || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid Canvas request');
        const permission = String(name).endsWith('_read') ? 'read' : String(name).endsWith('_search') ? 'search' : String(name).endsWith('_manage') && (input as { action?: unknown }).action === 'list' ? 'inspect' : 'write';
        if (!permissions[permission]) throw new Error(`Permission denied: canvas.${permission}`);
        if (scope !== 'application') {
          const target = input as { canvasId?: unknown };
          if (target.canvasId !== undefined && target.canvasId !== scope) throw new Error('Canvas authorization is limited to the paired Canvas.');
        }
        const scopedInput = scope === 'application' || String(name) !== 'chardesk_canvas_manage' || (input as { action?: unknown }).action !== 'list'
          ? input as Record<string, unknown>
          : { action: 'list', canvasId: scope };
        const result = await activePort.execute(String(name), scopedInput);
        response = JSON.stringify({ id, result });
      } catch (error) {
        response = JSON.stringify({ id, error: error instanceof Error ? error.message : 'Canvas request failed' });
      }
      if (new TextEncoder().encode(response).byteLength > MAX_AGENT_RESPONSE_BYTES) {
        response = JSON.stringify({ id, error: 'Canvas response is too large; narrow the viewport or use representation: text.' });
      }
      if (id && !completed.has(id)) {
        completed.set(id, { request: data, response });
        if (completed.size > 128) completed.delete(completed.keys().next().value!);
      }
      if (socket === connection && connection.readyState === WebSocket.OPEN) connection.send(response);
    }).catch(() => connection.close(1011, 'Canvas request failed'));
  };
}

type LocalAgentStatus = 'idle' | 'connecting' | 'connected' | 'error';
type LocalAgentPort = Readonly<{
  scope: () => string | null;
  execute: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}>;

let port: LocalAgentPort | undefined;
let socket: WebSocket | undefined;
let status: LocalAgentStatus = 'idle';
let revision = 0;
const pairingKey = 'chardesk.local-agent.pairing';
type Pairing = { url: string; scope: string; expiresAt: number };
let retry: ReturnType<typeof setTimeout> | undefined;
let automatic = false;
export function getRememberedLocalAgent(): Pairing | null {
  try {
    const saved = JSON.parse(localStorage.getItem(pairingKey) ?? 'null') as Pairing | null;
    if (saved && typeof saved.url === 'string' && typeof saved.scope === 'string'
      && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now()) return saved;
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
export const getLocalAgentRevision = () => revision;
export const configureLocalAgent = (next: LocalAgentPort) => { port = next; restoreLocalAgent(); };

export function restoreLocalAgent() {
  const saved = getRememberedLocalAgent();
  if (saved && saved.scope === port?.scope() && !socket) {
    try { connectLocalAgent(saved.url, true); } catch { forgetLocalAgent(); }
  }
}

export function forgetLocalAgent() {
  try { localStorage.removeItem(pairingKey); } catch { /* No stored pairing to remove. */ }
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

export function connectLocalAgent(value: string, remember = false): void {
  const url = new URL(value.trim());
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port
    || url.pathname !== '/bridge' || url.username || url.password || url.hash
    || [...url.searchParams.keys()].some((key) => key !== 'token')
    || !/^[a-f0-9]{64}$/.test(url.searchParams.get('token') ?? '')) {
    throw new Error('Invalid local pairing URL');
  }
  const activePort = port;
  const scope = activePort?.scope();
  if (!activePort || !scope) throw new Error('Open a Canvas first');
  disconnectLocalAgent();
  automatic = remember;
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
      if (automatic && saved?.scope === activePort.scope()) {
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
        if (remember && Number.isFinite(message.expiresAt) && message.expiresAt! > Date.now()) {
          localStorage.setItem(pairingKey, JSON.stringify({ url: url.href, scope,
            expiresAt: Math.min(message.expiresAt!, Date.now() + 30 * 24 * 60 * 60 * 1000) }));
          publish(status);
        }
        return;
      }
    } catch {
      // A requested persistent pairing must not silently become temporary.
      if (remember) { automatic = false; connection.close(); publish('error'); return; }
    }
    queue = queue.then(async () => {
      if (socket !== connection || connection.readyState !== WebSocket.OPEN) return;
      if (activePort.scope() !== scope) { disconnectLocalAgent(); return; }
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
        if (request.method !== 'call' || !['chardesk_canvas_read', 'chardesk_canvas_write'].includes(String(name))
          || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid Canvas request');
        const result = await activePort.execute(String(name), input as Record<string, unknown>);
        response = JSON.stringify({ id, result });
      } catch (error) {
        response = JSON.stringify({ id, error: error instanceof Error ? error.message : 'Canvas request failed' });
      }
      if (id && !completed.has(id)) {
        completed.set(id, { request: data, response });
        if (completed.size > 128) completed.delete(completed.keys().next().value!);
      }
      if (socket === connection && connection.readyState === WebSocket.OPEN) connection.send(response);
    }).catch(() => connection.close(1011, 'Canvas request failed'));
  };
}

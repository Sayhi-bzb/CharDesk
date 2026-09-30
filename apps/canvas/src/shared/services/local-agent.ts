type LocalAgentStatus = 'idle' | 'connecting' | 'connected' | 'error';
type LocalAgentPort = Readonly<{
  scope: () => string | null;
  execute: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}>;

let port: LocalAgentPort | undefined;
let socket: WebSocket | undefined;
let status: LocalAgentStatus = 'idle';
const listeners = new Set<() => void>();
const publish = (next: LocalAgentStatus) => {
  status = next;
  for (const listener of listeners) listener();
};

export const subscribeLocalAgent = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getLocalAgentStatus = () => status;
export const configureLocalAgent = (next: LocalAgentPort) => { port = next; };

export const disconnectLocalAgent = () => {
  const previous = socket;
  socket = undefined;
  previous?.close(1000, 'Disconnected by page');
  publish('idle');
};

export function connectLocalAgent(value: string): void {
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
    if (socket === connection) { socket = undefined; publish('error'); }
  };
  let queue = Promise.resolve();
  const completed = new Map<string, { request: string; response: string }>();
  connection.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (typeof data !== 'string' || new TextEncoder().encode(data).byteLength > 1024 * 1024) {
      connection.close(1009, 'Invalid request size');
      return;
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

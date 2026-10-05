import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLocalAgent, connectLocalAgent, disconnectLocalAgent,
  discoverLocalAgent, getLocalAgentStatus, getRememberedLocalAgent, restoreLocalAgent, forgetLocalAgent } from './local-agent';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.onclose?.(new Event('close')); });
  constructor() { Socket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(new Event('open')); }
  receive(value: unknown) { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(value) })); }
}

const url = `ws://127.0.0.1:9494/bridge?token=${'a'.repeat(64)}`;
describe('local agent page connection', () => {
  let scope: string | null;
  const execute = vi.fn(async () => ({ canvasId: 'canvas-a', bounds: [0, 0, 1, 1] }));
  beforeEach(() => {
    localStorage.clear();
    scope = 'canvas-a';
    execute.mockClear();
    Socket.instances = [];
    vi.stubGlobal('WebSocket', Socket);
    configureLocalAgent({ scope: () => scope, execute });
  });
  afterEach(() => { disconnectLocalAgent(); vi.unstubAllGlobals(); });

  it('only accepts explicit loopback pairing and an active Canvas', () => {
    for (const invalid of [url.replace('127.0.0.1', 'remote.example'), url.replace('ws:', 'wss:'),
      url.replace('token=', 'other='), url.replace('/bridge?', '/other?'), 'not a URL']) {
      expect(() => connectLocalAgent(invalid)).toThrow();
    }
    expect(Socket.instances).toHaveLength(0);
    scope = null;
    expect(() => connectLocalAgent(url)).toThrow('Open a Canvas first');
  });

  it('discovers a running local MCP bridge without a pairing URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ bridgeUrl: url }) })));
    expect(await discoverLocalAgent()).toBe(true);
    expect(Socket.instances).toHaveLength(1);
    Socket.instances[0].open();
    Socket.instances[0].receive({ method: 'paired', expiresAt: Date.now() + 60_000 });
    expect(Socket.instances[0].send).toHaveBeenCalledWith(expect.stringContaining('"method":"authorize"'));
  });

  it('serializes commands and returns cached duplicate results without repeating a write', async () => {
    connectLocalAgent(url);
    const socket = Socket.instances[0];
    socket.open();
    expect(getLocalAgentStatus()).toBe('connected');
    const request = { id: 'write-1', method: 'call', params: { name: 'canvas_write', input: { at: [0, 0], content: 'A' } } };
    socket.receive(request);
    socket.receive(request);
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(2));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(socket.send.mock.calls[0][0]).toBe(socket.send.mock.calls[1][0]);
    socket.receive({ ...request, params: { ...request.params, input: { at: [0, 0], content: 'B' } } });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(3));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.parse(socket.send.mock.calls[2][0]).error).toContain('different input');
  });

  it('runs read requests concurrently while writes wait for the read barrier', async () => {
    let releaseReads: () => void = () => undefined;
    const reads = new Promise<void>((resolve) => { releaseReads = resolve; });
    execute.mockImplementation(async (name) => {
      if (name === 'canvas_read') await reads;
      return { canvasId: 'canvas-a', bounds: [0, 0, 1, 1] };
    });
    connectLocalAgent(url);
    const socket = Socket.instances[0];
    socket.open();
    socket.receive({ id: 'read-a', method: 'call', params: { name: 'canvas_read', input: {} } });
    socket.receive({ id: 'read-b', method: 'call', params: { name: 'canvas_read', input: {} } });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    socket.receive({ id: 'write', method: 'call', params: { name: 'canvas_write', input: { at: [0, 0], content: 'A' } } });
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(2);
    releaseReads();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(3));
    expect(execute).toHaveBeenLastCalledWith('canvas_write', { at: [0, 0], content: 'A' });
  });

  it('refuses non-Canvas commands and disconnects when the target Canvas changes', async () => {
    connectLocalAgent(url);
    const socket = Socket.instances[0];
    socket.open();
    socket.receive({ id: 'bad', method: 'call', params: { name: 'bash', input: {} } });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(1));
    expect(execute).not.toHaveBeenCalled();
    scope = 'canvas-b';
    socket.receive({ id: 'read', method: 'call', params: { name: 'canvas_read', input: {} } });
    await vi.waitFor(() => expect(socket.close).toHaveBeenCalled());
    expect(execute).not.toHaveBeenCalled();
    expect(getLocalAgentStatus()).toBe('idle');
  });

  it('keeps an application-scoped pairing across Canvas changes and enforces grants', async () => {
    scope = 'application';
    connectLocalAgent(url, false, { inspect: true, read: true, search: true, write: false });
    const socket = Socket.instances[0];
    socket.open();
    scope = 'application';
    socket.receive({ id: 'read', method: 'call', params: { name: 'canvas_read', input: {} } });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    socket.receive({ id: 'write', method: 'call', params: { name: 'canvas_write', input: { at: [0, 0], content: 'A' } } });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(2));
    expect(JSON.parse(socket.send.mock.calls[1][0]).error).toContain('Permission denied: canvas.write');
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('forwards search through the same Canvas port', async () => {
    connectLocalAgent(url);
    const socket = Socket.instances[0];
    socket.open();
    const input = { query: 'Hello', after: [10, 20] };
    socket.receive({ id: 'search-1', method: 'call', params: { name: 'canvas_search', input } });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith('canvas_search', input);
    expect(JSON.parse(socket.send.mock.calls[0][0]).error).toBeUndefined();
  });

  it('rejects oversized Canvas responses without closing the bridge', async () => {
    connectLocalAgent(url);
    const socket = Socket.instances[0];
    socket.open();
    execute.mockResolvedValueOnce({ content: 'x'.repeat(950_000) } as never);
    socket.receive({ id: 'large', method: 'call', params: { name: 'canvas_read', input: {} } });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(1));
    expect(JSON.parse(socket.send.mock.calls[0][0]).error).toContain('response is too large');
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('checks persistent Canvas IDs against the paired Canvas before forwarding', async () => {
    connectLocalAgent(url);
    const socket = Socket.instances[0];
    socket.open();
    socket.receive({ id: 'other', method: 'call', params: { name: 'canvas_read', input: { canvasId: 'canvas-b' } } });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(1));
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(socket.send.mock.calls[0][0]).error).toContain('limited to the paired Canvas');
    socket.receive({ id: 'same', method: 'call', params: { name: 'canvas_read', input: { canvasId: 'canvas-a' } } });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(2));
    expect(execute).toHaveBeenLastCalledWith('canvas_read', { canvasId: 'canvas-a' });
  });

  it('ignores callbacks from a replaced connection and shows unexpected disconnects', () => {
    connectLocalAgent(url);
    const old = Socket.instances[0];
    connectLocalAgent(url);
    old.open();
    expect(getLocalAgentStatus()).toBe('connecting');
    const active = Socket.instances[1];
    active.open();
    active.close();
    expect(getLocalAgentStatus()).toBe('error');
    disconnectLocalAgent();
    expect(getLocalAgentStatus()).toBe('idle');
  });

  it('remembers only after successful pairing and restores only the authorized Canvas', () => {
    connectLocalAgent(url, true);
    expect(getRememberedLocalAgent()).toBeNull();
    const connection = Socket.instances[0];
    connection.open();
    const expiresAt = Date.now() + 60_000;
    connection.receive({ method: 'paired', expiresAt });
    expect(getRememberedLocalAgent()).toEqual({ url, scope, expiresAt, permissions: { inspect: true, read: true, search: true, write: true } });
    disconnectLocalAgent();
    scope = 'canvas-b';
    restoreLocalAgent();
    expect(Socket.instances).toHaveLength(1);
    scope = 'canvas-a';
    restoreLocalAgent();
    expect(Socket.instances).toHaveLength(2);
    forgetLocalAgent();
    restoreLocalAgent();
    expect(getRememberedLocalAgent()).toBeNull();
    expect(Socket.instances).toHaveLength(2);
  });

  it('does not store temporary pairings and removes expired credentials', () => {
    connectLocalAgent(url);
    Socket.instances[0].open();
    Socket.instances[0].receive({ method: 'paired', expiresAt: Date.now() + 60_000 });
    expect(getRememberedLocalAgent()).toBeNull();
    localStorage.setItem('chardesk.local-agent.pairing', JSON.stringify({ url, scope, expiresAt: Date.now() - 1 }));
    restoreLocalAgent();
    expect(getRememberedLocalAgent()).toBeNull();
    expect(localStorage.getItem('chardesk.local-agent.pairing')).toBeNull();
  });

  it('retries a remembered connection after server loss but not after manual disconnect', async () => {
    vi.useFakeTimers();
    try {
      connectLocalAgent(url, true);
      Socket.instances[0].open();
      Socket.instances[0].receive({ method: 'paired', expiresAt: Date.now() + 60_000 });
      Socket.instances[0].close();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(Socket.instances).toHaveLength(2);
      disconnectLocalAgent();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(Socket.instances).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });
});

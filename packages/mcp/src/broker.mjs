import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat, unlink } from 'node:fs/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { loadCredentials, writePrivateJson } from './credentials.mjs';
import { BridgeRequests } from './requests.mjs';
import { BridgeError, BROKER_PROTOCOL_VERSION, MAX_MESSAGE_BYTES, permissionFor, readConfig } from './protocol.mjs';
import { toolNames } from './tools.mjs';
import { MCP_VERSION } from './version.mjs';

const json = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(value === undefined ? undefined : JSON.stringify(value));
};

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  let bytes = 0;
  request.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_MESSAGE_BYTES) reject(new BridgeError('invalid_request', 'Request exceeds the message limit.', 413));
    else chunks.push(chunk);
  });
  request.once('error', reject);
  request.once('end', () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
    catch { reject(new BridgeError('invalid_request', 'Expected a JSON tool request.', 400)); }
  });
});

async function resolveSourceRef(name, input) {
  if (!['canvas_write', 'canvas_render'].includes(name) || input.sourceRef === undefined) return input;
  if (typeof input.sourceRef !== 'string' || !input.sourceRef) throw new BridgeError('invalid_request', 'sourceRef must be a non-empty local file path.', 400);
  const key = name === 'canvas_write' ? 'content' : 'source';
  if (input[key] !== undefined) throw new BridgeError('invalid_request', `Provide either ${key} or sourceRef, not both.`, 400);
  let content;
  try {
    const file = await stat(input.sourceRef);
    if (!file.isFile()) throw new BridgeError('invalid_request', 'sourceRef must identify a regular text file.', 400);
    if (file.size > MAX_MESSAGE_BYTES) throw new BridgeError('invalid_request', 'sourceRef exceeds the message limit.', 413);
    content = await readFile(input.sourceRef, 'utf8');
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw new BridgeError('invalid_request', `Unable to read sourceRef: ${error.message}`, 400);
  }
  const { sourceRef: _sourceRef, ...rest } = input;
  return { ...rest, [key]: content };
}

export async function startBroker({ config = readConfig(), idleMs = 30_000, timeoutFor, limits, version = MCP_VERSION } = {}) {
  const instanceId = randomUUID();
  const origins = new Set(config.origins);
  let credentials;
  let state = 'starting';
  let page;
  let pageGrant;
  let pageReady = false;
  let canvasOpenAttempted = false;
  let idleTimer;
  let stopping;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const event = (name, details = {}) => {
    if (config.debug) console.error(JSON.stringify({ event: `mcp.${name}`, instanceId, at: new Date().toISOString(), ...details }));
  };
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const refreshIdle = () => {
    clearTimeout(idleTimer);
    if (state === 'ready' && !page && requests.status.activeRequests === 0) {
      idleTimer = setTimeout(() => { void stop(); }, idleMs);
    }
  };
  const requests = new BridgeRequests({ limits, timeoutFor, onChange: refreshIdle });
  const pairing = () => ({
    bridgeUrl: `ws://127.0.0.1:${http.address().port}/bridge?token=${credentials.token}`,
    pid: process.pid, instanceId, protocolVersion: BROKER_PROTOCOL_VERSION,
    version, expiresAt: credentials.expiresAt,
  });
  const publishPairing = () => writePrivateJson(config.pairingFile, pairing());
  const status = () => ({
    role: 'bridge', protocolVersion: BROKER_PROTOCOL_VERSION, version, instanceId,
    pid: process.pid, state, pageConnected: Boolean(page?.readyState === WebSocket.OPEN),
    pageAuthorized: Boolean(pageGrant), pageReady, ...requests.status,
  });
  const openCanvas = () => {
    if (!config.autoOpenCanvas || canvasOpenAttempted) return false;
    canvasOpenAttempted = true;
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', config.canvasUrl] : [config.canvasUrl];
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => event('canvas_open_failed'));
    child.unref();
    return true;
  };
  const checkPage = (name, input) => {
    if (Date.now() >= credentials.expiresAt) throw new BridgeError('pairing_expired', 'Pairing expired. Restart Local MCP.');
    if (!page || page.readyState !== WebSocket.OPEN) {
      const opened = openCanvas();
      throw new BridgeError('page_unavailable', opened
        ? `Canvas page is not connected. Opened ${config.canvasUrl}; retry after it loads.`
        : `Canvas page is not connected. Open ${config.canvasUrl} and retry.`);
    }
    if (!pageGrant) throw new BridgeError('page_unauthorized', 'Canvas page is not authorized.', 403);
    const permission = permissionFor(name, input);
    if (!pageGrant.permissions[permission]) throw new BridgeError('permission_denied', `Permission denied: canvas.${permission}`, 403);
    if (pageGrant.scope === 'canvas' && input.canvasId !== undefined && input.canvasId !== pageGrant.canvasId) {
      throw new BridgeError('permission_denied', 'Canvas authorization is limited to the paired Canvas.', 403);
    }
    if (!pageReady) throw new BridgeError('page_unavailable', 'Canvas page is not ready. Retry after it finishes loading.');
    if (page.bufferedAmount > MAX_MESSAGE_BYTES) throw new BridgeError('bridge_busy', 'Bridge is busy.', 429);
  };

  const handle = async (request, response) => {
    response.on('error', () => {});
    if (request.headers.host !== `127.0.0.1:${http.address().port}`) throw new BridgeError('permission_denied', 'Invalid bridge host.', 403);
    if (request.method === 'GET' && request.url === '/health') { json(response, 200, status()); return; }
    if (request.method === 'GET' && request.url === '/discover' && origins.has(request.headers.origin)) {
      response.setHeader('access-control-allow-origin', request.headers.origin);
      json(response, 200, { bridgeUrl: `ws://127.0.0.1:${http.address().port}/bridge` });
      return;
    }
    if (request.method !== 'POST' || !['/agent/call', '/shutdown', '/revoke'].includes(request.url)) {
      throw new BridgeError('invalid_request', 'Unknown bridge endpoint.', 404);
    }
    if (!credentials || request.headers.origin || request.headers.authorization !== `Bearer ${credentials.token}`) {
      throw new BridgeError('permission_denied', 'Local MCP authentication required.', 403);
    }
    if (request.headers['x-chardesk-instance-id'] && request.headers['x-chardesk-instance-id'] !== instanceId) {
      throw new BridgeError('bridge_replaced', 'Local MCP bridge was already replaced.', 409);
    }
    if (state !== 'ready') throw new BridgeError('bridge_unavailable', 'Local MCP bridge is stopping.');
    if (request.url === '/shutdown') {
      json(response, 202, { stopping: true });
      void stop();
      return;
    }
    if (request.url === '/revoke') {
      await unlink(config.credentialsFile).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      credentials = await loadCredentials(config.credentialsFile);
      pageGrant = undefined;
      pageReady = false;
      requests.failAll(new BridgeError('permission_denied', 'Pairing revoked.', 403));
      page?.close(1000, 'Pairing revoked');
      await publishPairing();
      json(response, 204);
      return;
    }
    const controller = new AbortController();
    const abort = () => { if (!response.writableFinished) controller.abort(); };
    response.once('close', abort);
    try {
      const body = await readBody(request);
      const { clientId, name, input } = body || {};
      if (typeof clientId !== 'string' || !/^[a-f0-9-]{36}$/i.test(clientId) || !toolNames.has(name)
        || !input || typeof input !== 'object' || Array.isArray(input)) {
        throw new BridgeError('invalid_request', 'Invalid Canvas tool request.', 400);
      }
      const result = await requests.run(clientId, name, input, controller.signal, async (entry) => {
        const resolved = await resolveSourceRef(name, input);
        if (entry.settled) return;
        checkPage(name, resolved);
        const message = JSON.stringify({ id: entry.id, method: 'call', params: { name, input: resolved } });
        if (Buffer.byteLength(message) > MAX_MESSAGE_BYTES) throw new BridgeError('invalid_request', 'Resolved request exceeds the message limit.', 413);
        entry.forwarded = true;
        page.send(message, (error) => {
          if (error) entry.finish(new BridgeError('page_unavailable', 'Canvas connection failed.'), undefined, true);
        });
      });
      json(response, 200, { result });
    } finally { response.off('close', abort); }
  };
  const http = createServer({ requestTimeout: 5000, headersTimeout: 5000 }, (request, response) => {
    void handle(request, response).catch((error) => {
      const failure = error instanceof BridgeError ? error : new BridgeError('bridge_unavailable', 'Local MCP request failed.');
      json(response, failure.status, { error: { code: failure.code, message: failure.message } });
    });
  });
  http.on('upgrade', (request, socket, head) => {
    let url;
    try { url = new URL(request.url, 'http://127.0.0.1'); }
    catch { socket.destroy(); return; }
    const refuse = (code, reason) => socket.end(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
    if (url.pathname === '/agent') { refuse(426, 'Upgrade MCP and restart'); return; }
    if (state !== 'ready' || request.headers.host !== `127.0.0.1:${http.address().port}`
      || url.pathname !== '/bridge' || !origins.has(request.headers.origin)
      || (url.searchParams.has('token') && url.searchParams.get('token') !== credentials.token)
      || Date.now() >= credentials.expiresAt) { refuse(403, 'Forbidden'); return; }
    if (page) { refuse(409, 'Canvas page already connected'); return; }
    sockets.handleUpgrade(request, socket, head, setupBrowser);
  });

  function setupBrowser(client) {
    page = client;
    pageGrant = undefined;
    pageReady = false;
    refreshIdle();
    event('browser_connected');
    client.send(JSON.stringify({ method: 'paired', expiresAt: credentials.expiresAt }));
    client.on('error', () => client.terminate());
    client.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.method === 'revoke') {
          pageGrant = undefined;
          pageReady = false;
          requests.failAll(new BridgeError('permission_denied', 'Pairing revoked.', 403));
          client.close(1000, 'Pairing revoked');
          return;
        }
        if (message.method === 'authorize') {
          const grant = message.grant;
          const permissions = grant?.permissions;
          const valid = permissions && ['inspect', 'read', 'search', 'write'].every((key) => typeof permissions[key] === 'boolean')
            && ['application', 'canvas'].includes(grant.scope)
            && (grant.scope !== 'canvas' || (typeof grant.canvasId === 'string' && grant.canvasId));
          if (!valid) { client.send(JSON.stringify({ method: 'authorization_denied' })); client.close(1008, 'Invalid authorization grant'); return; }
          pageGrant = { scope: grant.scope, canvasId: grant.canvasId, permissions: { ...permissions } };
          pageReady = false;
          event('browser_authorized', { scope: grant.scope });
          client.send(JSON.stringify({ method: 'authorized' }));
          client.send(JSON.stringify({ method: 'ready_probe' }));
          return;
        }
        if (message.method === 'ready') {
          if (message.protocolVersion !== undefined && message.protocolVersion !== 1) { client.close(1002, 'Unsupported Canvas bridge protocol'); return; }
          pageReady = true;
          event('browser_ready');
          return;
        }
        if (message.method === 'runtime_status' && message.status) {
          pageReady = !['booting', 'unavailable'].includes(message.status.status);
          return;
        }
        requests.reply(message.id, message.result, typeof message.error === 'string' ? message.error : undefined);
      } catch { client.close(1003, 'Invalid bridge message'); }
    });
    client.on('close', (code, reason) => {
      if (page !== client) return;
      page = undefined;
      pageGrant = undefined;
      pageReady = false;
      event('browser_closed', { code, reason: reason.toString() });
      requests.failAll(new BridgeError('page_unavailable', 'Canvas page disconnected.'));
      refreshIdle();
    });
  }

  function stop() {
    if (stopping) return stopping;
    state = 'stopping';
    clearTimeout(idleTimer);
    event('bridge_stopping');
    stopping = (async () => {
      const deadline = Date.now() + 750;
      while (requests.status.activeRequests && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
      requests.failAll(new BridgeError('bridge_unavailable', 'Local MCP bridge stopped.'));
      for (const socket of sockets.clients) socket.terminate();
      // Keep the elected port until owned metadata is removed, so a replacement
      // cannot publish a new record between our instance check and unlink.
      try {
        const saved = JSON.parse(await readFile(config.pairingFile, 'utf8'));
        if (saved.instanceId === instanceId) await unlink(config.pairingFile);
      } catch (error) { if (error.code !== 'ENOENT') event('pairing_cleanup_failed'); }
      await Promise.all([
        new Promise((resolve) => sockets.close(resolve)),
        new Promise((resolve) => { http.close(resolve); http.closeAllConnections(); }),
      ]);
      resolveClosed();
    })();
    return stopping;
  }

  // Binding is the singleton election. Losing candidates never touch shared files.
  try {
    await new Promise((resolve, reject) => { http.once('error', reject); http.listen(config.port, '127.0.0.1', resolve); });
    credentials = await loadCredentials(config.credentialsFile);
    await publishPairing();
    state = 'ready';
    refreshIdle();
    event('bridge_ready', { port: http.address().port });
    return { get pairing() { return pairing(); }, status, stop, closed };
  } catch (error) {
    if (http.listening) await stop();
    else sockets.close();
    throw error;
  }
}

// Minimal frozen v1 lifecycle: authenticated Agent WS, owner PID metadata, no
// HTTP shutdown, and cleanup after releasing the port. No Canvas mutations.
import { createServer } from 'node:http';
import { readFile, unlink } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { loadCredentials, writePrivateJson } from '../../src/credentials.mjs';
import { readConfig } from '../../src/protocol.mjs';

const config = readConfig();
const credentials = await loadCredentials(config.credentialsFile);
const http = createServer((_request, response) => response.end(JSON.stringify({
  role: 'bridge', clients: 16, pageConnected: true, pageAuthorized: true, pageReady: true,
})));
const sockets = new WebSocketServer({ noServer: true });
http.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname !== '/agent' || url.searchParams.get('token') !== credentials.token) { socket.destroy(); return; }
  sockets.handleUpgrade(request, socket, head, (ws) => ws.on('error', () => {}));
});
await new Promise((resolve) => http.listen(config.port, '127.0.0.1', resolve));
await writePrivateJson(config.pairingFile, {
  bridgeUrl: `ws://127.0.0.1:${config.port}/bridge?token=${credentials.token}`,
  pid: process.pid, expiresAt: credentials.expiresAt,
});
process.once('SIGTERM', async () => {
  for (const socket of sockets.clients) socket.terminate();
  await new Promise((resolve) => http.close(resolve));
  // Delayed legacy cleanup must finish before a successor publishes metadata.
  await new Promise((resolve) => setTimeout(resolve, 100));
  try {
    const saved = JSON.parse(await readFile(config.pairingFile, 'utf8'));
    if (saved.pid === process.pid) await unlink(config.pairingFile);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  process.exit(0);
});

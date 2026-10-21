import { spawn } from 'node:child_process';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { requestJson } from './http.mjs';
import { BridgeError, BROKER_PROTOCOL_VERSION, cancelled, incompatible } from './protocol.mjs';
import { needsUpgrade, stopBroker } from './upgrade.mjs';

const readPairing = async (file) => {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
};

export async function inspectBroker(config, { signal, control = false } = {}) {
  if (signal?.aborted) throw cancelled();
  let pairing = await readPairing(config.pairingFile);
  let savedUrl;
  try { savedUrl = new URL(pairing?.bridgeUrl); } catch { /* No valid saved broker. */ }
  const validUrl = savedUrl?.protocol === 'ws:' && savedUrl.hostname === '127.0.0.1'
    && savedUrl.pathname === '/bridge' && !savedUrl.username && !savedUrl.password && !savedUrl.hash;
  const port = config.port || (validUrl ? Number(savedUrl.port) : 0);
  if (!port) return null;
  const baseUrl = `http://127.0.0.1:${port}`;
  let result;
  try { result = await requestJson(`${baseUrl}/health`, { signal, timeout: 250 }); }
  catch (error) {
    if (signal?.aborted) throw cancelled();
    if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(error.code)) return null;
    if (error.code === 'request_timeout') throw new BridgeError('bridge_unavailable', 'The local bridge port is not responding. Stop the old bridge or check the configured port.');
    throw incompatible();
  }
  const health = result.body;
  const legacy = health?.protocolVersion === undefined && Number.isInteger(health?.clients)
    && ['pageConnected', 'pageAuthorized', 'pageReady'].every((key) => typeof health[key] === 'boolean');
  if (result.status !== 200 || health?.role !== 'bridge'
    || (health.protocolVersion !== BROKER_PROTOCOL_VERSION && !legacy)) throw incompatible();
  if (legacy && !control) throw incompatible();
  if (health.state === 'starting') return null;
  if (!legacy && health.state !== 'ready' && !(control && health.state === 'stopping')) throw new BridgeError('bridge_unavailable', 'Local MCP bridge is stopping. Retry after it exits.');
  pairing = await readPairing(config.pairingFile);
  try { savedUrl = new URL(pairing?.bridgeUrl); } catch { savedUrl = undefined; }
  if (savedUrl?.protocol !== 'ws:' || savedUrl.hostname !== '127.0.0.1' || savedUrl.pathname !== '/bridge'
    || savedUrl.username || savedUrl.password || savedUrl.hash || Number(savedUrl.port) !== port
    || !Number.isSafeInteger(pairing.pid) || pairing.pid <= 1
    || (!legacy && (pairing.instanceId !== health.instanceId || pairing.pid !== health.pid
      || pairing.protocolVersion !== BROKER_PROTOCOL_VERSION || pairing.version !== health.version))) {
    throw new BridgeError('bridge_unavailable', 'Local MCP connection metadata does not match the running bridge. Check CHARDESK_MCP_PAIRING and restart Local MCP.');
  }
  if (!control && (!Number.isFinite(pairing.expiresAt) || pairing.expiresAt <= Date.now())) throw new BridgeError('pairing_expired', 'Local MCP pairing expired. Restart the bridge.');
  const token = savedUrl.searchParams.get('token');
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw new BridgeError('permission_denied', 'Invalid Local MCP credentials.', 403);
  if (!control && needsUpgrade({ health, pairing, legacy })) throw incompatible();
  return { baseUrl, pairing, health, legacy, headers: { authorization: `Bearer ${token}` } };
}

async function spawnBroker(config) {
  const logFile = `${config.pairingFile}.log`;
  await mkdir(dirname(logFile), { recursive: true, mode: 0o700 });
  const log = await open(logFile, 'a', 0o600);
  try {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./broker-process.mjs', import.meta.url))], {
      detached: true, stdio: ['ignore', 'ignore', log.fd], windowsHide: true,
      env: {
        ...process.env,
        CHARDESK_MCP_PORT: String(config.port), CHARDESK_MCP_PAIRING: config.pairingFile,
        CHARDESK_MCP_CREDENTIALS: config.credentialsFile, CHARDESK_MCP_ORIGINS: config.origins.join(','),
        CHARDESK_CANVAS_URL: config.canvasUrl, CHARDESK_MCP_OPEN_CANVAS: config.autoOpenCanvas ? '1' : '0',
        CHARDESK_MCP_DEBUG: config.debug ? '1' : '0',
      },
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
  } finally { await log.close(); }
}

async function ensureBroker(config, { signal, startupMs = 5000 } = {}) {
  const deadline = Date.now() + startupMs;
  let spawned = false;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const broker = await inspectBroker(config, { signal, control: true });
      if (broker) {
        if (!needsUpgrade(broker)) return broker;
        await stopBroker(broker, config, signal);
        spawned = false;
        continue;
      }
      if (signal?.aborted) throw cancelled();
      if (!spawned) { await spawnBroker(config); spawned = true; }
      lastError = undefined;
    } catch (error) {
      if (signal?.aborted) throw cancelled();
      if (!['bridge_unavailable', 'bridge_upgrade_blocked'].includes(error.code)) throw error;
      lastError = error;
    }
    try { await delay(50, undefined, { signal }); }
    catch { throw cancelled(); }
  }
  throw lastError || new BridgeError('bridge_unavailable', `Local MCP bridge did not become ready within ${startupMs}ms. See ${config.pairingFile}.log.`);
}

export class BrokerConnection {
  #attempt;
  constructor(config, signal) { this.config = config; this.signal = signal; }

  ensure(signal) {
    if (signal?.aborted || this.signal.aborted) return Promise.reject(cancelled());
    if (!this.#attempt) {
      const attempt = ensureBroker(this.config, { signal: this.signal });
      this.#attempt = attempt;
      const clear = () => { if (this.#attempt === attempt) this.#attempt = undefined; };
      attempt.then(clear, clear);
    }
    const attempt = this.#attempt;
    if (!signal) return attempt;
    return new Promise((resolve, reject) => {
      const abort = () => reject(cancelled());
      signal.addEventListener('abort', abort, { once: true });
      attempt.then((value) => { signal.removeEventListener('abort', abort); resolve(value); },
        (error) => { signal.removeEventListener('abort', abort); reject(error); });
    });
  }
}

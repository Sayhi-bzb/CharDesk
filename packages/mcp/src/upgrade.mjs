import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { link, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import WebSocket from 'ws';
import { requestJson } from './http.mjs';
import { BridgeError, cancelled, incompatible } from './protocol.mjs';
import { MCP_VERSION } from './version.mjs';

const execute = promisify(execFile);
const upgradeBlocked = () => new BridgeError('bridge_upgrade_blocked',
  'Cannot safely retire the old Local MCP bridge. Stop it manually, then retry with the updated MCP package.');

// Published releases use stable versions. Unknown version formats never authorize a takeover.
export function needsUpgrade({ health, pairing, legacy }) {
  if (legacy || health.state === 'stopping') return true;
  const installed = /^(\d+)\.(\d+)\.(\d+)$/.exec(MCP_VERSION)?.slice(1).map(Number);
  const running = /^(\d+)\.(\d+)\.(\d+)$/.exec(health.version)?.slice(1).map(Number);
  if (!installed || !running) throw incompatible();
  const expired = !Number.isFinite(pairing.expiresAt) || pairing.expiresAt <= Date.now();
  for (let i = 0; i < 3; i += 1) {
    if (running[i] !== installed[i]) {
      if (running[i] > installed[i] && expired) {
        throw new BridgeError('pairing_expired', 'The newer Local MCP bridge pairing expired. Restart it with the updated MCP package.');
      }
      return running[i] < installed[i];
    }
  }
  return expired;
}

async function legacyIdentity(pid, port, signal) {
  const options = { timeout: 750, signal, maxBuffer: 64 * 1024 };
  const { stdout: identity } = await execute('ps', ['-p', String(pid), '-o', 'uid=', '-o', 'lstart=', '-o', 'comm='], options);
  const fields = identity.trim().split(/\s+/);
  if (Number(fields[0]) !== process.getuid() || !['node', 'nodejs'].includes(basename(fields.slice(6).join(' ')))) throw upgradeBlocked();
  const { stdout: listener } = await execute(process.platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof',
    ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-Fpn'], options);
  if (!listener.split('\n').includes(`p${pid}`) || !listener.split('\n').includes(`n127.0.0.1:${port}`)) throw upgradeBlocked();
  return identity;
}

async function authenticateLegacy(broker, signal) {
  const url = new URL(broker.pairing.bridgeUrl);
  url.pathname = '/agent';
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { handshakeTimeout: 750 });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      socket.terminate();
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(cancelled());
    socket.once('error', finish);
    socket.once('open', () => finish());
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

async function stopLegacy(broker, config, signal) {
  if (!['darwin', 'linux'].includes(process.platform) || !process.getuid || broker.pairing.pid === process.pid) throw upgradeBlocked();
  try {
    for (const file of [config.pairingFile, config.credentialsFile]) {
      const info = await stat(file);
      if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077)) throw upgradeBlocked();
    }
    const credentials = JSON.parse(await readFile(config.credentialsFile, 'utf8'));
    if (broker.headers.authorization !== `Bearer ${credentials.token}`) throw upgradeBlocked();
    const pid = broker.pairing.pid;
    const port = new URL(broker.baseUrl).port;
    const identity = await legacyIdentity(pid, port, signal);
    await authenticateLegacy(broker, signal);
    const saved = JSON.parse(await readFile(config.pairingFile, 'utf8'));
    if (saved.pid !== pid || saved.bridgeUrl !== broker.pairing.bridgeUrl
      || identity !== await legacyIdentity(pid, port, signal)) throw upgradeBlocked();
    const fingerprint = createHash('sha256').update(identity).digest('hex').slice(0, 16);
    const marker = `${config.pairingFile}.upgrade-${pid}-${fingerprint}`;
    const temporary = `${marker}.${randomUUID()}.tmp`;
    let claimed = false;
    try {
      // A complete, process-specific claim makes SIGTERM single-shot even when
      // multiple adapters upgrade together or the first upgrader is cancelled.
      if (signal?.aborted) throw cancelled();
      await writeFile(temporary, JSON.stringify({ pid: process.pid }), { mode: 0o600 });
      try { await link(temporary, marker); claimed = true; }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    } finally { await unlink(temporary).catch(() => {}); }
    if (claimed) process.kill(pid, 'SIGTERM');
    // Legacy cleanup runs after releasing the port. Wait for process exit before
    // publishing a replacement record, so it cannot remove the new metadata.
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      try { process.kill(pid, 0); }
      catch (error) {
        if (error.code !== 'ESRCH') throw error;
        await unlink(marker).catch(() => {});
        return;
      }
      await delay(25, undefined, { signal });
    }
    throw new BridgeError('bridge_upgrade_failed', 'The old Local MCP bridge did not exit after SIGTERM. No replacement was started; stop it manually.');
  } catch (error) {
    if (signal?.aborted) throw cancelled();
    if (error.code === 'bridge_upgrade_failed') throw error;
    if (error.code === 'ESRCH' || error.code === 'ENOENT') {
      // A concurrent upgrader may already have retired this exact process.
      try { process.kill(broker.pairing.pid, 0); }
      catch (gone) { if (gone.code === 'ESRCH') return; }
    }
    throw upgradeBlocked();
  }
}

export async function stopBroker(broker, config, signal) {
  if (signal?.aborted) throw cancelled();
  if (broker.legacy) { await stopLegacy(broker, config, signal); return; }
  if (broker.health.state === 'stopping') { await delay(50, undefined, { signal }); return; }
  try {
    const response = await requestJson(`${broker.baseUrl}/shutdown`, {
      method: 'POST', headers: { ...broker.headers, 'x-chardesk-instance-id': broker.health.instanceId }, signal,
    });
    if (response.status === 409) return; // Another adapter already replaced this instance.
    if (response.status !== 202) throw upgradeBlocked();
  } catch (error) {
    if (signal?.aborted) throw cancelled();
    if (!['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(error.code)) throw error;
  }
  await delay(50, undefined, { signal });
}

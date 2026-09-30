import { readFile, unlink } from 'node:fs/promises';

const file = '.pi/chardesk-bridge.local.json';
try {
  const pairing = JSON.parse(await readFile(file, 'utf8'));
  let running = false;
  try { process.kill(pairing.pid, 0); running = true; } catch { /* Server stopped. */ }
  if (running) {
    const url = new URL(pairing.bridgeUrl);
    if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1') throw new Error('Invalid local pairing URL.');
    const response = await fetch(`http://127.0.0.1:${url.port}/revoke`, {
      method: 'POST', headers: { authorization: `Bearer ${url.searchParams.get('token')}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Revocation failed (${response.status}).`);
    console.log('Pairing revoked. Run npm run mcp:pair to pair again.');
  } else {
    await unlink(`${file}.credentials`).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    console.log('Pairing revoked. Restart Pi to pair again.');
  }
} catch (error) {
  if (error.code === 'ENOENT') {
    await unlink(`${file}.credentials`).catch((failure) => { if (failure.code !== 'ENOENT') throw failure; });
    console.log('Pairing revoked. Start Pi to pair again.');
  } else {
    console.error(error.message);
    process.exitCode = 1;
  }
}

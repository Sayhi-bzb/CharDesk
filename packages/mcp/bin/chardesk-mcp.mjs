#!/usr/bin/env node
import { readFile, unlink } from 'node:fs/promises';
import { pairingPath, credentialsPath } from '../src/paths.mjs';

const command = process.argv[2] || 'server';
if (command === 'server') {
  await import('../src/server.mjs');
} else if (command === 'pair') {
  try {
    const pairing = JSON.parse(await readFile(pairingPath(), 'utf8'));
    process.kill(pairing.pid, 0);
    console.log(pairing.bridgeUrl);
  } catch {
    console.error('Start the MCP server through your coding agent first.'); process.exitCode = 1;
  }
} else if (command === 'revoke') {
  try {
    const pairing = JSON.parse(await readFile(pairingPath(), 'utf8'));
    process.kill(pairing.pid, 0);
    const response = await fetch(pairing.bridgeUrl.replace(/\/bridge\?token=.*$/, '/revoke'), {
      method: 'POST',
      headers: { authorization: `Bearer ${new URL(pairing.bridgeUrl).searchParams.get('token')}` },
    });
    if (!response.ok) throw new Error(`MCP server returned ${response.status}.`);
    console.log('Pairing revoked.');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') {
      await unlink(credentialsPath()).catch((unlinkError) => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      });
      console.log('No running pairing found.');
    } else throw error;
  }
} else {
  console.error('Usage: chardesk-mcp [server|pair|revoke]'); process.exitCode = 1;
}

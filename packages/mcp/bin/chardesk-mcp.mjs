#!/usr/bin/env node
import { unlink } from 'node:fs/promises';
import { inspectBroker } from '../src/bootstrap.mjs';
import { requestJson } from '../src/http.mjs';
import { readConfig } from '../src/protocol.mjs';

const command = process.argv[2] || 'server';
try {
  if (command === 'server') {
    await import('../src/server.mjs');
  } else if (command === 'pair' || command === 'revoke' || command === 'bridge') {
    const config = readConfig();
    const action = command === 'bridge' ? process.argv[3] : command;
    if (!['pair', 'revoke', 'status', 'stop'].includes(action)) throw new Error('Usage: chardesk-mcp bridge [status|stop]');
    const broker = await inspectBroker(config, { control: action !== 'pair' });
    if (action === 'status') {
      console.log(JSON.stringify(broker?.health || { role: 'bridge', state: 'stopped' }));
    } else if (action === 'revoke' && !broker) {
      await unlink(config.credentialsFile).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      console.log('No running pairing found.');
    } else if (action === 'stop' && !broker) {
      console.log('Local MCP bridge is stopped.');
    } else {
      if (!broker) throw new Error('Start the MCP server through your coding agent first.');
      if (action === 'pair') console.log(broker.pairing.bridgeUrl);
      else {
        const response = await requestJson(`${broker.baseUrl}/${action === 'stop' ? 'shutdown' : 'revoke'}`, { method: 'POST', headers: broker.headers });
        if (response.status >= 400) throw new Error(response.body?.error?.message || `Bridge returned ${response.status}.`);
        console.log(action === 'stop' ? 'Local MCP bridge is stopping.' : 'Pairing revoked.');
      }
    }
  } else throw new Error('Usage: chardesk-mcp [server|pair|revoke|bridge status|bridge stop]');
} catch (error) {
  console.error(`[${error.code || 'bridge_unavailable'}] ${error.message}`);
  process.exitCode = 1;
}

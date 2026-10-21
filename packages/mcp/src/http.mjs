import { request } from 'node:http';
import { BridgeError, cancelled, MAX_MESSAGE_BYTES } from './protocol.mjs';

// No pooled idle sockets: a completed call must not keep its stdio process alive.
export const requestJson = (url, { method = 'GET', headers, body, signal, timeout = 5000 } = {}) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request(url, {
      method, agent: false,
      headers: { ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers },
    });
    const timer = setTimeout(() => req.destroy(new BridgeError('request_timeout', 'Local MCP request timed out.', 504)), timeout);
    const abort = () => req.destroy(cancelled());
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    req.on('error', (error) => { cleanup(); reject(error); });
    req.on('response', (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_MESSAGE_BYTES) req.destroy(new BridgeError('invalid_response', 'Local MCP response exceeds the message limit.', 502));
        else chunks.push(chunk);
      });
      response.on('error', (error) => { cleanup(); reject(error); });
      response.on('end', () => {
        cleanup();
        try {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null });
        } catch { reject(new BridgeError('invalid_response', 'Local MCP returned an invalid response.', 502)); }
      });
    });
    req.end(data);
  });

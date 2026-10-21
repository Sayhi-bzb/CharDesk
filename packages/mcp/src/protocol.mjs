import { credentialsPath, pairingPath } from './paths.mjs';

export const BROKER_PROTOCOL_VERSION = 2;
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const REQUEST_LIMITS = Object.freeze({ global: 128, perCaller: 32 });
export const requestTimeout = (name) => name === 'canvas_code' ? 30_000 : 10_000;
export const permissionFor = (name, input) => name === 'canvas_read' ? 'read'
  : name === 'canvas_search' ? 'search'
    : name === 'canvas_manage' && ['list', 'list_pages'].includes(input?.action) ? 'inspect' : 'write';
export const isWrite = (name, input) => permissionFor(name, input) === 'write';

export class BridgeError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.status = status;
  }
}

export const cancelled = () => new BridgeError('request_cancelled', 'Canvas request cancelled.', 499);
export const unknownExecution = (cause) => new BridgeError('execution_unknown',
  `${cause} The write may already have executed. Inspect the Canvas before retrying; it was not replayed.`, 502);
export const incompatible = () => new BridgeError('bridge_incompatible',
  'An incompatible CharDesk MCP bridge is running. Upgrade all local MCP clients, stop the old MCP processes, and restart them.');

export const readConfig = (env = process.env) => {
  const port = Number(env.CHARDESK_MCP_PORT || 9494);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid CHARDESK_MCP_PORT.');
  return {
    port,
    credentialsFile: env.CHARDESK_MCP_CREDENTIALS || credentialsPath(),
    pairingFile: env.CHARDESK_MCP_PAIRING || pairingPath(),
    origins: (env.CHARDESK_MCP_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,https://canvas.chardesk.com').split(','),
    canvasUrl: env.CHARDESK_CANVAS_URL || 'https://canvas.chardesk.com',
    autoOpenCanvas: env.CHARDESK_MCP_OPEN_CANVAS !== '0',
    debug: env.CHARDESK_MCP_DEBUG === '1',
  };
};

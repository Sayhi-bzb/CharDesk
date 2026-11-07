import { spawn } from 'node:child_process';
/** The Node MCP adapter delegates local execution to the installed Bun application. */
export function callLocal(name, input, signal) {
  return new Promise((resolve, reject) => {
    const { canvasId, ...parameters } = input;
    const child = spawn(process.env.CHARDESK_BINARY || 'chardesk', ['canvas', name.replace(/^canvas_/, ''), ...(canvasId ? ['--session', canvasId] : []), '--json'], { stdio: ['pipe', 'pipe', 'pipe'], signal });
    let output = '', size = 0;
    child.stdout.on('data', data => { size += data.length; if(size > 1024*1024) child.kill(); else output += data; });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', () => { try { resolve(JSON.parse(output)); } catch { reject(new Error('Local CharDesk is unavailable or returned an invalid result. Install the Bun application and configure CHARDESK_BINARY.')); } });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(parameters));
  });
}

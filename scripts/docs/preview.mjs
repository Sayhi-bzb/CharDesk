import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/docs/dist');
const port = Number(process.env.DOCS_PREVIEW_PORT ?? 5176);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.data': 'text/x-script', '.xml': 'application/xml', '.txt': 'text/plain', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const filename = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (filename !== root && !filename.startsWith(root + path.sep)) throw new Error('Invalid path');
    const info = await stat(filename);
    const target = info.isDirectory() ? path.join(filename, 'index.html') : filename;
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] ?? (url.pathname === '/api/search' ? 'application/json' : 'text/plain; charset=utf-8') });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(path.join(root, '404.html')));
  }
}).listen(port, '127.0.0.1', () => console.log(`Product manual preview: http://127.0.0.1:${port}`));

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const generatedRoot = resolve(root, 'dist');
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : `${pathname.slice(1)}${pathname.endsWith('/') ? 'index.html' : ''}`;
    for (const base of [root, generatedRoot]) {
      const path = resolve(base, relative);
      if (path !== base && !path.startsWith(`${base}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      try {
        const details = await stat(path);
        if (!details.isFile()) continue;
        const data = await readFile(path);
        response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(data);
        return;
      } catch { /* Try generated output. */ }
    }
    response.writeHead(404).end('Not found');
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Raccoon Chalet preview: http://127.0.0.1:${port}`));

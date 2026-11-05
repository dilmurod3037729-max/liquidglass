// Oddiy statik server (ES modullar file:// da ishlamaydi). Ishlatish: node scripts/serve.mjs  ->  http://localhost:5173/demo/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '');
  if (p.includes('..')) { res.writeHead(403).end(); return; }
  try {
    const f = p === '' ? 'demo/index.html' : /[\\/]$/.test(p) ? p + 'index.html' : p;
    const body = await readFile(join(root, f));
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end('topilmadi'); }
}).listen(5173, '127.0.0.1', () => console.log('http://localhost:5173/demo/'));

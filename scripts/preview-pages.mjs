import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.resolve(process.env.PAGES_OUTPUT || path.join(root, 'dist'));
const manifest = JSON.parse(await fs.readFile(path.join(directory, '.blosmile-pages-build.json'), 'utf8'));
const basePath = manifest.basePath || '';
const port = Number(process.env.PAGES_PREVIEW_PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PAGES_PREVIEW_PORT doit être un entier compris entre 1024 et 65535.');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.pdf': 'application/pdf', '.vcf': 'text/vcard; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const send = async (filename, status = 200) => {
    const stat = await fs.stat(filename);
    res.writeHead(status, { 'Content-Type': mime[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  };
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { res.writeHead(400); res.end(); return; }
    if (basePath && pathname === basePath) { res.writeHead(308, { Location: basePath + '/' + url.search }); res.end(); return; }
    if (!pathname.startsWith(basePath + '/')) { await send(path.join(directory, '404.html'), 404); return; }
    const relative = pathname.slice(basePath.length + 1);
    if (relative.split('/').some(part => part.startsWith('.') || part.includes('\\'))) { res.writeHead(404); res.end(); return; }
    let filename = path.resolve(directory, relative);
    if (!filename.startsWith(directory + path.sep) && filename !== directory) { res.writeHead(404); res.end(); return; }
    try {
      const stat = await fs.stat(filename);
      if (stat.isDirectory()) {
        if (!pathname.endsWith('/')) { res.writeHead(308, { Location: url.pathname + '/' + url.search }); res.end(); return; }
        filename = path.join(filename, 'index.html');
      }
      await send(filename);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      await send(path.join(directory, '404.html'), 404);
    }
  } catch (error) {
    console.error('Aperçu statique :', error.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Aperçu GitHub Pages : http://127.0.0.1:${port}${basePath}/`));

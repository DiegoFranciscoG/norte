// Servidor mínimo que se comporta como GitHub Pages: publica <sitio> bajo una subruta y responde 404.html con estado 404.
// Solo para las pruebas de extremo a extremo (npm run e2e:pages). Uso: node scripts/serve-pages.mjs <sitio> <puerto> <ruta-base>
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const [siteArg, port, base] = process.argv.slice(2);
const site = resolve(siteArg);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.csv': 'text/csv; charset=utf-8',
};

function send(res, status, file) {
  res.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const file = path.startsWith(base) ? resolve(site, path.slice(base.length) || 'index.html') : '';
  if (file.startsWith(site + sep) && existsSync(file) && statSync(file).isFile()) send(res, 200, file);
  else send(res, 404, join(site, '404.html'));
}).listen(Number(port), '127.0.0.1');

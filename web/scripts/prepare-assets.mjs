// Copia el worker de pdf.js (y, en desarrollo, el índice local) dentro de public/: Angular solo sirve archivos del espacio de trabajo.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const worker = resolve(dirname(require.resolve('pdfjs-dist/package.json')), 'build', 'pdf.worker.min.mjs');
mkdirSync(resolve(web, 'public/assets/pdfjs'), { recursive: true });
cpSync(worker, resolve(web, 'public/assets/pdfjs/pdf.worker.min.mjs'));

if (process.argv.includes('--with-data')) {
  const data = resolve(web, '../site/data');
  if (existsSync(data)) cpSync(data, resolve(web, 'public/data'), { recursive: true });
  else console.warn('No hay índice local en site/data: ejecuta «npm run ingest:demo» o «npm run ingest».');
}

// Construye la web para GitHub Pages y la deja junto al índice en <sitio>. Lo usan la publicación y CI: lo que se prueba es lo que se publica.
// Uso: node web/scripts/build-pages.mjs <ruta-base> <sitio>     Ejemplo: node web/scripts/build-pages.mjs /norte/ site
// NORTE_API_URL (opcional): origen https de la API. Sin ella, la web funciona sin cuentas.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const WEB = resolve(dirname(SCRIPT), '..');
const ROOT = resolve(WEB, '..');
const DIST = join(WEB, 'dist/norte/browser');

export function checkBasePath(base) {
  if (typeof base !== 'string' || !/^\/([\w.-]+\/)*$/.test(base)) {
    throw new Error(`Ruta base no válida: «${base}». Debe empezar y terminar en / (ejemplo: /norte/).`);
  }
  return base;
}

/** Solo un origen https, o vacío si no hay API: el valor termina dentro de la CSP y de la configuración pública. */
export function checkApiUrl(raw) {
  const value = (raw ?? '').trim();
  if (value === '') return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('NORTE_API_URL no es una URL válida.');
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('NORTE_API_URL debe ser un origen https, sin ruta (ejemplo: https://norte-api.onrender.com).');
  }
  return url.origin;
}

/**
 * Pages no permite cabeceras propias, así que la CSP viaja en un <meta>. Se lee de la plantilla de nginx para que haya
 * una sola definición; frame-ancestors se quita porque los navegadores la ignoran dentro de un <meta>.
 */
export function cspFromTemplate(template, apiUrl) {
  const match = /add_header Content-Security-Policy "([^"]+)"/.exec(template);
  if (!match) throw new Error('No se encontró la CSP en la plantilla de nginx.');
  return match[1]
    .replace('${NORTE_API_URL}', apiUrl)
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive !== '' && !directive.startsWith('frame-ancestors'))
    .join('; ');
}

export function injectCsp(html, csp) {
  const charset = /<meta charset="utf-8"\s*\/?>/i;
  if (!charset.test(html)) throw new Error('index.html no tiene <meta charset="utf-8">.');
  return html.replace(charset, (tag) => `${tag}\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`);
}

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}

function main([baseArg, siteArg]) {
  const base = checkBasePath(baseArg);
  if (!siteArg) throw new Error('Falta la carpeta del sitio. Uso: build-pages.mjs <ruta-base> <sitio>');
  const site = resolve(ROOT, siteArg);
  const apiUrl = checkApiUrl(process.env['NORTE_API_URL']);

  // Un índice copiado antes para desarrollo no debe publicarse: el de verdad es el que ya está en <sitio>.
  rmSync(join(WEB, 'public/data'), { recursive: true, force: true });
  run('npm', ['run', 'build:core']);
  run('npm', ['run', 'build', '-w', '@norte/web', '--', '--base-href', base]);

  const indexPath = join(DIST, 'index.html');
  const built = readFileSync(indexPath, 'utf8');
  if (!built.includes(`<base href="${base}">`)) throw new Error(`El build no aplicó la ruta base ${base}.`);
  const html = injectCsp(built, cspFromTemplate(readFileSync(join(WEB, 'nginx/default.conf.template'), 'utf8'), apiUrl));
  writeFileSync(indexPath, html);

  // index.html cambió: el service worker rechazaría el archivo si su hash no coincide con el del manifiesto.
  const manifestPath = join(DIST, 'ngsw.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const key = `${base}index.html`;
  if (!(key in manifest.hashTable)) throw new Error(`${key} no está en el manifiesto del service worker.`);
  manifest.hashTable[key] = createHash('sha1').update(html).digest('hex');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const configPath = join(DIST, 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  writeFileSync(configPath, `${JSON.stringify({ ...config, apiBaseUrl: apiUrl }, null, 2)}\n`);

  cpSync(DIST, site, { recursive: true });
  // Pages responde 404.html a cualquier ruta que no sea un archivo: así funcionan los enlaces directos a /vacante/… u /observatorio.
  copyFileSync(join(site, 'index.html'), join(site, '404.html'));
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT) main(process.argv.slice(2));

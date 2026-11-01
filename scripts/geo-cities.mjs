// Genera data/geo/cities.json desde GeoNames (cities15000, CC BY 4.0) y la lista completa de países con nombres
// en español e inglés (CLDR vía Intl.DisplayNames). Se ejecuta una vez y el resultado se versiona:
//   node scripts/geo-cities.mjs
// Las ciudades sirven para resolver el país de una vacante («Berlin» → DE) y, en el navegador,
// para encontrar la ciudad más cercana a la ubicación de la persona sin enviarla a ningún servidor.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const SOURCE = 'https://download.geonames.org/export/dump/cities15000.zip';
const MIN_POPULATION = 100_000;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const geoDir = resolve(root, 'data/geo');

/** Lee la única entrada de un .zip (formato PKZIP) sin dependencias. */
function unzipSingle(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('No es un archivo zip');
  const central = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(central) !== 0x02014b50) throw new Error('Directorio central inválido');
  const method = buf.readUInt16LE(central + 10);
  const compressed = buf.readUInt32LE(central + 20);
  const local = buf.readUInt32LE(central + 42);
  const nameLen = buf.readUInt16LE(local + 26);
  const extraLen = buf.readUInt16LE(local + 28);
  const data = buf.subarray(local + 30 + nameLen + extraLen, local + 30 + nameLen + extraLen + compressed);
  return method === 0 ? data : inflateRawSync(data);
}

const res = await fetch(SOURCE, { headers: { 'User-Agent': 'NORTE-geo/1.0 (portafolio; datos abiertos)' } });
if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${SOURCE}`);
const lastModified = res.headers.get('last-modified');
const text = unzipSingle(Buffer.from(await res.arrayBuffer())).toString('utf8');

// Columnas de la tabla «geoname»: 1 name, 2 asciiname, 4 latitude, 5 longitude, 7 feature code, 8 country code, 14 population.
const rows = [];
const codes = new Set();
for (const line of text.split('\n')) {
  const c = line.split('\t');
  if (c.length < 15) continue;
  const population = Number(c[14]);
  const capital = c[7] === 'PPLC';
  codes.add(c[8]);
  if (population < MIN_POPULATION && !capital) continue;
  rows.push([c[1], c[2] === c[1] ? '' : c[2], c[8], Math.round(Number(c[4]) * 100) / 100, Math.round(Number(c[5]) * 100) / 100, population]);
}
rows.sort((a, b) => b[5] - a[5]);

const es = new Intl.DisplayNames(['es'], { type: 'region' });
const en = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = [...codes].filter((iso) => /^[A-Z]{2}$/.test(iso)).sort().map((iso) => ({ iso, es: es.of(iso), en: en.of(iso) }));

await mkdir(geoDir, { recursive: true });
await writeFile(resolve(geoDir, 'cities.json'), JSON.stringify({
  source: 'GeoNames cities15000',
  sourceUrl: SOURCE,
  license: 'CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ — © GeoNames (geonames.org)',
  retrievedAt: new Date().toISOString().slice(0, 10),
  sourceLastModified: lastModified,
  minPopulation: MIN_POPULATION,
  columns: ['name', 'asciiName', 'country', 'lat', 'lon', 'population'],
  cities: rows,
}) + '\n');
await writeFile(resolve(geoDir, 'countries.json'), JSON.stringify({
  source: 'Unicode CLDR mediante Intl.DisplayNames (Node.js); códigos ISO 3166-1 alfa-2 presentes en GeoNames',
  license: 'Unicode License v3 — https://www.unicode.org/license.txt',
  retrievedAt: new Date().toISOString().slice(0, 10),
  countries,
}, null, 1) + '\n');
const previous = await readFile(resolve(geoDir, 'geo.json'), 'utf8').then(JSON.parse).catch(() => null);
console.log(`Ciudades: ${rows.length} (de ${text.split('\n').length - 1}); países: ${countries.length}; geo.json existente: ${previous ? 'sí' : 'no'}`);

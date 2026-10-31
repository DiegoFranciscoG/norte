#!/usr/bin/env node
// Genera data/esco/esco-skills-es.json UNA sola vez: equivalencia entre el catálogo de NORTE y ESCO en español.
// Uso: node scripts/esco-fetch.mjs                       (API pública de ESCO, versión fijada)
//      node scripts/esco-fetch.mjs --from-csv RUTA.csv   (CSV descargado manualmente del portal de ESCO)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ESCO_VERSION = 'v1.2.1';
const API = 'https://ec.europa.eu/esco/api/search';
const DELAY_MS = 350;

const catalog = JSON.parse(readFileSync(resolve(ROOT, 'data/skills/catalog.json'), 'utf8'));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[^a-z0-9+#.]+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function candidatesFor(skill) {
  return new Set([skill.name, ...skill.aliases].map(norm).filter((s) => s.length > 1));
}

/** Solo se acepta una equivalencia exacta (sin el paréntesis aclaratorio de ESCO): mejor ninguna que una equivocada. */
function pick(results, skill) {
  const wanted = candidatesFor(skill);
  return results.find((r) => wanted.has(norm(r.label))) ?? null;
}

async function fromApi() {
  const out = {};
  let n = 0;
  for (const skill of catalog.skills) {
    const url = `${API}?selectedVersion=${ESCO_VERSION}&text=${encodeURIComponent(skill.name)}&language=es&type=skill&limit=10&full=false`;
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'NORTE/0.1 (catalogo de habilidades)' } });
    if (res.ok) {
      const data = await res.json();
      const results = (data._embedded?.results ?? []).map((r) => ({ uri: r.uri, label: r.title }));
      const match = pick(results, skill);
      if (match) out[skill.id] = match;
    } else {
      console.warn(`ESCO respondió ${res.status} para ${skill.name}`);
    }
    if (++n % 50 === 0) console.log(`${n}/${catalog.skills.length}`);
    await sleep(DELAY_MS);
  }
  return out;
}

function fromCsv(path) {
  const text = readFileSync(path, 'utf8');
  const rows = text.split(/\r?\n/).slice(1);
  const index = new Map();
  for (const row of rows) {
    const cols = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) ?? [];
    const uri = cols.find((c) => c.startsWith('http://data.europa.eu/esco/skill/'));
    const label = cols[4] ?? '';
    if (uri && label) index.set(norm(label), { uri, label });
  }
  const out = {};
  for (const skill of catalog.skills) {
    for (const c of candidatesFor(skill)) {
      const hit = index.get(c);
      if (hit) { out[skill.id] = hit; break; }
    }
  }
  return out;
}

const csvIdx = process.argv.indexOf('--from-csv');
const mappings = csvIdx > 0 ? fromCsv(process.argv[csvIdx + 1]) : await fromApi();
const result = {
  escoVersion: ESCO_VERSION,
  generatedAt: new Date().toISOString(),
  method: csvIdx > 0 ? 'csv' : 'api',
  source: 'ESCO — European Skills, Competences, Qualifications and Occupations, © Unión Europea',
  sourceUrl: 'https://esco.ec.europa.eu/',
  license: 'Reutilización conforme a la Decisión 2011/833/EU de la Comisión, con atribución.',
  matched: Object.keys(mappings).length,
  total: catalog.skills.length,
  mappings,
};
writeFileSync(resolve(ROOT, 'data/esco/esco-skills-es.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`ESCO: ${result.matched} de ${result.total} habilidades con equivalencia exacta.`);

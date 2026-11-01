import { describe, expect, it } from 'vitest';
import { buildObservatory } from '../src/stats/observatory.js';
import { testData } from './helpers.js';
import { NOW, job, octoberJobs, usd } from './observatory-fixtures.js';

/**
 * T-10: las estadísticas públicas no contienen datos personales.
 * Las vacantes de prueba traen a propósito correos, teléfonos, cédulas y nombres de contacto en sus textos.
 */
const contact = 'Envía tu hoja de vida a maria.perez.reclutadora@empresa-ficticia.com o llama a María Pérez al 0991234567 / +593 99 123 4567. Cédula 0102030405, RUC 0102030405001.';
const jobs = [
  ...octoberJobs().map((j) => ({ ...j, excerpt: contact })),
  job({ id: 'p1', title: 'Desarrollador Java (escribir a jefe.ti@empresa-ficticia.com)', excerpt: contact, salary: usd(1500, 1500) }),
];
const files = buildObservatory({ jobs, data: testData(), now: NOW, previousDays: [], previousMonths: [], demo: false });
const outputs = Object.entries(files).map(([name, content]) => [name, typeof content === 'string' ? content : JSON.stringify(content)] as const);

function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); keysOf(v, out); }
  return out;
}

describe('T-10 el observatorio no publica datos personales', () => {
  it.each(outputs)('%s no contiene correos, teléfonos ni identificaciones', (_name, text) => {
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    expect(text).not.toMatch(/(?:\+?593[\s-]?)?\b0?9\d[\s-]?\d{3}[\s-]?\d{4}\b/);
    expect(text).not.toMatch(/\b\d{10}(?:\d{3})?\b/);
    expect(text).not.toContain('María Pérez');
    expect(text).not.toContain('hoja de vida');
  });

  it('no publica extractos, títulos, enlaces de vacantes ni identificadores externos', () => {
    const keys = new Set<string>();
    for (const content of Object.values(files)) if (typeof content !== 'string') keysOf(content, keys);
    for (const forbidden of ['excerpt', 'description', 'applyUrl', 'externalId', 'fingerprint', 'email', 'phone']) expect(keys).not.toContain(forbidden);
    const all = outputs.map(([, t]) => t).join('\n');
    expect(all).not.toContain('https://example.com/jobs/');
    expect(all).not.toContain('Desarrollador Java (escribir');
  });

  it('solo publica archivos de estadísticas', () => {
    expect(Object.keys(files).every((name) => name.startsWith('stats/'))).toBe(true);
  });
});

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGeoResolver, createJobClassifier, createSkillMatcher } from '@norte/core';
import { describe, expect, it } from 'vitest';
import { parseEcbXml } from '../src/fx.js';
import { companySlug, normalizePosting, type NormalizeDeps } from '../src/normalize.js';
import { loadPreviousState, mergeWithPrevious, stableJobId } from '../src/state.js';
import { rawPosting, staticTask, testData } from './helpers.js';

const data = testData();
const now = new Date('2026-10-31T12:00:00Z');
const deps: NormalizeDeps = {
  cfg: data.ingest,
  classifier: createJobClassifier(data.ingest.classification),
  geo: createGeoResolver(data.geo),
  matcher: createSkillMatcher(data.catalog, data.extraction),
  fx: { source: 'BCE', date: '2026-10-30', perEur: { USD: 1.1172, EUR: 1 } },
  now,
};
const task = staticTask('ats:greenhouse:x', []);

describe('normalización', () => {
  it('produce el esquema único con grupo, habilidades, salario y extracto sin contacto', () => {
    const r = normalizePosting(rawPosting({
      sourceId: 'ats:greenhouse:x', externalId: '1', title: 'Desarrollador Java', company: 'Ficticia S.A.', companyRegion: 'EC',
      locationTexts: ['Cuenca, Azuay'], modality: 'hybrid', descriptionText: 'Requisitos:\nJava, Spring Boot\n5 años de experiencia\nInglés intermedio\nEscribe a rrhh@ficticia.ec',
      salary: { min: 1500, max: 1800, currency: 'USD', period: 'month' },
    }), task, deps);
    if (typeof r === 'string') throw new Error(r);
    expect(r).toMatchObject({ group: 'home', modality: 'hybrid', location: { city: 'Cuenca', country: 'EC' }, yearsRequired: 5, company: { slug: 'ficticia' } });
    expect(r.skills.map((s) => s.id)).toEqual(['java', 'spring-boot']);
    expect(r.salary).toMatchObject({ usdMonthlyMin: 1500, usdMonthlyMax: 1800 });
    expect(r.languages).toEqual([{ language: 'en', level: 'B1', inferred: false }]);
    expect(r.excerpt).not.toContain('@');
  });

  it('descarta roles no tecnológicos y remotos que excluyen a Ecuador', () => {
    expect(normalizePosting(rawPosting({ sourceId: 's', externalId: '2', title: 'Ejecutivo de Ventas', company: 'X' }), task, deps)).toBe('not-tech');
    expect(normalizePosting(rawPosting({ sourceId: 's', externalId: '3', title: 'Backend Engineer', company: 'X', locationTexts: ['USA Only'] }), task, deps)).toBe('outside-groups');
    expect(normalizePosting(rawPosting({ sourceId: 's', externalId: '4', title: '', company: 'X' }), task, deps)).toBe('invalid');
  });

  it('un remoto ubicado en Ecuador es elegible y una fecha futura se recorta a ahora', () => {
    const r = normalizePosting(rawPosting({ sourceId: 's', externalId: '5', title: 'Data Engineer', company: 'X', locationTexts: ['Remote in Ecuador'], publishedAt: '2030-01-01T00:00:00.000Z' }), task, deps);
    if (typeof r === 'string') throw new Error(r);
    expect(r.remoteScope).toEqual({ type: 'countries', countries: ['EC'], ecuadorEligible: true });
    expect(r.publishedAt).toBe(now.toISOString());
  });

  it('normaliza el nombre de empresa sin sufijos societarios', () => {
    expect(companySlug('Thoughtworks Inc.')).toBe('thoughtworks');
    expect(companySlug('Ficticia S.A.')).toBe('ficticia');
    expect(companySlug('Kruger NearShore LLC')).toBe('kruger-nearshore');
  });
});

describe('estado entre ejecuciones', () => {
  it('genera ids estables', () => {
    expect(stableJobId('a#1')).toBe(stableJobId('a#1'));
    expect(stableJobId('a#1')).toMatch(/^j_[0-9a-f]{12}$/);
  });

  it('descarta las cerradas que superan la retención', () => {
    const old = { id: 'j_old', status: 'closed', closedAt: '2026-01-01T00:00:00.000Z', sources: [], firstSeenAt: '', lastSeenAt: '', publishedAt: '' } as never;
    const res = mergeWithPrevious([], { jobs: [old], sourceRuns: {}, history: [] }, new Map(), now, { closedDays: 90, maxAgeDays: 120 });
    expect(res.jobs).toEqual([]);
  });

  it('lee el estado anterior desde un directorio e ignora índices de demostración', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'norte-prev-'));
    await writeFile(join(dir, 'index.json'), JSON.stringify({ sourceRuns: { a: { lastFetchedAt: 'x' } } }));
    await writeFile(join(dir, 'jobs.json'), JSON.stringify({ jobs: [{ id: 'j_1' }] }));
    const prev = await loadPreviousState(dir, () => undefined);
    expect(prev?.jobs).toHaveLength(1);
    expect(prev?.history).toEqual([]);
    await writeFile(join(dir, 'index.json'), JSON.stringify({ demo: true }));
    expect(await loadPreviousState(dir, () => undefined)).toBeNull();
    expect(await loadPreviousState(join(dir, 'no-existe'), () => undefined)).toBeNull();
    expect(await loadPreviousState(null, () => undefined)).toBeNull();
    expect(JSON.parse(await readFile(join(dir, 'jobs.json'), 'utf8')).jobs).toHaveLength(1);
  });
});

describe('tipo de cambio', () => {
  it('lee el XML del BCE', () => {
    const xmlText = "<Cube><Cube time='2026-10-30'><Cube currency='USD' rate='1.1172'/><Cube currency='MXN' rate='21.1237'/></Cube></Cube>";
    expect(parseEcbXml(xmlText, 'BCE')).toEqual({ source: 'BCE', date: '2026-10-30', perEur: { USD: 1.1172, MXN: 21.1237 } });
    expect(parseEcbXml('<html/>', 'BCE')).toBeNull();
  });
});

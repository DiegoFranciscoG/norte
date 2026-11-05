import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGeoResolver, createJobClassifier, createSkillMatcher, type Job } from '@norte/core';
import { describe, expect, it } from 'vitest';
import { dedupe } from '../src/dedupe.js';
import { parseEcbXml } from '../src/fx.js';
import { companySlug, normalizePosting, type NormalizeDeps } from '../src/normalize.js';
import { loadPreviousState, mergeWithPrevious, stableJobId } from '../src/state.js';
import { makePosting, rawPosting, staticTask, testData } from './helpers.js';

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
    expect(r).toMatchObject({ modality: 'hybrid', location: { city: 'Cuenca', country: 'EC' }, yearsRequired: 5, company: { slug: 'ficticia' } });
    expect(r.skills.map((s) => s.id)).toEqual(['java', 'spring-boot']);
    expect(r.salary).toMatchObject({ usdMonthlyMin: 1500, usdMonthlyMax: 1800 });
    expect(r.languages).toEqual([{ language: 'en', level: 'B1', inferred: false }]);
    expect(r.excerpt).not.toContain('@');
  });

  it('descarta roles no tecnológicos y lo que no se puede ubicar', () => {
    expect(normalizePosting(rawPosting({ sourceId: 's', externalId: '2', title: 'Ejecutivo de Ventas', company: 'X' }), task, deps)).toBe('not-tech');
    expect(normalizePosting(rawPosting({ sourceId: 's', externalId: '3', title: 'Backend Engineer', company: 'X', modality: 'onsite', locationTexts: ['Multiple locations'] }), task, deps)).toBe('no-location');
    const usOnly = normalizePosting(rawPosting({ sourceId: 's', externalId: '6', title: 'Backend Engineer', company: 'X', locationTexts: ['USA Only'] }), task, deps);
    if (typeof usOnly === 'string') throw new Error(usOnly);
    expect(usOnly.remoteScope).toEqual({ type: 'countries', regions: [], countries: ['US'] });
    expect(normalizePosting(rawPosting({ sourceId: 's', externalId: '4', title: '', company: 'X' }), task, deps)).toBe('invalid');
  });

  it('un remoto ubicado en Ecuador es elegible y una fecha futura se recorta a ahora', () => {
    const r = normalizePosting(rawPosting({ sourceId: 's', externalId: '5', title: 'Data Engineer', company: 'X', locationTexts: ['Remote in Ecuador'], publishedAt: '2030-01-01T00:00:00.000Z' }), task, deps);
    if (typeof r === 'string') throw new Error(r);
    expect(r.remoteScope).toEqual({ type: 'countries', regions: [], countries: ['EC'] });
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
    await rm(dir, { recursive: true, force: true });
  });
});

describe('publicaciones repetidas por ciudad (mismo id en la fuente)', () => {
  const SOURCE = 'ats:workable:ejemplo';
  const retention = { closedDays: 90, maxAgeDays: 120 };
  const ok = new Map([[SOURCE, 'ok' as const]]);
  const dayOne = new Date('2026-11-01T00:00:00.000Z');
  const dayTwo = new Date('2026-11-02T00:00:00.000Z');
  const dedupeCfg = testData().ingest.dedupe;

  const posting = (city: string, title = 'AI Solution Architect', externalId = 'ABC123') =>
    makePosting({
      title,
      company: 'Ficticia',
      sourceId: SOURCE,
      externalKey: `${SOURCE}#${externalId}`,
      modality: 'hybrid',
      remoteScope: null,
      location: { city, province: null, country: 'CA', raw: '' },
      sources: [{ sourceId: SOURCE, externalId, sourceName: SOURCE, url: 'https://example.org/abc', applyUrl: null, attribution: null, allowInAlerts: true, fetchedAt: dayOne.toISOString() }],
    });
  const run = (postings: ReturnType<typeof posting>[], previous: Job[] | null, now: Date) =>
    mergeWithPrevious(dedupe(postings, dedupeCfg), previous && { jobs: previous, sourceRuns: {}, history: [] }, ok, now, retention);
  const idOf = (jobs: Job[], city: string) => jobs.find((j) => j.location.city === city && j.status === 'open')?.id;

  it('cada ciudad es una vacante con su propio id, y repetir la misma ciudad no la duplica', () => {
    const { jobs, opened } = run([posting('Toronto'), posting('Oakville'), posting('Toronto')], null, dayOne);
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(2);
    expect(opened).toBe(2);
  });

  it('en la siguiente ejecución cada ciudad conserva su id y su fecha, y no cuenta como nueva', () => {
    const first = run([posting('Toronto'), posting('Oakville')], null, dayOne);
    const second = run([posting('Oakville'), posting('Toronto')], first.jobs, dayTwo);
    expect(second.opened).toBe(0);
    expect(second.closed).toBe(0);
    expect(idOf(second.jobs, 'Toronto')).toBe(idOf(first.jobs, 'Toronto'));
    expect(idOf(second.jobs, 'Oakville')).toBe(idOf(first.jobs, 'Oakville'));
    expect(second.jobs.every((j) => j.firstSeenAt === dayOne.toISOString())).toBe(true);
  });

  it('si desaparece una ciudad se cierra solo esa', () => {
    const first = run([posting('Toronto'), posting('Oakville')], null, dayOne);
    const second = run([posting('Toronto')], first.jobs, dayTwo);
    expect(second.closed).toBe(1);
    expect(idOf(second.jobs, 'Toronto')).toBe(idOf(first.jobs, 'Toronto'));
    expect(idOf(second.jobs, 'Oakville')).toBeUndefined();
    expect(second.jobs.find((j) => j.location.city === 'Oakville')?.status).toBe('closed');
  });

  it('una ciudad nueva no le quita el id a la que ya existía', () => {
    const first = run([posting('Toronto')], null, dayOne);
    const second = run([posting('Oakville'), posting('Toronto')], first.jobs, dayTwo);
    expect(second.opened).toBe(1);
    expect(idOf(second.jobs, 'Toronto')).toBe(idOf(first.jobs, 'Toronto'));
    expect(idOf(second.jobs, 'Oakville')).not.toBe(idOf(first.jobs, 'Toronto'));
  });

  it('una publicación editada en la fuente sigue siendo la misma vacante', () => {
    const first = run([posting('Toronto', 'AI Solution Architect')], null, dayOne);
    const second = run([posting('Toronto', 'Principal Platform Engineer')], first.jobs, dayTwo);
    expect(second.opened).toBe(0);
    expect(second.jobs).toHaveLength(1);
    expect(second.jobs[0]!.id).toBe(first.jobs[0]!.id);
    expect(second.jobs[0]!.title).toBe('Principal Platform Engineer');
  });

  it('dos vacantes que apuntan a la misma anterior nunca comparten id', () => {
    const first = run([posting('Toronto', 'Backend Engineer', 'VIEJA')], null, dayOne);
    const reopened = (externalId: string, publishedAt: string) => ({ ...posting('Toronto', 'Backend Engineer', externalId), publishedAt });
    const second = run([reopened('NUEVA1', '2026-06-01T00:00:00.000Z'), reopened('NUEVA2', '2026-10-30T00:00:00.000Z')], first.jobs, dayTwo);
    const open = second.jobs.filter((j) => j.status === 'open');
    expect(open).toHaveLength(2);
    expect(new Set(open.map((j) => j.id)).size).toBe(2);
  });
});

describe('tipo de cambio', () => {
  it('lee el XML del BCE', () => {
    const xmlText = "<Cube><Cube time='2026-10-30'><Cube currency='USD' rate='1.1172'/><Cube currency='MXN' rate='21.1237'/></Cube></Cube>";
    expect(parseEcbXml(xmlText, 'BCE')).toEqual({ source: 'BCE', date: '2026-10-30', perEur: { USD: 1.1172, MXN: 21.1237 } });
    expect(parseEcbXml('<html/>', 'BCE')).toBeNull();
  });
});

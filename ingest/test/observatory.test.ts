import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/stats/csv.js';
import { buildObservatory, createRoleClassifier, fmtNumber, quantile, salaryStat, sanitizeMonths } from '../src/stats/observatory.js';
import { testData } from './helpers.js';
import { NOW, daysAgo, job, octoberJobs } from './observatory-fixtures.js';

const data = testData();
type Files = Record<string, any>;
const build = (jobs = octoberJobs(), previousDays: unknown[] = [], previousMonths: unknown[] = [], over: Partial<typeof data> = {}) =>
  buildObservatory({ jobs, data: { ...data, ...over }, now: NOW, previousDays, previousMonths, demo: false }) as Files;

describe('estadística básica', () => {
  it('calcula cuartiles con interpolación lineal', () => {
    expect(quantile([1200, 1200, 1500], 0.5)).toBe(1200);
    expect(quantile([1200, 1200, 1500], 0.75)).toBe(1350);
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(17.5);
  });

  it('no publica cifras con menos vacantes que la muestra mínima', () => {
    expect(salaryStat([1000, 2000], 3)).toEqual({ n: 2, medianUsd: null, p25Usd: null, p75Usd: null, suppressed: true });
    expect(salaryStat([], 3)).toEqual({ n: 0, medianUsd: null, p25Usd: null, p75Usd: null, suppressed: false });
    expect(salaryStat([1000, 2000, 3000], 3)).toMatchObject({ n: 3, medianUsd: 2000, suppressed: false });
  });

  it('formatea en español', () => {
    expect(fmtNumber(1234567)).toBe('1.234.567');
    expect(fmtNumber(28.571, 1)).toBe('28,6');
    expect(fmtNumber(-3.25, 1)).toBe('-3,3');
  });

  it('clasifica el rol por el título según la prioridad configurada', () => {
    const role = createRoleClassifier(data.observatory.roles);
    expect(role('Senior Data Engineer')).toBe('data');
    expect(role('Desarrollador Full Stack')).toBe('fullstack');
    expect(role('Ingeniero DevOps')).toBe('devops');
    expect(role('QA Automation Engineer')).toBe('qa');
    expect(role('Desarrollador Java')).toBe('backend');
    expect(role('Programador')).toBe('software');
    expect(role('Contador')).toBe('other');
  });

  it('escribe CSV según RFC 4180 y neutraliza fórmulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'dice "hola"'], ['=1+1', 3]])).toBe('a,b\r\n"x,y","dice ""hola"""\r\n\'=1+1,3\r\n');
  });
});

describe('foto actual del mercado', () => {
  const files = build();
  const s = files['stats/summary.json'];

  it('cuenta población, remoto y habilidades sobre las vacantes abiertas', () => {
    expect(s.population).toEqual({ open: 6, ecuador: 4, remote: 2, freelance: 0 });
    expect(s.remote.share).toBe(33.3);
    expect(s.remote.scopes).toEqual({ regions: 1, unknown: 1 });
    expect(s.topSkills[0]).toMatchObject({ id: 'java', count: 3, share: 50 });
    expect(s.topCompanies[0]).toMatchObject({ name: 'Andina Software Demo', count: 2 });
  });

  it('compara Cuenca, Quito y Guayaquil sin publicar salarios de muestras pequeñas', () => {
    const [cuenca, quito, guayaquil, otras] = s.cities;
    expect(cuenca).toMatchObject({ city: 'Cuenca', open: 2, share: 50, modality: { onsite: 1, hybrid: 1, remote: 0, unknown: 0 } });
    expect(cuenca.salary).toEqual({ n: 2, medianUsd: null, p25Usd: null, p75Usd: null, suppressed: true });
    expect(quito.open).toBe(1);
    expect(guayaquil.open).toBe(1);
    expect(otras.open).toBe(0);
  });

  it('separa salarios de Ecuador y de remotos internacionales, y el porcentaje sin salario', () => {
    expect(s.salaries.withSalaryShare).toBe(66.7);
    expect(s.salaries.withoutSalaryShare).toBe(33.3);
    const [ec, intl] = s.salaries.markets;
    expect(ec.overall).toEqual({ n: 3, medianUsd: 1200, p25Usd: 1200, p75Usd: 1350, suppressed: false });
    expect(ec.byRoleLevel).toContainEqual(expect.objectContaining({ role: 'backend', seniority: 'mid', n: 2, suppressed: true, medianUsd: null }));
    expect(intl.overall).toMatchObject({ n: 1, suppressed: true });
  });

  it('no inventa tendencia sin 90 días de historial', () => {
    expect(s.trend.status).toBe('insufficient-history');
    expect(s.trend.rising).toEqual([]);
    expect(s.topSkills[0].trendDeltaPp).toBeNull();
  });

  it('atribuye cada cifra a sus fuentes con la fecha de obtención', () => {
    expect(s.sources).toEqual([{ name: 'Greenhouse', openJobs: 6, lastFetchedAt: NOW.toISOString() }]);
    expect(s.license).toContain('CC BY 4.0');
  });
});

describe('tendencia de 90 días', () => {
  it('compara la primera y la segunda mitad de la ventana', () => {
    const java = (i: number, d: number) => job({ id: `a${i}`, firstSeenAt: daysAgo(d) });
    const react = (i: number, d: number) => job({ id: `b${i}`, skills: [{ id: 'react', optional: false }], firstSeenAt: daysAgo(d) });
    const jobs = [...[60, 61, 62, 70, 80].map((d, i) => java(i, d)), ...[5, 6, 7, 20, 30].map((d, i) => react(i, d)), java(9, 3)];
    const s = build(jobs, [{ day: '2026-07-01', open: 3 }])['stats/summary.json'];
    expect(s.trend.status).toBe('ok');
    expect(s.trend.rising[0]).toMatchObject({ id: 'react', firstHalfShare: 0, secondHalfShare: 83.3, deltaPp: 83.3 });
    expect(s.trend.falling[0]).toMatchObject({ id: 'java', firstHalfShare: 100, secondHalfShare: 16.7, deltaPp: -83.3 });
    expect(s.trend.weeklyTotals.reduce((a: number, b: number) => a + b, 0)).toBe(11);
    expect(s.trend.weekStarts).toHaveLength(13);
  });
});

describe('series mensuales e informes', () => {
  it('agrega el mes en curso y redacta el informe con cifras exactas', () => {
    const files = build();
    const [oct] = files['stats/monthly.json'].months;
    expect(oct).toMatchObject({ month: '2026-10', newJobs: 7, remote: 2, ecuador: 5, withSalary: 4, frozen: false, byCity: { Cuenca: 3, Quito: 1, Guayaquil: 1 } });
    const r = files['stats/reports/2026-10.json'];
    expect(r.complete).toBe(false);
    expect(r.highlights).toEqual([
      'En octubre de 2026 NORTE registró 7 vacantes tecnológicas nuevas accesibles desde Ecuador.',
      'El 28,6 % fue remoto y el 71,4 % estaba ubicado en Ecuador.',
      'Solo el 57,1 % publicó el salario.',
      'La habilidad más pedida fue Java, presente en el 57,1 % de las vacantes nuevas.',
      'Mes en curso: cifras hasta el 31 de octubre de 2026.',
      'Es el primer mes observado: incluye las vacantes que ya estaban publicadas cuando empezó el observatorio.',
    ]);
    expect(files['stats/reports/index.json'].reports).toEqual([{ month: '2026-10', label: 'octubre de 2026', complete: false, newJobs: 7 }]);
  });

  it('conserva los meses cerrados y compara con el mes anterior', () => {
    const stored = [
      { month: '2026-08', newJobs: 50, remote: 20, ecuador: 30, withSalary: 10, byCity: { Cuenca: 5 }, skills: { java: 25 }, companies: {}, sources: {} },
      { month: '2026-09', newJobs: 40, remote: 10, ecuador: 30, withSalary: 8, byCity: { Cuenca: 4 }, skills: { java: 30, react: 2 }, companies: {}, sources: {} },
      { month: 'basura' },
      null,
      { month: '2026-07', newJobs: 'x' },
    ];
    const jobs = [...octoberJobs(), job({ id: 'sep', firstSeenAt: '2026-09-20T15:00:00Z' })];
    const files = build(jobs, [], stored);
    const months = files['stats/monthly.json'].months;
    expect(months.map((m: { month: string }) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(months[1]).toMatchObject({ newJobs: 40, frozen: true });
    const r = files['stats/reports/2026-10.json'];
    expect(r.previous).toEqual({ month: '2026-09', label: 'septiembre de 2026', newJobs: 40 });
    expect(r.changePct).toBe(-82.5);
    expect(r.highlights[1]).toBe('Son 82,5 % menos que en septiembre de 2026 (40).');
    expect(r.highlights).not.toContain(data.observatory.report.firstMonth);
    expect(files['stats/reports/2026-08.json'].complete).toBe(true);
  });

  it('descarta un historial con forma inválida', () => {
    expect(sanitizeMonths([{ month: '2026-13x', newJobs: 1 }, 'x', 3])).toEqual([]);
  });

  it('exporta CSV y documenta la API pública', () => {
    const files = build();
    expect(files['stats/skills.csv'].split('\r\n')[0]).toBe('skill_id,skill,category,open_jobs,share_pct,trend_90d_pp');
    expect(files['stats/skills.csv']).toContain('java,Java,language,3,50,');
    expect(files['stats/monthly.csv'].split('\r\n')[1]).toBe('2026-10,7,28.6,71.4,57.1,3,1,1,false');
    expect(files['stats/salaries.csv']).toContain('ecuador,backend,mid,2,,,,true');
    expect(files['stats/api.json'].files).toContain('stats/reports/2026-10.json');
    expect(files['stats/api.json'].endpoints.length).toBeGreaterThan(5);
  });
});

describe('brecha academia–mercado (preparada)', () => {
  it('sin mallas cargadas, lo dice y no inventa cifras', () => {
    const a = build()['stats/academia.json'];
    expect(a.status).toBe('sin-datos');
    expect(a.curricula).toEqual([]);
    expect(a.demand[0]).toMatchObject({ id: 'java' });
  });

  it('con una malla, calcula la cobertura ponderada por demanda', () => {
    const curricula = {
      curricula: [{
        id: 'malla-ficticia', university: 'Universidad Ficticia', program: 'Software', city: 'Cuenca',
        source: { url: 'https://example.org/malla', retrievedAt: '2026-10-31' },
        courses: [{ name: 'Programación I', semester: 1, skills: ['java'] }, { name: 'Electiva', skills: ['kubernetes', 'no-existe'] }],
      }],
    };
    const a = build(octoberJobs(), [], [], { curricula })['stats/academia.json'];
    expect(a.status).toBe('ok');
    // Demanda en Ecuador (4 abiertas): java 2 (50 %), spring-boot 1 (25 %), react 1 (25 %), python 1 (25 %) → cubre 50 / 125.
    expect(a.curricula[0].coverage).toBe(40);
    expect(a.curricula[0].missing.map((m: { id: string }) => m.id)).toEqual(['python', 'react', 'spring-boot']);
    expect(a.curricula[0].taughtWithoutDemand).toEqual([{ id: 'kubernetes', name: 'Kubernetes' }]);
  });
});

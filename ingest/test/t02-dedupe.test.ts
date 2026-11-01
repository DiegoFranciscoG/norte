import { describe, expect, it } from 'vitest';
import { dedupe, fingerprintOf, isDuplicate, normalizeTitle } from '../src/dedupe.js';
import type { NormalizedPosting } from '../src/normalize.js';
import { makePosting, testData } from './helpers.js';

const cfg = testData().ingest.dedupe;

const COMPANIES = ['Andes Tech', 'Pacifico Soft', 'Volcan Data', 'Chimborazo Labs', 'Galapagos Cloud', 'Amazonia Apps', 'Cotopaxi Systems', 'Tungurahua Digital', 'Ingapirca IT', 'Cajas Analytics'];
const TITLES = ['Backend Engineer', 'Frontend Developer', 'Data Engineer', 'DevOps Engineer', 'QA Automation Engineer', 'Mobile Developer', 'Data Analyst', 'Full Stack Developer', 'Site Reliability Engineer', 'Machine Learning Engineer'];
const TEAMS = ['pagos', 'logística', 'riesgo crediticio', 'telemedicina', 'agroexportación', 'turismo', 'seguros', 'educación virtual', 'energía', 'retail'];
const VERBS = ['migrar sistemas heredados', 'automatizar despliegues', 'diseñar tableros', 'optimizar consultas', 'construir aplicaciones móviles', 'mejorar la observabilidad', 'integrar proveedores externos', 'entrenar modelos', 'reducir costos de nube', 'asegurar la calidad'];

function excerptFor(i: number): string {
  return `Equipo de ${TEAMS[i % 10]} en la división ${Math.floor(i / 10)} busca ${VERBS[(i * 7) % 10]} durante ${3 + (i % 5)} trimestres; reporte ${i}-${(i * 31) % 97}.`;
}

/** 100 vacantes distintas, con pares «casi iguales» que NO deben unirse. */
function bases(): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  for (let c = 0; c < 10; c++) {
    for (let t = 0; t < 10; t++) {
      const i = c * 10 + t;
      let title = `${t % 2 === 0 ? 'Senior' : 'Junior'} ${TITLES[t]}`;
      let extra: Partial<NormalizedPosting> = {};
      if (c < 5 && t === 1) title = `Junior ${TITLES[0]}`; // mismo cargo que t=0 pero otro nivel
      if (c >= 5 && t === 2) title = 'Senior Backend Engineer (Java)';
      if (c >= 5 && t === 3) title = 'Senior Backend Engineer (Go)';
      if (c === 0 && (t === 4 || t === 5)) {
        title = 'Analista de Sistemas';
        extra = { modality: 'onsite', remoteScope: null, location: { city: t === 4 ? 'Quito' : 'Guayaquil', province: null, country: 'EC', raw: '' } };
      }
      if (c === 1 && t === 6) title = 'Software Engineer, Backend';
      if (c === 1 && t === 7) title = 'Software Engineer, Frontend';
      if (c === 2 && (t === 8 || t === 9)) {
        title = 'Senior Platform Engineer'; // el mismo cargo reabierto 80 días después es otra vacante
        extra = { publishedAt: t === 8 ? '2026-08-01T12:00:00.000Z' : '2026-10-20T12:00:00.000Z' };
      }
      const skills = [{ id: `stack-${t}`, optional: false }, ...(title.includes('(Go)') ? [{ id: 'go', optional: false }] : title.includes('(Java)') ? [{ id: 'java', optional: false }] : [])];
      out.push(makePosting({ title, company: COMPANIES[c]!, sourceId: `ats:greenhouse:c${c}`, excerpt: excerptFor(i), skills, ...extra }));
    }
  }
  return out;
}

function typo(title: string): string {
  const words = title.split(' ');
  const idx = words.reduce((best, w, k) => (w.length > words[best]!.length ? k : best), 0);
  const w = words[idx]!;
  words[idx] = w.slice(0, 2) + w[3] + w[2] + w.slice(4);
  return words.join(' ');
}

const VARIANTS: ((p: NormalizedPosting) => Partial<NormalizedPosting> & { title?: string; companyName?: string })[] = [
  (p) => ({ title: p.title.toUpperCase() }),
  (p) => ({ title: p.title.replace('Senior', 'Sr.').replace('Junior', 'Jr.') }),
  (p) => ({ title: `${p.title} - Remote LATAM` }),
  (p) => ({ title: `151. ${p.title}` }),
  (p) => ({ title: `${p.title} (Remoto)` }),
  (p) => ({ companyName: `${p.company.name} Inc.` }),
  (p) => ({ publishedAt: new Date(Date.parse(p.publishedAt) + 3 * 86400000).toISOString() }),
  (p) => ({ title: typo(p.title) }),
];

function duplicates(base: NormalizedPosting[]): NormalizedPosting[] {
  return base.map((b, i) => {
    const { companyName, title, ...rest } = VARIANTS[i % VARIANTS.length]!(b);
    const portal = ['portal:remotive', 'portal:himalayas', 'portal:getonboard', 'portal:jobicy'][i % 4]!;
    const { externalKey: _key, sources: _sources, sourceKind: _kind, company: _company, ...fields } = b;
    const dup = makePosting({ ...fields, ...rest, title: title ?? b.title, company: companyName ?? b.company.name, sourceId: portal, excerpt: b.excerpt });
    return { ...dup, company: { name: dup.company.name, slug: b.company.slug } };
  });
}

describe('T-02 deduplicación entre fuentes', () => {
  const base = bases();
  const dups = duplicates(base);
  const all = [...base, ...dups];
  const merged = dedupe(all, cfg);

  it('trabaja con 200 vacantes y 100 duplicados conocidos', () => {
    expect(all).toHaveLength(200);
  });

  it('detecta todos los duplicados conocidos (100 % de exhaustividad)', () => {
    const clusterOf = new Map<string, number>();
    merged.forEach((m, k) => m.externalKeys.forEach((key) => clusterOf.set(key, k)));
    for (let i = 0; i < 100; i++) {
      expect(clusterOf.get(base[i]!.externalKey), `base ${i}: «${base[i]!.title}» vs «${dups[i]!.title}»`).toBe(clusterOf.get(dups[i]!.externalKey));
    }
  });

  it('no fusiona ninguna vacante distinta (100 % de precisión)', () => {
    const wrong = merged.filter((m) => m.externalKeys.length !== 2).map((m) => m.sources.map((s) => s.sourceId).join(',') + ' :: ' + m.title);
    expect(wrong).toEqual([]);
    expect(merged).toHaveLength(100);
    for (const m of merged) expect(m.externalKeys).toHaveLength(2);
  });

  it('muestra la vacante una sola vez con todos sus orígenes y la fuente de empresa como principal', () => {
    for (const m of merged) {
      expect(m.sources.map((s) => s.sourceId.split(':')[0])).toEqual(['ats', 'portal']);
      expect(m.fingerprint).toBe(fingerprintOf(m));
    }
  });

  it('normaliza títulos quitando ruido sin borrar la tecnología', () => {
    expect(normalizeTitle('151. Sr. Backend Engineer (Java) - Remote LATAM')).toBe('senior backend engineer java');
    expect(normalizeTitle('Desarrolladora Java')).toBe('desarrollador java');
  });

  it('une repeticiones de la misma fuente solo con título y ubicación idénticos', () => {
    const a = makePosting({ title: 'Data Engineer', company: 'Uno', sourceId: 'ats:lever:uno' });
    const b = makePosting({ title: 'Data Engineer', company: 'Uno', sourceId: 'ats:lever:uno' });
    const c = makePosting({ title: 'Data Engineer', company: 'Uno', sourceId: 'ats:lever:uno', modality: 'onsite', location: { city: 'Quito', province: null, country: 'EC', raw: '' } });
    expect(isDuplicate(a, b, cfg)).toBe(true);
    expect(isDuplicate(a, c, cfg)).toBe(false);
    expect(dedupe([a, b], cfg)[0]!.sources).toHaveLength(1);
  });
});

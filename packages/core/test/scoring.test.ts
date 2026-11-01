import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeGap, type LearningResource, type ProfileRepo } from '../src/gap.js';
import { COMPONENT_ORDER, effectiveWeights, profileSets, scoreJob, type Profile, type ScoringConfig } from '../src/score.js';
import { createSkillMatcher } from '../src/skills.js';
import type { Cefr, Job, RemoteScope, SkillCatalog } from '../src/types.js';
import { extraction, geoData } from './fixtures.js';

const data = (p: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../data', p), 'utf8'));
const catalog = data('skills/catalog.json') as SkillCatalog;
const config = data('config/scoring.json') as ScoringConfig;
const resources = (data('skills/learning.json') as { resources: LearningResource[] }).resources;
const golden = data('fixtures/scoring-cases.json') as { now: string; cases: GoldenCase[] };
const matcher = createSkillMatcher(catalog, extraction);
const now = new Date(golden.now);
const ctx = { matcher, config, now, regions: geoData.regions };

interface GoldenCase {
  name: string;
  job: { skills: [string, boolean][]; yearsRequired: number | null; seniority: Job['seniority']; modality: Job['modality']; city: string | null; country: string | null; remoteScope: RemoteScope | null; languages: [string, Cefr | null, boolean][]; salary: [number, number] | null; daysAgo: number; status: Job['status'] };
  profile: { demonstrated: string[]; declared: string[]; years: number | null; english: Cefr | null; homeCountry: string | null; homeCity: string; relocation: boolean; minSalary: number | null; weights?: Profile['weights'] };
  expected: { total: number; components: Record<string, number>; fit: string };
}

export function buildJob(spec: GoldenCase['job'], id = 'j_test'): Job {
  return {
    id,
    title: 'Vacante de prueba',
    company: { name: 'Ficticia', slug: 'ficticia' },
    location: { city: spec.city, province: null, country: spec.country, raw: '' },
    modality: spec.modality,
    remoteScope: spec.remoteScope,
    employmentType: 'full-time',
    seniority: spec.seniority,
    yearsRequired: spec.yearsRequired,
    yearsInferred: false,
    skills: spec.skills.map(([sid, optional]) => ({ id: sid, optional })),
    salary: spec.salary ? { min: spec.salary[0], max: spec.salary[1], currency: 'USD', period: 'month', usdMonthlyMin: spec.salary[0], usdMonthlyMax: spec.salary[1], convertible: true, fx: null } : null,
    languages: spec.languages.map(([language, level, inferred]) => ({ language, level, inferred })),
    postingLanguage: 'es',
    publishedAt: new Date(now.getTime() - spec.daysAgo * 86400000).toISOString(),
    firstSeenAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    status: spec.status,
    closedAt: null,
    excerpt: '',
    sector: null,
    sources: [],
    fingerprint: 'x',
  };
}

export function buildProfile(spec: GoldenCase['profile']): Profile {
  return {
    skills: [...spec.demonstrated.map((sid) => ({ id: sid, origin: 'demonstrated' as const })), ...spec.declared.map((sid) => ({ id: sid, origin: 'declared' as const }))],
    yearsOfExperience: spec.years,
    englishLevel: spec.english,
    homeCountry: spec.homeCountry,
    homeCity: spec.homeCity,
    acceptsRelocation: spec.relocation,
    minSalaryUsd: spec.minSalary,
    weights: spec.weights ?? null,
  };
}

describe('T-03 el puntaje cuadra', () => {
  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = scoreJob(buildJob(c.job), buildProfile(c.profile), ctx);
    const points = Object.fromEntries(result.components.map((x) => [x.key, x.points]));
    expect(points).toEqual(c.expected.components);
    expect(result.total).toBe(c.expected.total);
    expect(result.fit).toBe(c.expected.fit);
    const sum = Math.round(result.components.reduce((s, x) => s + x.points, 0) * 10) / 10;
    expect(sum).toBe(result.total);
  });

  it('el desglose siempre suma el total, con cualquier peso', () => {
    const job = buildJob(golden.cases[2]!.job);
    for (const w of [{ demonstrated: 7 }, { language: 0, freshness: 33 }, { declared: 1, location: 99 }]) {
      const r = scoreJob(job, { ...buildProfile(golden.cases[2]!.profile), weights: w }, ctx);
      expect(Math.round(r.components.reduce((s, x) => s + x.points, 0) * 10) / 10).toBe(r.total);
      expect(r.components.map((x) => x.key)).toEqual(COMPONENT_ORDER);
    }
  });

  it('escala los pesos personalizados a 100 e ignora negativos', () => {
    const w = effectiveWeights(config, { demonstrated: -5 });
    expect(Math.round(Object.values(w).reduce((a, b) => a + b, 0))).toBe(100);
    expect(w.demonstrated).toBe(0);
    expect(effectiveWeights(config, null)).toEqual(effectiveWeights(config, {}));
  });

  it('explica sin rodeos la experiencia y el idioma que faltan', () => {
    const r = scoreJob(buildJob(golden.cases[2]!.job), buildProfile(golden.cases[2]!.profile), ctx);
    expect(r.components.find((x) => x.key === 'experience')?.detail).toBe('Pide 5 años; tienes 1. Te faltan 4 años.');
    expect(r.components.find((x) => x.key === 'language')?.detail).toContain('declaras B1');
    expect(r.skills).toEqual({ demonstrated: [], declaredOnly: ['react', 'typescript'], missing: [], missingOptional: ['nextjs'] });
  });

  it('no inventa habilidades: lo que no está en el CV ni en el código no suma', () => {
    const job = buildJob({ ...golden.cases[0]!.job, skills: [['rust', false]] });
    const r = scoreJob(job, buildProfile(golden.cases[0]!.profile), ctx);
    expect(r.components.slice(0, 2).map((x) => x.points)).toEqual([0, 0]);
    expect(r.skills.missing).toEqual(['rust']);
  });

  it('una vacante cerrada no suma frescura y queda marcada', () => {
    const r = scoreJob(buildJob({ ...golden.cases[0]!.job, status: 'closed' }), buildProfile(golden.cases[0]!.profile), ctx);
    expect(r.components.at(-1)?.points).toBe(0);
    expect(r.flags).toContain('cerrada');
  });
});

/** Generador determinista para la prueba de propiedades. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('T-04 la brecha es real', () => {
  const pool = ['java', 'spring-boot', 'kubernetes', 'docker', 'integration-testing', 'testcontainers', 'react', 'typescript', 'python', 'aws', 'postgresql', 'sql', 'terraform', 'angular', 'graphql', 'kafka', 'junit', 'git'];
  const rand = rng(31);
  const pick = (n: number) => [...pool].sort(() => rand() - 0.5).slice(0, n);
  const repos: ProfileRepo[] = [
    { name: 'banca-microservicios', url: 'https://github.com/u/banca-microservicios', pushedAt: '2026-10-01', skills: ['java', 'spring-boot', 'docker', 'junit', 'postgresql'] },
    { name: 'portafolio-web', url: 'https://github.com/u/portafolio-web', pushedAt: '2026-09-01', skills: ['html', 'css', 'react', 'typescript'] },
  ];

  it('toda habilidad faltante está en la vacante y no en el perfil (300 combinaciones)', () => {
    for (let i = 0; i < 300; i++) {
      const job = buildJob({ ...golden.cases[0]!.job, skills: pick(1 + Math.floor(rand() * 6)).map((s) => [s, rand() < 0.3]) });
      const profile = buildProfile({ ...golden.cases[0]!.profile, demonstrated: pick(Math.floor(rand() * 4)), declared: pick(Math.floor(rand() * 4)) });
      const gap = analyzeGap(job, profile, { ...ctx, repos, resources });
      const { declared, demonstrated } = profileSets(profile, matcher);
      const jobIds = new Set(job.skills.map((s) => s.id));
      for (const id of [...gap.missingRequired, ...gap.missingOptional]) {
        expect(jobIds.has(id), `${id} no está en la vacante`).toBe(true);
        expect(declared.has(id), `${id} sí está en el perfil`).toBe(false);
      }
      for (const id of gap.declaredNotDemonstrated) {
        expect(jobIds.has(id) && declared.has(id) && !demonstrated.has(id)).toBe(true);
      }
      for (const rec of gap.recommendations) {
        expect(jobIds.has(rec.skillId)).toBe(true);
        expect(rec.gain).toBeGreaterThan(0);
        const simulated = { ...profile, skills: [...profile.skills, { id: rec.skillId, origin: 'demonstrated' as const }] };
        expect(rec.scoreIfDemonstrated).toBe(scoreJob(job, simulated, ctx).total);
      }
    }
  });

  it('nombra lo que falta, el repo más cercano y la herramienta concreta', () => {
    const job = buildJob({ ...golden.cases[0]!.job, skills: [['java', false], ['spring-boot', false], ['kubernetes', false], ['integration-testing', false]] });
    const profile = buildProfile({ ...golden.cases[0]!.profile, demonstrated: ['java', 'spring-boot', 'docker', 'junit'] });
    const gap = analyzeGap(job, profile, { ...ctx, repos, resources });
    expect(gap.missingRequired).toEqual(['kubernetes', 'integration-testing']);
    const top = gap.recommendations[0]!;
    expect(top).toMatchObject({ skillId: 'integration-testing', closestRepo: { name: 'banca-microservicios' }, via: { skillId: 'testcontainers', skillName: 'Testcontainers' } });
    expect(top.resources.map((r) => r.url)).toContain('https://testcontainers.com/getting-started/');
    expect(gap.summary).toContain('Piden Kubernetes y Pruebas de integración');
    expect(gap.summary).toContain('De tus repos, banca-microservicios es el más cercano: añadirle Testcontainers cubre uno de los 2 huecos');
    expect(gap.summary).toContain('y sube tu encaje de 78 a 89.');
  });

  it('dice claramente cuando no encajas todavía', () => {
    const gap = analyzeGap(buildJob(golden.cases[2]!.job), buildProfile(golden.cases[2]!.profile), { ...ctx, repos: [], resources });
    expect(gap.summary.startsWith('No encajas todavía (46/100): esto es lo que falta.')).toBe(true);
    expect(gap.experience).toEqual({ required: 5, have: 1, missing: 4 });
    expect(gap.language).toEqual({ language: 'en', required: 'B2', have: 'B1' });
  });

  it('cuando encaja bien no inventa huecos', () => {
    const gap = analyzeGap(buildJob(golden.cases[0]!.job), buildProfile(golden.cases[0]!.profile), { ...ctx, repos, resources });
    expect(gap.recommendations).toEqual([]);
    expect(gap.summary).toBe('Encajas bien (100/100): no hay huecos detectables.');
  });
});

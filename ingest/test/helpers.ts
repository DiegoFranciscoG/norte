import { resolve } from 'node:path';
import type { SkillCatalog } from '@norte/core';
import { loadData, type LoadedData } from '../src/config.js';
import type { NormalizedPosting } from '../src/normalize.js';
import type { RawPosting, SourceTask } from '../src/sources/types.js';

export const DATA_DIR = resolve(import.meta.dirname, '../../data');

export const testCatalog: SkillCatalog = {
  version: 'test',
  skills: [
    { id: 'java', name: 'Java', category: 'language', aliases: [] },
    { id: 'spring-boot', name: 'Spring Boot', category: 'backend', aliases: ['springboot'] },
    { id: 'react', name: 'React', category: 'frontend', aliases: ['reactjs'] },
    { id: 'python', name: 'Python', category: 'language', aliases: [] },
    { id: 'kubernetes', name: 'Kubernetes', category: 'devops', aliases: ['k8s'] },
    { id: 'aws', name: 'AWS', category: 'cloud', aliases: ['amazon web services'] },
  ],
};

export function testData(): LoadedData {
  const data = loadData(DATA_DIR);
  return { ...data, catalog: testCatalog };
}

/** Reloj virtual: sleep avanza el tiempo sin esperar de verdad. */
export class FakeClock {
  t = 1_800_000_000_000;
  readonly sleeps: number[] = [];
  now = () => this.t;
  sleep = async (ms: number) => {
    this.sleeps.push(ms);
    this.t += ms;
  };
}

export type Handler = (url: string, init: RequestInit | undefined, call: number) => Response | Promise<Response>;

export function fakeFetch(handler: Handler): typeof fetch & { calls: { url: string; at: number }[] } {
  const calls: { url: string; at: number }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, at: Date.now() });
    return handler(url, init, calls.length);
  }) as typeof fetch & { calls: { url: string; at: number }[] };
  fn.calls = calls;
  return fn;
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

let seq = 0;
export function makePosting(p: Partial<NormalizedPosting> & { title: string; company: string; sourceId: string }): NormalizedPosting {
  const externalId = `x${++seq}`;
  const { company, sourceId, ...rest } = p;
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-(inc|s-a)$/, '').replace(/^-|-$/g, '');
  return {
    externalKey: `${sourceId}#${externalId}`,
    sourceKind: sourceId.startsWith('ats') ? 'ats' : 'portal',
    company: { name: company, slug },
    location: { city: null, province: null, country: null, raw: '' },
    modality: 'remote',
    remoteScope: { type: 'regions', regions: ['latam'], countries: [] },
    employmentType: 'full-time',
    seniority: 'unknown',
    yearsRequired: null,
    yearsInferred: false,
    skills: [],
    salary: null,
    languages: [],
    postingLanguage: 'en',
    publishedAt: '2026-10-20T12:00:00.000Z',
    excerpt: 'Descripción genérica de la vacante con responsabilidades y requisitos del equipo.',
    sector: null,
    sources: [{ sourceId, externalId, sourceName: sourceId, url: `https://example.org/${externalId}`, applyUrl: null, attribution: null, allowInAlerts: true, fetchedAt: '2026-10-31T00:00:00.000Z' }],
    ...rest,
  };
}

export function staticTask(sourceId: string, postings: RawPosting[], extra: Partial<SourceTask> = {}): SourceTask {
  return {
    sourceId,
    sourceName: sourceId,
    kind: sourceId.startsWith('ats') ? 'ats' : 'portal',
    attribution: null,
    allowInAlerts: true,
    minHoursBetweenFetches: 0,
    run: async () => postings,
    ...extra,
  };
}

export function rawPosting(p: Partial<RawPosting> & { title: string; company: string; sourceId: string; externalId: string }): RawPosting {
  return {
    locationTexts: ['Remote - LATAM'],
    modality: 'remote',
    descriptionText: 'Requisitos: Java y Spring Boot. 3 años de experiencia.',
    publishedAt: '2026-10-25T10:00:00.000Z',
    url: `https://example.org/${p.externalId}`,
    ...p,
  };
}

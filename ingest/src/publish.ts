import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GROUP_ORDER, searchOptions, type Job, type SearchDocument } from '@norte/core';
import MiniSearch from 'minisearch';
import type { LoadedData } from './config.js';
import { companySlug } from './normalize.js';
import type { PipelineResult } from './pipeline.js';

export interface PublishOptions {
  outDir: string;
  data: LoadedData;
  result: PipelineResult;
  now: Date;
  demo: boolean;
  buildVersion: string;
  commit: string | null;
  /** Archivos adicionales (estadísticas, CSV, informes) con ruta relativa al directorio de salida. */
  extraFiles?: Record<string, string | object>;
}

export const DATA_LICENSE = {
  code: 'MIT',
  statistics: 'CC BY 4.0 — cita «NORTE, observatorio del mercado laboral tecnológico de Ecuador» con enlace.',
  jobs: 'Cada vacante pertenece a su empresa y a la fuente indicada; NORTE muestra título, datos básicos, un extracto y el enlace al original.',
};

export function searchDocuments(jobs: Job[], skillName: (id: string) => string): SearchDocument[] {
  return jobs.filter((j) => j.status === 'open').map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company.name,
    skills: j.skills.map((s) => skillName(s.id)).join(' '),
    location: [j.location.city, j.location.province, j.modality === 'remote' ? 'remoto' : ''].filter(Boolean).join(' '),
    excerpt: j.excerpt,
  }));
}

export function buildTotals(jobs: Job[]) {
  const open = jobs.filter((j) => j.status === 'open');
  const byGroup = Object.fromEntries(GROUP_ORDER.map((g) => [g, open.filter((j) => j.group === g).length]));
  return {
    open: open.length,
    closed: jobs.length - open.length,
    byGroup,
    remoteScopeUnknown: open.filter((j) => j.group === 'remote' && j.remoteScope?.ecuadorEligible === null).length,
    withSalary: open.filter((j) => j.salary?.convertible).length,
  };
}

async function write(outDir: string, rel: string, content: string | object): Promise<void> {
  const path = join(outDir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
}

export async function publish(opts: PublishOptions): Promise<string[]> {
  const { data, result, now, outDir } = opts;
  const generatedAt = now.toISOString();
  const skillNames = new Map(data.catalog.skills.map((s) => [s.id, s.name] as const));
  const openBySlug = new Map<string, number>();
  for (const j of result.jobs) if (j.status === 'open') openBySlug.set(j.company.slug, (openBySlug.get(j.company.slug) ?? 0) + 1);

  const search = new MiniSearch<SearchDocument>(searchOptions);
  search.addAll(searchDocuments(result.jobs, (id) => skillNames.get(id) ?? id));

  const files: Record<string, string | object> = {
    'jobs.json': { generatedAt, count: result.jobs.length, jobs: result.jobs },
    'search-index.json': JSON.stringify(search),
    'skills.json': { version: data.catalog.version, extraction: data.extraction, skills: data.catalog.skills },
    'scoring.json': data.scoring,
    'learning.json': data.learning,
    'dependencies.json': data.dependencies,
    'career-pages.json': data.careerPages,
    'deep-links.json': data.deepLinks,
    'companies.json': {
      verifiedAt: data.companies.verifiedAt,
      companies: data.companies.companies.map((c) => ({
        id: c.id,
        name: c.name,
        ats: c.ats,
        boardUrl: data.sources.ats[c.ats].boardUrl.replace('{board}', encodeURIComponent(c.board)),
        region: c.region,
        cities: c.cities,
        sector: c.sector,
        website: c.website,
        careersUrl: c.careersUrl ?? null,
        openJobs: openBySlug.get(companySlug(c.name)) ?? 0,
      })),
    },
    'sources.json': {
      verifiedAt: data.sources.verifiedAt,
      ats: Object.entries(data.sources.ats).map(([id, a]) => ({ id, name: a.name, termsUrl: a.termsUrl, termsNote: a.termsNote })),
      portals: data.sources.portals.map((p) => ({ id: p.id, name: p.name, enabled: p.enabled, attribution: p.attribution, termsUrl: p.termsUrl, termsNote: p.termsNote })),
      excluded: data.sources.excluded,
      fx: data.sources.fx,
    },
    ...opts.extraFiles,
  };

  const index = {
    schemaVersion: 1,
    name: 'NORTE',
    demo: opts.demo,
    build: { version: opts.buildVersion, generatedAt, commit: opts.commit },
    home: data.ingest.home,
    totals: {
      ...buildTotals(result.jobs),
      postingsFetched: result.postings,
      duplicatesMerged: result.duplicatesMerged,
      dropped: result.dropped,
      opened: result.opened,
      closedThisRun: result.closed,
      carriedFromUnavailableSources: result.carried,
    },
    sources: Object.values(result.sourceRuns).sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    sourceRuns: result.sourceRuns,
    files: Object.keys(files).sort(),
    license: DATA_LICENSE,
    note: 'Índice público generado automáticamente. No contiene datos personales ni de contacto.',
  };

  await mkdir(outDir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) await write(outDir, rel, content);
  await write(outDir, 'index.json', index);
  return ['index.json', ...Object.keys(files)];
}

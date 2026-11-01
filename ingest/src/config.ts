import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGeoData, type ClassificationConfig, type CityRow, type CountryName, type ExtractionConfig, type GeoData, type Region, type SalaryConfig, type SkillCatalog } from '@norte/core';
import type { HostPolicy } from './http/client.js';
import type { ObservatoryConfig } from './stats/observatory.js';

export type AtsId = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'recruitee' | 'smartrecruiters' | 'teamtailor';

export interface AtsDef {
  name: string;
  listUrl: string;
  euListUrl?: string;
  detailUrl?: string;
  boardUrl: string;
  jobUrl?: string;
  termsUrl: string;
  termsNote: string;
}

export interface PortalDef {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  endpoint: string;
  maxPages?: number;
  categories?: string[];
  remoteOnly?: boolean;
  termsUrl: string;
  termsNote: string;
  attribution: { required: boolean; text: string; url: string; follow: boolean };
  usage: { alerts: boolean; structuredData: boolean };
  minHoursBetweenFetches: number;
}

export interface SourcesConfig {
  verifiedAt: string;
  userAgent: string;
  ats: Record<AtsId, AtsDef>;
  portals: PortalDef[];
  excluded: { name: string; reason: string; evidenceUrl: string; alternative: string }[];
  hostPolicies: Record<string, Partial<HostPolicy>>;
  /** Horas mínimas entre consultas al mismo tablero de empresa (con ETag, casi siempre responde 304). */
  atsMinHoursBetweenFetches?: number;
  fx: { url: string; source: string; termsUrl: string };
}

export interface CompanyEntry {
  id: string;
  name: string;
  ats: AtsId;
  board: string;
  region: Region;
  cities: string[];
  sector: string;
  website: string | null;
  careersUrl?: string;
  evidence: { jobs: number | null; ecuador: number | null; latam: number | null };
  notes?: string;
  eu?: boolean;
}

/** País foco del observatorio y ciudad de referencia de los datos de demostración. */
export interface HomeConfig {
  city: string;
  country: string;
}

export interface IngestConfig {
  home: HomeConfig;
  excerptMaxChars: number;
  retention: { closedDays: number; maxAgeDays: number };
  dedupe: { windowDays: number; titleSimilarity: number; descriptionSimilarity: number; skillsSimilarity: number; strictSeniority: boolean };
  smartrecruitersDetailOnlyForTechTitles: boolean;
  salary: SalaryConfig;
  classification: ClassificationConfig;
  logos: { maxBytes: number; maxNewPerRun: number };
}

export interface LoadedData {
  dataDir: string;
  sources: SourcesConfig;
  companies: { verifiedAt: string; companies: CompanyEntry[] };
  careerPages: object;
  deepLinks: object;
  ingest: IngestConfig;
  extraction: ExtractionConfig;
  catalog: SkillCatalog;
  geo: GeoData;
  scoring: object;
  learning: object;
  dependencies: object;
  curricula: object;
  observatory: ObservatoryConfig;
}

export function defaultDataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return process.env['NORTE_DATA_DIR'] ? resolve(process.env['NORTE_DATA_DIR']) : resolve(here, '../../data');
}

function readJson<T>(dataDir: string, ...parts: string[]): T {
  return JSON.parse(readFileSync(join(dataDir, ...parts), 'utf8')) as T;
}

function readOptional<T>(dataDir: string, fallback: T, ...parts: string[]): T {
  try {
    return readJson<T>(dataDir, ...parts);
  } catch {
    return fallback;
  }
}

/** Añade a cada habilidad su equivalente ESCO (generado una sola vez por scripts/esco-fetch.mjs). */
function withEsco(catalog: SkillCatalog, dataDir: string): SkillCatalog {
  const esco = readOptional<{ escoVersion?: string; mappings: Record<string, { uri: string; label: string }> }>(dataDir, { mappings: {} }, 'esco', 'esco-skills-es.json');
  return { ...catalog, skills: catalog.skills.map((s) => ({ ...s, esco: esco.mappings[s.id] ?? null })) };
}

export function loadData(dataDir = defaultDataDir()): LoadedData {
  return {
    dataDir,
    sources: readJson(dataDir, 'sources', 'sources.json'),
    companies: readJson(dataDir, 'sources', 'companies.json'),
    careerPages: readJson(dataDir, 'sources', 'career-pages.json'),
    deepLinks: readJson(dataDir, 'sources', 'deep-links.json'),
    ingest: readJson(dataDir, 'config', 'ingest.json'),
    extraction: readJson(dataDir, 'skills', 'extraction.json'),
    catalog: withEsco(readOptional(dataDir, { version: '0', skills: [] }, 'skills', 'catalog.json'), dataDir),
    geo: buildGeoData(readJson(dataDir, 'geo', 'geo.json'), readJson<{ countries: CountryName[] }>(dataDir, 'geo', 'countries.json'), readOptional<{ cities: CityRow[] }>(dataDir, { cities: [] }, 'geo', 'cities.json')),
    scoring: readOptional(dataDir, {}, 'config', 'scoring.json'),
    learning: readOptional(dataDir, { resources: [] }, 'skills', 'learning.json'),
    dependencies: readOptional(dataDir, {}, 'skills', 'dependencies.json'),
    curricula: readOptional(dataDir, { curricula: [] }, 'academia', 'curricula.json'),
    observatory: readJson(dataDir, 'config', 'observatory.json'),
  };
}

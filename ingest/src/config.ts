import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClassificationConfig, ExtractionConfig, GeoData, HomeConfig, Region, SalaryConfig, SkillCatalog } from '@norte/core';
import type { HostPolicy } from './http/client.js';

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

export interface IngestConfig {
  home: HomeConfig;
  excerptMaxChars: number;
  retention: { closedDays: number; maxAgeDays: number };
  dedupe: { windowDays: number; titleSimilarity: number; descriptionSimilarity: number; skillsSimilarity: number; strictSeniority: boolean };
  smartrecruitersDetailOnlyForTechTitles: boolean;
  salary: SalaryConfig;
  classification: ClassificationConfig;
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
  curricula: object;
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

export function loadData(dataDir = defaultDataDir()): LoadedData {
  return {
    dataDir,
    sources: readJson(dataDir, 'sources', 'sources.json'),
    companies: readJson(dataDir, 'sources', 'companies.json'),
    careerPages: readJson(dataDir, 'sources', 'career-pages.json'),
    deepLinks: readJson(dataDir, 'sources', 'deep-links.json'),
    ingest: readJson(dataDir, 'config', 'ingest.json'),
    extraction: readJson(dataDir, 'skills', 'extraction.json'),
    catalog: readOptional(dataDir, { version: '0', skills: [] }, 'skills', 'catalog.json'),
    geo: readJson(dataDir, 'geo', 'geo.json'),
    scoring: readOptional(dataDir, {}, 'config', 'scoring.json'),
    learning: readOptional(dataDir, { resources: [] }, 'skills', 'learning.json'),
    curricula: readOptional(dataDir, { curricula: [] }, 'academia', 'curricula.json'),
  };
}

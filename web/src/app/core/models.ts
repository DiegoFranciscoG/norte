import type { Cefr, CityRow, ExtractionConfig, Job, LearningResource, Modality, ProfileRepo, RegionCode, ScoringConfig, SkillDef, Weights } from '@norte/core';

export interface SourceRunInfo {
  sourceId: string;
  sourceName: string;
  status: 'ok' | 'failed' | 'skipped';
  fetched: number;
  kept: number;
  error: string | null;
  lastFetchedAt: string | null;
}

export interface IndexFile {
  schemaVersion: number;
  demo: boolean;
  build: { version: string; generatedAt: string; commit: string | null };
  totals: {
    open: number;
    closed: number;
    byModality: Record<Modality, number>;
    countries: number;
    remoteScopeUnknown: number;
    withSalary: number;
    postingsFetched: number;
    duplicatesMerged: number;
  };
  sources: SourceRunInfo[];
  license: { code: string; statistics: string; jobs: string };
}

/** Países con vacantes presenciales y sus ciudades; regiones para decidir qué remotos admiten a cada país. */
export interface GeoIndex {
  regions: Partial<Record<RegionCode, string[]>>;
  countries: { iso: string; name: string; open: number; cities: { name: string; open: number }[] }[];
}

export interface CitiesFile {
  license: string;
  cities: CityRow[];
}

export interface SkillsFile {
  version: string;
  extraction: ExtractionConfig;
  skills: SkillDef[];
}

export interface DeepLink {
  id: string;
  name: string;
  template: string;
  slugify: boolean;
}

export interface CareerPage {
  id: string;
  name: string;
  city: string;
  sector: string;
  url: string;
  notes?: string;
}

export interface CompanyInfo {
  id: string;
  name: string;
  ats: string;
  boardUrl: string;
  region: string;
  cities: string[];
  sector: string;
  website: string | null;
  careersUrl: string | null;
  openJobs: number;
}

export interface SourcesFile {
  verifiedAt: string;
  ats: { id: string; name: string; termsUrl: string; termsNote: string }[];
  portals: { id: string; name: string; enabled: boolean; attribution: { required: boolean; text: string; url: string }; termsUrl: string; termsNote: string }[];
  excluded: { name: string; reason: string; evidenceUrl: string; alternative: string }[];
  fx: { url: string; source: string };
}

export type ApplicationStatus = 'saved' | 'applied' | 'replied' | 'interview' | 'offer' | 'rejected';

export const APPLICATION_STATUSES: { id: ApplicationStatus; label: string }[] = [
  { id: 'saved', label: 'Guardada' },
  { id: 'applied', label: 'Postulada' },
  { id: 'replied', label: 'Respondió' },
  { id: 'interview', label: 'Entrevista' },
  { id: 'offer', label: 'Oferta' },
  { id: 'rejected', label: 'Rechazada' },
];

export interface Application {
  id: string;
  jobId: string;
  title: string;
  company: string;
  url: string;
  status: ApplicationStatus;
  savedAt: string;
  appliedAt: string | null;
  updatedAt: string;
  followUpAt: string | null;
  notes: string;
  /** id en el servidor si la cuenta está sincronizada */
  remoteId?: string | null;
}

export type WorkMode = Exclude<Modality, 'unknown'>;

export interface StoredProfile {
  version: 2;
  declared: string[];
  demonstrated: { id: string; repos: string[]; evidence: { repo: string; path: string; detail: string }[] }[];
  repos: ProfileRepo[];
  githubUser: string | null;
  yearsOfExperience: number | null;
  yearsSource: 'cv' | 'manual' | null;
  englishLevel: Cefr | null;
  /** País (ISO alfa-2) y ciudad donde vive la persona. La ubicación exacta nunca se guarda. */
  homeCountry: string | null;
  homeCity: string | null;
  /** Modalidades que busca: presencial y híbrido en su país, remoto donde la admitan. */
  modalities: WorkMode[];
  onboarded: boolean;
  acceptsRelocation: boolean;
  minSalaryUsd: number | null;
  weights: Partial<Weights> | null;
  updatedAt: string | null;
}

export interface LearningFile {
  resources: LearningResource[];
}

export type { ScoringConfig };
export type { Job };

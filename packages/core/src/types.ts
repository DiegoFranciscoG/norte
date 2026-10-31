export type Modality = 'onsite' | 'hybrid' | 'remote' | 'unknown';
export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'freelance' | 'internship' | 'temporary' | 'unknown';
export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'unknown';
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type JobGroup = 'home' | 'ecuador' | 'remote' | 'freelance';
export type RemoteScopeType = 'worldwide' | 'latam' | 'americas' | 'countries' | 'excluding-latam' | 'unknown';
export type Region = 'EC' | 'LATAM' | 'WORLD';

export interface JobLocation {
  city: string | null;
  province: string | null;
  /** ISO 3166-1 alfa-2 */
  country: string | null;
  raw: string;
}

export interface RemoteScope {
  type: RemoteScopeType;
  countries: string[];
  /** true: admite Ecuador; false: lo excluye; null: no se puede saber */
  ecuadorEligible: boolean | null;
}

export interface Salary {
  min: number | null;
  max: number | null;
  currency: string;
  period: 'hour' | 'day' | 'week' | 'month' | 'year';
  usdMonthlyMin: number | null;
  usdMonthlyMax: number | null;
  convertible: boolean;
  fx: { source: string; date: string; rate: number } | null;
}

export interface LanguageRequirement {
  /** ISO 639-1 */
  language: string;
  level: Cefr | null;
  inferred: boolean;
}

export interface JobSkill {
  id: string;
  optional: boolean;
}

export interface Attribution {
  text: string;
  url: string;
  follow: boolean;
}

export interface JobSourceRef {
  sourceId: string;
  externalId: string;
  sourceName: string;
  url: string;
  applyUrl: string | null;
  attribution: Attribution | null;
  allowInAlerts: boolean;
  fetchedAt: string;
}

export interface Job {
  id: string;
  title: string;
  company: { name: string; slug: string };
  location: JobLocation;
  modality: Modality;
  remoteScope: RemoteScope | null;
  group: JobGroup;
  employmentType: EmploymentType;
  seniority: Seniority;
  yearsRequired: number | null;
  yearsInferred: boolean;
  skills: JobSkill[];
  salary: Salary | null;
  languages: LanguageRequirement[];
  postingLanguage: 'es' | 'en' | 'pt' | 'other';
  publishedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: 'open' | 'closed';
  closedAt: string | null;
  excerpt: string;
  sector: string | null;
  sources: JobSourceRef[];
  fingerprint: string;
}

export type SkillCategory =
  | 'language' | 'frontend' | 'backend' | 'mobile' | 'database' | 'cloud' | 'devops' | 'testing'
  | 'data' | 'ai' | 'security' | 'tool' | 'methodology' | 'architecture' | 'design' | 'erp' | 'os' | 'soft';

export interface ContextAlias {
  alias: string;
  /** Al menos una de estas palabras debe aparecer cerca del alias. */
  anyOf: string[];
  /** Ventana en caracteres alrededor del alias (por defecto 80). */
  window?: number;
  caseSensitive?: boolean;
}

export interface SkillDef {
  id: string;
  name: string;
  category: SkillCategory;
  aliases: string[];
  contextAliases?: ContextAlias[];
  /** Habilidades que esta implica (spring-boot implica java). */
  implies?: string[];
  related?: string[];
  esco?: { uri: string; label: string } | null;
}

export interface SkillCatalog {
  version: string;
  skills: SkillDef[];
}

export interface SkillMatch {
  id: string;
  optional: boolean;
  fuzzy: boolean;
}

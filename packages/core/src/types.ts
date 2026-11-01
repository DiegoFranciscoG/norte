export type Modality = 'onsite' | 'hybrid' | 'remote' | 'unknown';
export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'freelance' | 'internship' | 'temporary' | 'unknown';
export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'unknown';
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
/** Grupos relativos a la ubicación de cada persona: se calculan en el navegador, no en el índice. */
export type JobGroup = 'near' | 'country' | 'remote' | 'freelance';
export type RemoteScopeType = 'worldwide' | 'regions' | 'countries' | 'unknown';
export type RegionCode = 'latam' | 'north-america' | 'americas' | 'europe' | 'middle-east' | 'africa' | 'emea' | 'apac';
export type Region = 'EC' | 'LATAM' | 'WORLD';

export interface JobLocation {
  city: string | null;
  province: string | null;
  /** ISO 3166-1 alfa-2 */
  country: string | null;
  raw: string;
}

/** A quién admite un remoto. La elegibilidad para un país concreto la calcula remoteEligibility(). */
export interface RemoteScope {
  type: RemoteScopeType;
  regions: RegionCode[];
  /** ISO 3166-1 alfa-2 admitidos explícitamente */
  countries: string[];
}

/** Dónde vive la persona: lo elige ella (o lo calcula su navegador); nunca se envía sin consentimiento. */
export interface UserPlace {
  country: string | null;
  city: string | null;
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
  /** logo: ruta relativa al índice («logos/…»), descargada y validada en la ingesta; nunca una URL externa. */
  company: { name: string; slug: string; logo?: string | null };
  location: JobLocation;
  modality: Modality;
  remoteScope: RemoteScope | null;
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

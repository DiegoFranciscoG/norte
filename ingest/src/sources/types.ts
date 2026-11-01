import type { Attribution, Modality, RawSalary, Region } from '@norte/core';
import type { HttpClient } from '../http/client.js';

/** Vacante tal como la entrega una fuente, antes de normalizar. */
export interface RawPosting {
  sourceId: string;
  externalId: string;
  title: string;
  company: string;
  companyRegion?: Region | null;
  sector?: string | null;
  locationTexts: string[];
  countryIso?: string | null;
  city?: string | null;
  structuredCountries?: string[];
  modality?: Modality | null;
  employmentText?: string | null;
  seniorityTexts?: string[];
  salary?: RawSalary | null;
  salaryText?: string | null;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  optionalText?: string | null;
  postingLanguageHint?: string | null;
  publishedAt: string | null;
  url: string;
  applyUrl?: string | null;
  tags?: string[];
  remoteOnlySource?: boolean;
  /** Logo de la empresa que entrega la propia fuente (solo fuentes que lo permiten). */
  companyLogoUrl?: string | null;
}

export interface FetchContext {
  http: HttpClient;
  now: Date;
  log: (message: string) => void;
  isTechTitle: (title: string) => boolean;
}

export interface SourceTask {
  sourceId: string;
  sourceName: string;
  kind: 'ats' | 'portal';
  attribution: Attribution | null;
  allowInAlerts: boolean;
  minHoursBetweenFetches: number;
  run(ctx: FetchContext): Promise<RawPosting[]>;
}

export type Json = Record<string, unknown>;

export const asObj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
export const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
export const asStr = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
export const asNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function isoFromEpoch(value: unknown): string | null {
  const n = asNum(value);
  if (n === null) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoFromDate(value: unknown): string | null {
  const s = asStr(value).trim();
  if (!s) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/.test(s) ? s.replace(' UTC', 'Z').replace(' ', 'T') : s;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseJson(body: string, sourceId: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${sourceId}: la respuesta no es JSON válido`);
  }
}

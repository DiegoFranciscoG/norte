import { diceSimilarity, fnv1a, normalizeText, type Cefr, type JobSkill, type LanguageRequirement } from '@norte/core';
import type { NormalizedPosting } from './normalize.js';

export interface DedupeConfig {
  windowDays: number;
  titleSimilarity: number;
  descriptionSimilarity: number;
  skillsSimilarity: number;
  strictSeniority: boolean;
}

function skillsJaccard(a: NormalizedPosting, b: NormalizedPosting): number {
  const sa = new Set(a.skills.map((s) => s.id));
  const sb = new Set(b.skills.map((s) => s.id));
  if (sa.size === 0 && sb.size === 0) return 1;
  let shared = 0;
  for (const id of sa) if (sb.has(id)) shared++;
  return shared / (sa.size + sb.size - shared);
}

export type MergedPosting = NormalizedPosting & { fingerprint: string; externalKeys: string[] };

const SENIORITY_SYNONYMS: [RegExp, string][] = [
  [/\b(sr|snr|senior)\b\.?/g, 'senior'],
  [/\b(jr|junior)\b\.?/g, 'junior'],
  [/\b(ssr|semi ?senior|semisenior|mid ?level|mid)\b/g, 'semisenior'],
  [/\b(dev)\b/g, 'developer'],
  [/\b(eng)\b/g, 'engineer'],
  [/\b(desarrolladora?)\b/g, 'desarrollador'],
  [/\b(ingeniera)\b/g, 'ingeniero'],
];
const NOISE = /\b(remote|remoto|remota|hybrid|hibrido|latam|latin america|worldwide|anywhere|full ?time|part ?time|tiempo completo|contract|contractor|freelance|ecuador|quito|guayaquil|cuenca|colombia|mexico|peru|chile|argentina|brazil|brasil|us|usa)\b/g;

/** Título comparable: sin tildes, ruido de ubicación/modalidad, ni prefijos numéricos de referencia («151.»). */
export function normalizeTitle(title: string): string {
  let t = normalizeText(title)
    .replace(/^\(?\d{1,4}[.)-]\s*/, '')
    .replace(/[()[\]{}|/,–—:-]+/g, ' ');
  for (const [re, rep] of SENIORITY_SYNONYMS) t = t.replace(re, rep);
  return t.replace(NOISE, ' ').replace(/[^a-z0-9+#. ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function seniorityToken(title: string): string {
  const t = normalizeTitle(title);
  if (/\b(intern|pasante|trainee|practicante)\b/.test(t)) return 'intern';
  if (/\b(lead|lider|principal|staff|head|architect|arquitecto)\b/.test(t)) return 'lead';
  if (/\bsenior\b/.test(t)) return 'senior';
  if (/\bsemisenior\b/.test(t)) return 'mid';
  if (/\bjunior\b/.test(t)) return 'junior';
  return '';
}

function locationKey(p: NormalizedPosting): string {
  if (p.modality === 'remote') return 'remote';
  return `${p.location.country ?? '?'}:${normalizeText(p.location.city ?? '')}`;
}

export function fingerprintOf(p: NormalizedPosting): string {
  return fnv1a(`${p.company.slug}|${normalizeTitle(p.title)}|${locationKey(p)}`);
}

function locationsCompatible(a: NormalizedPosting, b: NormalizedPosting): boolean {
  if (a.modality === 'remote' || b.modality === 'remote') return a.modality === b.modality || a.location.country === b.location.country;
  if (a.location.country !== b.location.country) return false;
  return !a.location.city || !b.location.city || normalizeText(a.location.city) === normalizeText(b.location.city);
}

const DAY = 86400000;

/**
 * Decide si dos publicaciones son la misma vacante.
 * 1. Huella: misma empresa, título normalizado idéntico, ubicación compatible y fechas dentro de la ventana.
 * 2. Caso dudoso (títulos parecidos pero no idénticos): solo se unen si además coinciden las habilidades y la descripción.
 * Misma fuente: solo con título y ubicación idénticos (una empresa puede abrir el mismo cargo en dos ciudades).
 */
export function isDuplicate(a: NormalizedPosting, b: NormalizedPosting, cfg: DedupeConfig): boolean {
  if (a.company.slug !== b.company.slug) return false;
  // La misma publicación de la fuente en el mismo lugar lo es siempre, aunque cambien su título o su fecha.
  if (a.externalKey === b.externalKey && locationKey(a) === locationKey(b)) return true;
  const gap = Math.abs(Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  if (gap > cfg.windowDays * DAY) return false;
  if (cfg.strictSeniority && seniorityToken(a.title) !== seniorityToken(b.title)) return false;
  const ta = normalizeTitle(a.title);
  const tb = normalizeTitle(b.title);
  const sameSource = a.sources[0]!.sourceId === b.sources[0]!.sourceId;
  if (sameSource) return ta === tb && locationKey(a) === locationKey(b);
  if (!locationsCompatible(a, b)) return false;
  if (ta === tb) return true;
  return (
    diceSimilarity(ta, tb) >= cfg.titleSimilarity &&
    skillsJaccard(a, b) >= cfg.skillsSimilarity &&
    a.excerpt.length > 40 &&
    diceSimilarity(a.excerpt, b.excerpt) >= cfg.descriptionSimilarity
  );
}

const SOURCE_PRIORITY: Record<string, number> = { ats: 0, portal: 1 };
const CEFR_RANK: Record<Cefr, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

function mergeLanguages(groups: LanguageRequirement[][]): LanguageRequirement[] {
  const byLang = new Map<string, LanguageRequirement>();
  for (const list of groups) {
    for (const req of list) {
      const prev = byLang.get(req.language);
      if (!prev) byLang.set(req.language, req);
      else if (prev.inferred && !req.inferred) byLang.set(req.language, req);
      else if (prev.inferred === req.inferred && req.level && (!prev.level || CEFR_RANK[req.level] > CEFR_RANK[prev.level])) byLang.set(req.language, req);
    }
  }
  return [...byLang.values()];
}

function mergeSkills(groups: JobSkill[][]): JobSkill[] {
  const byId = new Map<string, JobSkill>();
  for (const list of groups) for (const s of list) {
    const prev = byId.get(s.id);
    byId.set(s.id, { id: s.id, optional: prev ? prev.optional && s.optional : s.optional });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Une los duplicados con union-find por bloques de empresa y devuelve una vacante por grupo con todos sus orígenes. */
export function dedupe(postings: NormalizedPosting[], cfg: DedupeConfig): MergedPosting[] {
  const parent = postings.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const blocks = new Map<string, number[]>();
  postings.forEach((p, i) => {
    const list = blocks.get(p.company.slug) ?? [];
    list.push(i);
    blocks.set(p.company.slug, list);
  });
  for (const idx of blocks.values()) {
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        if (isDuplicate(postings[idx[x]!]!, postings[idx[y]!]!, cfg)) union(idx[x]!, idx[y]!);
      }
    }
  }
  const clusters = new Map<number, NormalizedPosting[]>();
  postings.forEach((p, i) => {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push(p);
    clusters.set(root, list);
  });

  return [...clusters.values()].map((members) => {
    const sorted = [...members].sort((a, b) =>
      (SOURCE_PRIORITY[a.sourceKind] ?? 9) - (SOURCE_PRIORITY[b.sourceKind] ?? 9) || a.publishedAt.localeCompare(b.publishedAt) || a.externalKey.localeCompare(b.externalKey));
    const primary = sorted[0]!;
    const withSalary = sorted.find((m) => m.salary?.convertible) ?? sorted.find((m) => m.salary);
    // Una referencia por fuente: si un tablero repite la vacante por país, se muestra un solo enlace.
    const seenSources = new Set<string>();
    const sources = sorted.flatMap((m) => m.sources).filter((s) => !seenSources.has(s.sourceId) && seenSources.add(s.sourceId));
    return {
      ...primary,
      skills: mergeSkills(sorted.map((m) => m.skills)),
      languages: mergeLanguages(sorted.map((m) => m.languages)),
      salary: withSalary?.salary ?? null,
      yearsRequired: sorted.map((m) => m.yearsRequired).find((y) => y !== null) ?? null,
      publishedAt: sorted.map((m) => m.publishedAt).sort()[0]!,
      sources,
      externalKeys: sorted.map((m) => m.externalKey),
      fingerprint: fingerprintOf(primary),
    };
  });
}

import {
  classifyGroup,
  detectPostingLanguage,
  htmlToText,
  makeExcerpt,
  normalizeSalary,
  parseSalaryText,
  slugify,
  type FxTable,
  type GeoResolver,
  type Job,
  type JobClassifier,
  type JobSourceRef,
  type SkillMatcher,
} from '@norte/core';
import type { IngestConfig } from './config.js';
import type { RawPosting, SourceTask } from './sources/types.js';

/** Vacante normalizada de una sola fuente, antes de deduplicar y de asignarle id estable. */
export type NormalizedPosting = Omit<Job, 'id' | 'firstSeenAt' | 'lastSeenAt' | 'status' | 'closedAt' | 'fingerprint'> & {
  externalKey: string;
  sourceKind: SourceTask['kind'];
};

export interface NormalizeDeps {
  cfg: IngestConfig;
  classifier: JobClassifier;
  geo: GeoResolver;
  matcher: SkillMatcher;
  fx: FxTable | null;
  now: Date;
}

export type DropReason = 'not-tech' | 'outside-groups' | 'invalid';

const LEGAL_SUFFIX = /\s+(inc|llc|ltd|limited|s ?a ?s|s ?a|gmbh|corp|corporation|co|cia|ltda|plc|bv|ag)$/i;

/** Nombre comparable entre fuentes: «Thoughtworks Inc.» y «ThoughtWorks» son la misma empresa. */
export function companySlug(name: string): string {
  let s = name.replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(LEGAL_SUFFIX, '').trim();
  }
  return slugify(s);
}

export function normalizePosting(raw: RawPosting, task: SourceTask, deps: NormalizeDeps): NormalizedPosting | DropReason {
  const title = raw.title.replace(/\s+/g, ' ').trim();
  const company = raw.company.replace(/\s+/g, ' ').trim();
  if (!title || !company || !raw.url) return 'invalid';
  if (!deps.classifier.isTechTitle(title)) return 'not-tech';

  const description = (raw.descriptionText?.trim() || htmlToText(raw.descriptionHtml)).slice(0, 20000);
  const hint = raw.postingLanguageHint?.slice(0, 2).toLowerCase();
  const postingLanguage = hint === 'es' || hint === 'en' || hint === 'pt' ? hint : detectPostingLanguage(`${title}\n${description}`);

  const locationTexts = raw.locationTexts.filter(Boolean);
  let modality = deps.classifier.modality(raw.modality ?? (raw.remoteOnlySource ? 'remote' : null), [title, ...locationTexts]);
  if (modality === 'unknown') modality = deps.classifier.modality(null, [description.slice(0, 1500)]);
  const location = deps.geo.parseLocation(locationTexts, { countryIso: raw.countryIso ?? null, city: raw.city ?? null, companyRegion: raw.companyRegion ?? null });
  const structured = (raw.structuredCountries ?? []).map((c) => deps.geo.toIso(c)).filter((c): c is string => c !== null);
  let remoteScope = null;
  if (modality === 'remote') {
    remoteScope = location.country === 'EC'
      ? { type: 'countries' as const, countries: ['EC'], ecuadorEligible: true }
      : deps.geo.detectRemoteScope([...locationTexts, title], structured);
  }
  const employmentType = deps.classifier.employmentType(raw.employmentText, [title]);
  const group = classifyGroup({ modality, location, remoteScope, employmentType }, deps.cfg.home);
  if (!group) return 'outside-groups';

  const skillText = `${title}\n${description}\n${(raw.tags ?? []).join(', ')}`;
  const skills = deps.matcher.extract(skillText, raw.optionalText ?? undefined).map(({ id, optional }) => ({ id, optional }));
  const salary = normalizeSalary(raw.salary ?? parseSalaryText(raw.salaryText), deps.fx, deps.cfg.salary);
  const fetchedAt = deps.now.toISOString();
  const publishedAt = raw.publishedAt && raw.publishedAt <= fetchedAt ? raw.publishedAt : fetchedAt;
  const source: JobSourceRef = {
    sourceId: task.sourceId,
    externalId: raw.externalId,
    sourceName: task.sourceName,
    url: raw.url,
    applyUrl: raw.applyUrl ?? null,
    attribution: task.attribution,
    allowInAlerts: task.allowInAlerts,
    fetchedAt,
  };

  return {
    externalKey: `${task.sourceId}#${raw.externalId}`,
    sourceKind: task.kind,
    title,
    company: { name: company, slug: companySlug(company) },
    location,
    modality,
    remoteScope,
    group,
    employmentType,
    seniority: deps.classifier.seniority(title, raw.seniorityTexts ?? []),
    yearsRequired: deps.classifier.yearsRequired(description),
    yearsInferred: false,
    skills,
    salary,
    languages: deps.classifier.languages(`${title}\n${description}`, postingLanguage),
    postingLanguage,
    publishedAt,
    excerpt: makeExcerpt(description, deps.cfg.excerptMaxChars),
    sector: raw.sector ?? null,
    sources: [source],
  };
}

import { escapeRegExp, normalizeText } from './text.js';
import type { Cefr, EmploymentType, LanguageRequirement, Modality, Seniority } from './types.js';

export interface ClassificationConfig {
  modality: Record<'remote' | 'hybrid' | 'onsite', string[]>;
  employment: Record<Exclude<EmploymentType, 'unknown'>, string[]>;
  seniority: Record<Exclude<Seniority, 'unknown'>, string[]>;
  years: { maxPlausible: number; experienceWords: string[]; ignoreIfNear: string[] };
  languages: {
    english: string[];
    spanish: string[];
    portuguese: string[];
    levelWords: Record<Cefr, string[]>;
    postingInEnglishImplies: Cefr;
  };
  techTitle: { include: string[]; exclude: string[] };
}

const CEFR_ORDER: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const cefrRank = (level: Cefr): number => CEFR_ORDER.indexOf(level) + 1;

function termRegex(term: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(normalizeText(term))}(?![a-z0-9])`);
}

function anyTerm(text: string, regexes: RegExp[]): boolean {
  return regexes.some((r) => r.test(text));
}

export interface JobClassifier {
  modality(structured: Modality | null, texts: string[]): Modality;
  employmentType(structured: string | null | undefined, texts: string[]): EmploymentType;
  seniority(title: string, structured: string[]): Seniority;
  yearsRequired(text: string): number | null;
  languages(text: string, postingLanguage: string): LanguageRequirement[];
  isTechTitle(title: string): boolean;
}

export function createJobClassifier(cfg: ClassificationConfig): JobClassifier {
  const compile = (list: string[]) => list.map(termRegex);
  const modality = { remote: compile(cfg.modality.remote), hybrid: compile(cfg.modality.hybrid), onsite: compile(cfg.modality.onsite) };
  const employment = Object.fromEntries(Object.entries(cfg.employment).map(([k, v]) => [k, compile(v)])) as Record<Exclude<EmploymentType, 'unknown'>, RegExp[]>;
  const seniority = Object.fromEntries(Object.entries(cfg.seniority).map(([k, v]) => [k, compile(v)])) as Record<Exclude<Seniority, 'unknown'>, RegExp[]>;
  const techInclude = compile(cfg.techTitle.include);
  const techExclude = compile(cfg.techTitle.exclude);
  const experienceWords = cfg.years.experienceWords.map(normalizeText);
  const ignoreNear = cfg.years.ignoreIfNear.map(normalizeText);
  const levelWords = (Object.entries(cfg.languages.levelWords) as [Cefr, string[]][])
    .map(([level, words]) => ({ level, regexes: compile(words) }))
    .sort((a, b) => cefrRank(b.level) - cefrRank(a.level));

  function detectModality(structured: Modality | null, texts: string[]): Modality {
    if (structured && structured !== 'unknown') return structured;
    const text = normalizeText(texts.join(' \n '));
    if (anyTerm(text, modality.hybrid)) return 'hybrid';
    if (anyTerm(text, modality.remote)) return 'remote';
    if (anyTerm(text, modality.onsite)) return 'onsite';
    return 'unknown';
  }

  function detectEmployment(structured: string | null | undefined, texts: string[]): EmploymentType {
    const order: Exclude<EmploymentType, 'unknown'>[] = ['freelance', 'internship', 'temporary', 'contract', 'part-time', 'full-time'];
    for (const source of [structured ?? '', texts.join(' \n ')]) {
      const text = normalizeText(source);
      if (!text) continue;
      for (const type of order) if (anyTerm(text, employment[type])) return type;
    }
    return 'unknown';
  }

  function detectSeniority(title: string, structured: string[]): Seniority {
    const order: Exclude<Seniority, 'unknown'>[] = ['intern', 'lead', 'senior', 'mid', 'junior'];
    for (const source of [title, structured.join(' ')]) {
      const text = normalizeText(source);
      if (!text) continue;
      for (const level of order) if (anyTerm(text, seniority[level])) return level;
    }
    return 'unknown';
  }

  function detectYears(raw: string): number | null {
    const text = normalizeText(raw);
    const re = /(\d{1,2})(?:\s*(?:-|–|a|to)\s*(\d{1,2}))?\s*\+?\s*(?:anos|ano|years?|yrs?)(?![a-z])/g;
    let best: number | null = null;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const value = Number(m[1]);
      if (!Number.isFinite(value) || value <= 0 || value > cfg.years.maxPlausible) continue;
      const window = text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
      if (!experienceWords.some((w) => window.includes(w))) continue;
      if (ignoreNear.some((w) => window.includes(w))) continue;
      best = best === null ? value : Math.max(best, value);
    }
    return best;
  }

  function levelNear(text: string, names: RegExp[]): { mentioned: boolean; level: Cefr | null } {
    let mentioned = false;
    let level: Cefr | null = null;
    for (const name of names) {
      const global = new RegExp(name.source, 'g');
      for (let m = global.exec(text); m; m = global.exec(text)) {
        mentioned = true;
        const window = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
        const cefr = window.match(/(?<![a-z0-9])(a1|a2|b1|b2|c1|c2)(?![a-z0-9])/);
        const found = cefr ? (cefr[1]!.toUpperCase() as Cefr) : levelWords.find((lw) => anyTerm(window, lw.regexes))?.level ?? null;
        if (found && (!level || cefrRank(found) > cefrRank(level))) level = found;
      }
    }
    return { mentioned, level };
  }

  function detectLanguages(raw: string, postingLanguage: string): LanguageRequirement[] {
    const text = normalizeText(raw);
    const out: LanguageRequirement[] = [];
    const en = levelNear(text, compile(cfg.languages.english));
    if (en.mentioned) out.push({ language: 'en', level: en.level, inferred: false });
    else if (postingLanguage === 'en') out.push({ language: 'en', level: cfg.languages.postingInEnglishImplies, inferred: true });
    const pt = levelNear(text, compile(cfg.languages.portuguese));
    if (pt.mentioned) out.push({ language: 'pt', level: pt.level, inferred: false });
    if (postingLanguage === 'pt' && !pt.mentioned) out.push({ language: 'pt', level: cfg.languages.postingInEnglishImplies, inferred: true });
    return out;
  }

  function isTechTitle(title: string): boolean {
    const text = normalizeText(title);
    return anyTerm(text, techInclude) && !anyTerm(text, techExclude);
  }

  return {
    modality: detectModality,
    employmentType: detectEmployment,
    seniority: detectSeniority,
    yearsRequired: detectYears,
    languages: detectLanguages,
    isTechTitle,
  };
}

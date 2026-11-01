import { cefrRank } from './classify.js';
import { placeKey, remoteEligibility } from './geo.js';
import type { SkillMatcher } from './skills.js';
import type { Cefr, Job, RegionCode, Seniority } from './types.js';

export type ComponentKey = 'demonstrated' | 'declared' | 'experience' | 'location' | 'language' | 'compensation' | 'freshness';
export const COMPONENT_ORDER: ComponentKey[] = ['demonstrated', 'declared', 'experience', 'location', 'language', 'compensation', 'freshness'];
export type Weights = Record<ComponentKey, number>;

export interface ScoringConfig {
  version: string;
  weights: Weights;
  fitThreshold: number;
  decimals: number;
  skills: { optionalWeight: number; excludeCategories: string[] };
  experience: { levelMinYears: Record<Exclude<Seniority, 'unknown'>, number> };
  location: {
    home: number;
    sameCountryOtherCityWithRelocation: number;
    sameCountryOtherCityWithoutRelocation: number;
    remoteEligible: number;
    remoteScopeUnknown: number;
    remoteExcluded: number;
    abroad: number;
    unknownUserLocation: number;
  };
  language: { defaultRequiredLevel: Cefr; nativeLanguage: string };
  freshness: { fullUntilDays: number; zeroAtDays: number };
  gap: { maxRecommendations: number; closestRepoMinOverlap: number };
}

export interface ProfileSkill {
  id: string;
  origin: 'demonstrated' | 'declared';
  repos?: string[];
}

export interface Profile {
  skills: ProfileSkill[];
  yearsOfExperience: number | null;
  englishLevel: Cefr | null;
  otherLanguages?: Record<string, Cefr>;
  /** País de residencia (ISO alfa-2) y ciudad; null si la persona aún no los indicó. */
  homeCountry: string | null;
  homeCity: string | null;
  acceptsRelocation: boolean;
  minSalaryUsd: number | null;
  weights?: Partial<Weights> | null;
}

export type ComponentStatus = 'ok' | 'partial' | 'missing' | 'not-declared' | 'not-applicable';

export interface ScoreComponent {
  key: ComponentKey;
  points: number;
  max: number;
  ratio: number;
  status: ComponentStatus;
  detail: string;
}

export interface ScoreResult {
  total: number;
  components: ScoreComponent[];
  fit: 'good' | 'below-threshold';
  skills: { demonstrated: string[]; declaredOnly: string[]; missing: string[]; missingOptional: string[] };
  flags: string[];
}

export interface ScoringContext {
  matcher: SkillMatcher;
  config: ScoringConfig;
  now: Date;
  /** Pertenencia de países a regiones (data/geo/geo.json) para saber si un remoto admite el país de la persona. */
  regions: Partial<Record<RegionCode, string[]>>;
}

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' });
  } catch {
    return null;
  }
})();

export function countryLabel(iso: string | null): string {
  if (!iso) return 'tu país';
  try {
    return countryNames?.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

/** Pesos efectivos: los del usuario (o los de configuración) escalados para que sumen 100. */
export function effectiveWeights(config: ScoringConfig, custom?: Partial<Weights> | null): Weights {
  const raw = { ...config.weights, ...(custom ?? {}) } as Weights;
  const sum = COMPONENT_ORDER.reduce((acc, k) => acc + Math.max(0, raw[k] ?? 0), 0);
  if (sum <= 0) return { ...config.weights };
  return Object.fromEntries(COMPONENT_ORDER.map((k) => [k, (Math.max(0, raw[k] ?? 0) * 100) / sum])) as Weights;
}

/** Conjuntos del perfil: lo demostrado en código y todo lo declarado (que incluye lo demostrado), con implicaciones. */
export function profileSets(profile: Profile, matcher: SkillMatcher): { demonstrated: Set<string>; declared: Set<string> } {
  const demonstrated = matcher.expandImplied(profile.skills.filter((s) => s.origin === 'demonstrated').map((s) => s.id));
  const declared = matcher.expandImplied([...profile.skills.map((s) => s.id), ...demonstrated]);
  return { demonstrated, declared };
}

const round = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};
const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const DAY = 86400000;

export function scoreJob(job: Job, profile: Profile, ctx: ScoringContext): ScoreResult {
  const { config, matcher } = ctx;
  const weights = effectiveWeights(config, profile.weights);
  const { demonstrated, declared } = profileSets(profile, matcher);
  const flags: string[] = [];
  const parts: Omit<ScoreComponent, 'points' | 'max'>[] = [];

  // Habilidades: requeridas pesan 1 y deseables optionalWeight. Lo que no está ni en el CV ni en el código no suma.
  const jobSkills = job.skills.filter((s) => {
    const def = matcher.byId(s.id);
    return def && !config.skills.excludeCategories.includes(def.category);
  });
  const weightOf = (optional: boolean) => (optional ? config.skills.optionalWeight : 1);
  const totalW = jobSkills.reduce((sum, s) => sum + weightOf(s.optional), 0);
  const name = (id: string) => matcher.byId(id)?.name ?? id;
  const demo = jobSkills.filter((s) => demonstrated.has(s.id));
  const decl = jobSkills.filter((s) => declared.has(s.id));
  const missing = jobSkills.filter((s) => !declared.has(s.id));
  if (totalW === 0) {
    parts.push({ key: 'demonstrated', ratio: 0, status: 'not-applicable', detail: 'La vacante no lista habilidades reconocibles.' });
    parts.push({ key: 'declared', ratio: 0, status: 'not-applicable', detail: 'La vacante no lista habilidades reconocibles.' });
    flags.push('sin-habilidades-detectadas');
  } else {
    const demoRatio = demo.reduce((s, x) => s + weightOf(x.optional), 0) / totalW;
    const declRatio = decl.reduce((s, x) => s + weightOf(x.optional), 0) / totalW;
    parts.push({
      key: 'demonstrated',
      ratio: demoRatio,
      status: demoRatio >= 1 ? 'ok' : demoRatio > 0 ? 'partial' : 'missing',
      detail: demo.length ? `En tu código: ${demo.map((s) => name(s.id)).join(', ')}.` : 'Ninguna de las habilidades pedidas aparece en tus repositorios.',
    });
    parts.push({
      key: 'declared',
      ratio: declRatio,
      status: declRatio >= 1 ? 'ok' : declRatio > 0 ? 'partial' : 'missing',
      detail: missing.length ? `Te falta: ${missing.map((s) => name(s.id) + (s.optional ? ' (deseable)' : '')).join(', ')}.` : 'Tienes todas las habilidades que pide.',
    });
  }

  // Experiencia: años pedidos (o inferidos del nivel) frente a los tuyos. Sin rodeos.
  const levelYears = job.seniority !== 'unknown' ? config.experience.levelMinYears[job.seniority] : null;
  const requiredYears = job.yearsRequired ?? levelYears;
  const inferred = job.yearsRequired === null && levelYears !== null;
  if (requiredYears === null || requiredYears === 0) {
    parts.push({ key: 'experience', ratio: 1, status: 'not-declared', detail: requiredYears === 0 ? 'No exige experiencia previa.' : 'La vacante no indica experiencia requerida.' });
  } else {
    const have = profile.yearsOfExperience ?? 0;
    const ratio = Math.min(1, have / requiredYears);
    const how = inferred ? ` (estimado por el nivel ${job.seniority})` : '';
    parts.push({
      key: 'experience',
      ratio,
      status: ratio >= 1 ? 'ok' : ratio > 0 ? 'partial' : 'missing',
      detail: ratio >= 1
        ? `Pide ${requiredYears} años${how}; tienes ${have}.`
        : profile.yearsOfExperience === null
          ? `Pide ${requiredYears} años${how} y no declaraste tu experiencia.`
          : `Pide ${requiredYears} años${how}; tienes ${have}. ${round(requiredYears - have, 1) === 1 ? 'Te falta 1 año' : `Te faltan ${round(requiredYears - have, 1)} años`}.`,
    });
  }

  // Ubicación relativa a la persona: un remoto que no admite su país vale cero aunque todo lo demás encaje.
  const L = config.location;
  const how = job.modality === 'hybrid' ? 'Híbrido' : 'Presencial';
  if (job.modality === 'remote') {
    const eligible = remoteEligibility(job.remoteScope, profile.homeCountry, ctx.regions);
    if (eligible === false) {
      parts.push({ key: 'location', ratio: L.remoteExcluded, status: 'missing', detail: `Remoto que no admite personas de ${countryLabel(profile.homeCountry)}.` });
      flags.push('remoto-no-admite-tu-pais');
    } else if (eligible === null) {
      parts.push({ key: 'location', ratio: L.remoteScopeUnknown, status: 'partial', detail: profile.homeCountry ? `Remoto sin alcance geográfico declarado: confirma si aceptan personas de ${countryLabel(profile.homeCountry)}.` : 'Remoto sin alcance que se pueda comprobar: indica tu país.' });
    } else {
      parts.push({ key: 'location', ratio: L.remoteEligible, status: 'ok', detail: `Remoto abierto a ${countryLabel(profile.homeCountry)}.` });
    }
  } else if (!profile.homeCountry) {
    parts.push({ key: 'location', ratio: L.unknownUserLocation, status: 'partial', detail: 'Indica tu ubicación para saber si esta vacante te queda cerca.' });
  } else if (job.location.country === profile.homeCountry) {
    const city = job.location.city;
    if (city && profile.homeCity && placeKey(city) === placeKey(profile.homeCity)) {
      parts.push({ key: 'location', ratio: L.home, status: 'ok', detail: `${how} en tu ciudad (${city}).` });
    } else {
      const ratio = profile.acceptsRelocation ? L.sameCountryOtherCityWithRelocation : L.sameCountryOtherCityWithoutRelocation;
      parts.push({ key: 'location', ratio, status: 'partial', detail: `${how} en ${city ?? 'otra ciudad'} (${countryLabel(job.location.country)}); ${profile.acceptsRelocation ? 'aceptas mudarte' : 'no aceptas mudarte'}.` });
    }
  } else {
    parts.push({ key: 'location', ratio: L.abroad, status: 'missing', detail: `${how} en ${job.location.city ? `${job.location.city}, ` : ''}${countryLabel(job.location.country)}: fuera de tu país.` });
  }

  // Idioma: cada idioma pedido frente al tuyo; manda el más débil.
  const requirements = job.languages.filter((l) => l.language !== config.language.nativeLanguage);
  if (requirements.length === 0) {
    parts.push({ key: 'language', ratio: 1, status: 'not-declared', detail: 'No pide otro idioma.' });
  } else {
    let worst = { ratio: 1, detail: '' };
    for (const req of requirements) {
      const needed = req.level ?? config.language.defaultRequiredLevel;
      const have = req.language === 'en' ? profile.englishLevel : profile.otherLanguages?.[req.language] ?? null;
      const ratio = have ? Math.min(1, cefrRank(have) / cefrRank(needed)) : 0;
      const label = req.language === 'en' ? 'inglés' : req.language === 'pt' ? 'portugués' : req.language;
      const how = req.inferred ? ' (inferido: el aviso está en ese idioma)' : req.level === null ? ' (nivel no indicado)' : '';
      const detail = have ? `Pide ${label} ${needed}${how}; declaras ${have}.` : `Pide ${label} ${needed}${how} y no declaraste tu nivel.`;
      if (ratio < worst.ratio || !worst.detail) worst = { ratio, detail };
    }
    parts.push({ key: 'language', ratio: worst.ratio, status: worst.ratio >= 1 ? 'ok' : worst.ratio > 0 ? 'partial' : 'missing', detail: worst.detail });
  }

  // Compensación: si no declara salario no penaliza; se marca y se cuenta aparte.
  const offer = job.salary?.convertible ? job.salary.usdMonthlyMax ?? job.salary.usdMonthlyMin : null;
  if (offer === null) {
    parts.push({ key: 'compensation', ratio: 1, status: 'not-declared', detail: 'No declara salario (no penaliza).' });
    flags.push('salario-no-declarado');
  } else if (profile.minSalaryUsd === null) {
    parts.push({ key: 'compensation', ratio: 1, status: 'ok', detail: `Paga hasta ${fmtUsd(offer)}/mes; no definiste un mínimo.` });
  } else {
    const ratio = Math.min(1, offer / profile.minSalaryUsd);
    parts.push({
      key: 'compensation',
      ratio,
      status: ratio >= 1 ? 'ok' : 'partial',
      detail: ratio >= 1 ? `Paga hasta ${fmtUsd(offer)}/mes; tu mínimo es ${fmtUsd(profile.minSalaryUsd)}.` : `Paga hasta ${fmtUsd(offer)}/mes, por debajo de tu mínimo de ${fmtUsd(profile.minSalaryUsd)}.`,
    });
  }

  // Frescura: decae con los días; una vacante cerrada no puntúa.
  const days = Math.max(0, Math.floor((ctx.now.getTime() - Date.parse(job.publishedAt)) / DAY));
  const F = config.freshness;
  const freshRatio = job.status === 'closed' ? 0 : days <= F.fullUntilDays ? 1 : days >= F.zeroAtDays ? 0 : 1 - (days - F.fullUntilDays) / (F.zeroAtDays - F.fullUntilDays);
  if (job.status === 'closed') flags.push('cerrada');
  parts.push({ key: 'freshness', ratio: freshRatio, status: freshRatio >= 1 ? 'ok' : freshRatio > 0 ? 'partial' : 'missing', detail: job.status === 'closed' ? 'La vacante ya se cerró.' : `Publicada hace ${days} ${days === 1 ? 'día' : 'días'}.` });

  const components: ScoreComponent[] = COMPONENT_ORDER.map((key) => {
    const p = parts.find((x) => x.key === key)!;
    const max = round(weights[key], config.decimals);
    return { ...p, ratio: round(p.ratio, 3), max, points: round(weights[key] * p.ratio, config.decimals) };
  });
  const total = round(components.reduce((s, c) => s + c.points, 0), config.decimals);
  return {
    total,
    components,
    fit: total >= config.fitThreshold ? 'good' : 'below-threshold',
    skills: {
      demonstrated: demo.map((s) => s.id),
      declaredOnly: decl.filter((s) => !demonstrated.has(s.id)).map((s) => s.id),
      missing: missing.filter((s) => !s.optional).map((s) => s.id),
      missingOptional: missing.filter((s) => s.optional).map((s) => s.id),
    },
    flags,
  };
}

import { profileSets, scoreJob, type Profile, type ScoreResult, type ScoringContext } from './score.js';
import type { Cefr, Job } from './types.js';

/** Repositorio analizado del usuario, con las habilidades que demuestra. */
export interface ProfileRepo {
  name: string;
  url: string;
  pushedAt: string;
  skills: string[];
}

export interface LearningResource {
  skillId: string;
  title: string;
  url: string;
  provider: string;
  language: string;
  free: boolean;
}

export interface GapRecommendation {
  skillId: string;
  skillName: string;
  /** missing: no la tienes; unproven: la declaras pero no aparece en tu código. */
  kind: 'missing' | 'unproven';
  optional: boolean;
  closestRepo: { name: string; url: string; shared: string[] } | null;
  /** Herramienta concreta que la cubre en ese repo (p. ej. Testcontainers para «pruebas de integración»). */
  via: { skillId: string; skillName: string } | null;
  scoreIfDemonstrated: number;
  gain: number;
  resources: LearningResource[];
}

export interface GapAnalysis {
  score: ScoreResult;
  missingRequired: string[];
  missingOptional: string[];
  declaredNotDemonstrated: string[];
  experience: { required: number; have: number | null; missing: number } | null;
  language: { language: string; required: Cefr; have: Cefr | null } | null;
  recommendations: GapRecommendation[];
  summary: string;
}

export interface GapContext extends ScoringContext {
  repos: ProfileRepo[];
  resources: LearningResource[];
}

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`);

/**
 * Brecha, no coincidencia: nombra lo que falta y qué hacer.
 * Cada recomendación simula «si demostraras esta habilidad» y recalcula el puntaje real: la ganancia no se inventa.
 */
export function analyzeGap(job: Job, profile: Profile, ctx: GapContext): GapAnalysis {
  const score = scoreJob(job, profile, ctx);
  const { matcher, config } = ctx;
  const { demonstrated, declared } = profileSets(profile, matcher);
  const name = (id: string) => matcher.byId(id)?.name ?? id;
  const jobIds = new Set(job.skills.map((s) => s.id));
  const optionalOf = new Map(job.skills.map((s) => [s.id, s.optional] as const));

  const missingRequired = score.skills.missing;
  const missingOptional = score.skills.missingOptional;
  const declaredNotDemonstrated = job.skills.filter((s) => declared.has(s.id) && !demonstrated.has(s.id)).map((s) => s.id);

  const expComp = score.components.find((c) => c.key === 'experience')!;
  const required = job.yearsRequired ?? (job.seniority !== 'unknown' ? config.experience.levelMinYears[job.seniority] : null);
  const experience = required !== null && required > 0 && expComp.ratio < 1
    ? { required, have: profile.yearsOfExperience, missing: Math.round((required - (profile.yearsOfExperience ?? 0)) * 10) / 10 }
    : null;

  const langComp = score.components.find((c) => c.key === 'language')!;
  let language: GapAnalysis['language'] = null;
  if (langComp.ratio < 1) {
    const req = job.languages.find((l) => l.language !== config.language.nativeLanguage)!;
    language = { language: req.language, required: req.level ?? config.language.defaultRequiredLevel, have: req.language === 'en' ? profile.englishLevel : profile.otherLanguages?.[req.language] ?? null };
  }

  // Qué herramientas del catálogo implican cada habilidad: «pruebas de integración» ← Testcontainers.
  const impliedBy = new Map<string, string[]>();
  for (const s of matcher.catalog.skills) for (const i of s.implies ?? []) impliedBy.set(i, [...(impliedBy.get(i) ?? []), s.id]);
  const pickVia = (id: string, repoSkills: string[]): GapRecommendation['via'] => {
    let best: { id: string; overlap: number } | null = null;
    for (const tool of impliedBy.get(id) ?? []) {
      const def = matcher.byId(tool);
      const overlap = [...(def?.related ?? []), ...(def?.implies ?? [])].filter((r) => repoSkills.includes(r)).length;
      if (overlap > 0 && (!best || overlap > best.overlap)) best = { id: tool, overlap };
    }
    return best ? { skillId: best.id, skillName: name(best.id) } : null;
  };

  const candidates = [...missingRequired.map((id) => ({ id, kind: 'missing' as const })), ...declaredNotDemonstrated.map((id) => ({ id, kind: 'unproven' as const })), ...missingOptional.map((id) => ({ id, kind: 'missing' as const }))];
  const recommendations: GapRecommendation[] = candidates.map(({ id, kind }) => {
    const simulated: Profile = { ...profile, skills: [...profile.skills.filter((s) => s.id !== id), { id, origin: 'demonstrated' }] };
    const after = scoreJob(job, simulated, ctx).total;
    const affinity = new Set([...jobIds, ...(matcher.byId(id)?.related ?? []), ...matcher.expandImplied([id])]);
    affinity.delete(id);
    let closest: GapRecommendation['closestRepo'] = null;
    for (const repo of ctx.repos) {
      const shared = repo.skills.filter((s) => affinity.has(s));
      if (shared.length < config.gap.closestRepoMinOverlap) continue;
      if (!closest || shared.length > closest.shared.length || (shared.length === closest.shared.length && repo.pushedAt > (ctx.repos.find((r) => r.name === closest!.name)?.pushedAt ?? ''))) {
        closest = { name: repo.name, url: repo.url, shared };
      }
    }
    const repoSkills = closest ? ctx.repos.find((r) => r.name === closest!.name)?.skills ?? [] : [];
    const via = closest ? pickVia(id, repoSkills) : null;
    return {
      skillId: id,
      skillName: name(id),
      kind,
      optional: optionalOf.get(id) ?? false,
      closestRepo: closest,
      via,
      scoreIfDemonstrated: after,
      gain: Math.round((after - score.total) * 10) / 10,
      resources: ctx.resources.filter((r) => r.skillId === id || r.skillId === via?.skillId).slice(0, 2),
    };
  })
    .filter((r) => r.gain > 0)
    .sort((a, b) => b.gain - a.gain || Number(a.optional) - Number(b.optional) || a.skillId.localeCompare(b.skillId))
    .slice(0, config.gap.maxRecommendations);

  const sentences: string[] = [];
  const total = Math.round(score.total);
  if (missingRequired.length) sentences.push(`Piden ${list(missingRequired.map(name))} y no aparecen en tu perfil.`);
  else if (missingOptional.length) sentences.push(`Tienes lo requerido; te falta lo deseable: ${list(missingOptional.map(name))}.`);
  else if (declaredNotDemonstrated.length) sentences.push(`Declaras ${list(declaredNotDemonstrated.map(name))}, pero no aparecen en tu código.`);
  const top = recommendations[0];
  if (top) {
    const pending = missingRequired.length + missingOptional.length;
    const covers = top.kind === 'unproven' ? 'lo demuestra' : pending > 1 ? `cubre uno de los ${pending} huecos` : 'cubre el hueco';
    const what = top.via?.skillName ?? top.skillName;
    const repoPart = top.closestRepo ? `De tus repos, ${top.closestRepo.name} es el más cercano: añadirle ${what} ${covers}` : `Demostrar ${top.skillName} en un repositorio ${covers}`;
    sentences.push(`${repoPart} y sube tu encaje de ${total} a ${Math.round(top.scoreIfDemonstrated)}.`);
  }
  if (experience) sentences.push(experience.have === null ? `Pide ${experience.required} años de experiencia y no declaraste la tuya.` : `Pide ${experience.required} años de experiencia; tienes ${experience.have}.`);
  if (language) sentences.push(`Pide ${language.language === 'en' ? 'inglés' : language.language} ${language.required}${language.have ? `; declaras ${language.have}` : ' y no declaraste tu nivel'}.`);
  if (score.fit === 'below-threshold') sentences.unshift(`No encajas todavía (${total}/100): esto es lo que falta.`);
  if (sentences.length === 0) sentences.push(`Encajas bien (${total}/100): no hay huecos detectables.`);

  return { score, missingRequired, missingOptional, declaredNotDemonstrated, experience, language, recommendations, summary: sentences.join(' ') };
}

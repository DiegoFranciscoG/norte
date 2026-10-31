import { damerauLevenshtein, escapeRegExp, normalizeText, stripAccents } from './text.js';
import type { ContextAlias, SkillCatalog, SkillDef, SkillMatch } from './types.js';

export interface ExtractionConfig {
  /** Frases que convierten una línea o sección en «deseable». */
  optionalMarkers: string[];
  /** Encabezados que devuelven la sección a «requerido». */
  requiredHeaders: string[];
  contextWindow: number;
  fuzzy: { minLength: number; maxDistance: number; longMinLength: number; longMaxDistance: number; stopwords: string[] };
}

export interface SkillMatcher {
  readonly catalog: SkillCatalog;
  byId(id: string): SkillDef | undefined;
  /** Extrae habilidades de un texto. `optionalText` se trata entero como deseable (p. ej. la sección `desirable` de Get on Board). */
  extract(text: string, optionalText?: string): SkillMatch[];
  /** Añade las habilidades implicadas (spring-boot ⇒ java). Solo se usa del lado del perfil. */
  expandImplied(ids: Iterable<string>): Set<string>;
}

const SEP = '[\\s\\-_./]?';
const BOUNDARY_BEFORE = '(?<![a-z0-9+#])';
const BOUNDARY_AFTER = '(?![a-z0-9+#])';

/** Clave canónica de un alias o de un texto encontrado: sin separadores internos ni tildes. */
export function aliasKey(input: string): string {
  return normalizeText(input)
    .replace(/(?<=[a-z0-9])\.(?=[a-z0-9])/g, '')
    .replace(/[\s\-_/]+/g, '');
}

function aliasPattern(alias: string): string {
  const norm = normalizeText(alias);
  const leadingDot = norm.startsWith('.');
  const body = leadingDot ? norm.slice(1) : norm;
  const parts = body.split(/[\s\-_/]+|(?<=[a-z0-9])\.(?=[a-z0-9])/).filter(Boolean).map(escapeRegExp);
  return (leadingDot ? '\\.' : '') + parts.join(SEP);
}

interface CompiledContext {
  skillId: string;
  regex: RegExp;
  anyOf: string[];
  window: number;
  caseSensitive: boolean;
}

function lineModes(lines: string[], cfg: ExtractionConfig): boolean[] {
  const optionalMarkers = cfg.optionalMarkers.map((m) => new RegExp(`(?<![a-z0-9])${escapeRegExp(normalizeText(m))}(?![a-z0-9])`));
  const requiredHeaders = cfg.requiredHeaders.map(normalizeText);
  const modes: boolean[] = [];
  let sectionOptional = false;
  for (const raw of lines) {
    const line = normalizeText(raw);
    const hasMarker = optionalMarkers.some((m) => m.test(line));
    const looksLikeHeader = line.length > 0 && line.length <= 70 && (/:$/.test(line) || /^#+ /.test(line) || requiredHeaders.some((h) => line.startsWith(h)));
    if (looksLikeHeader) {
      sectionOptional = hasMarker;
      modes.push(hasMarker);
      continue;
    }
    modes.push(sectionOptional || hasMarker);
  }
  return modes;
}

export function createSkillMatcher(catalog: SkillCatalog, cfg: ExtractionConfig): SkillMatcher {
  const byId = new Map(catalog.skills.map((s) => [s.id, s] as const));
  const keyToIds = new Map<string, Set<string>>();
  const patterns: string[] = [];
  const fuzzyCandidates: { key: string; id: string }[] = [];
  const contexts: CompiledContext[] = [];

  // Un alias ambiguo (BDD, Go, R) solo se resuelve por contexto: nunca entra en la expresión general.
  const contextKeys = new Set(catalog.skills.flatMap((s) => (s.contextAliases ?? []).map((c) => aliasKey(c.alias))));
  for (const skill of catalog.skills) {
    for (const alias of [skill.name, ...skill.aliases]) {
      const key = aliasKey(alias);
      if (!key || contextKeys.has(key)) continue;
      if (!keyToIds.has(key)) {
        keyToIds.set(key, new Set());
        patterns.push(aliasPattern(alias));
      }
      keyToIds.get(key)!.add(skill.id);
      if (/^[a-z]+$/.test(key) && key.length >= cfg.fuzzy.minLength) fuzzyCandidates.push({ key, id: skill.id });
    }
    for (const ctx of skill.contextAliases ?? []) contexts.push(compileContext(skill.id, ctx, cfg));
  }

  patterns.sort((a, b) => b.length - a.length);
  const combined = patterns.length > 0 ? new RegExp(`${BOUNDARY_BEFORE}(?:${patterns.join('|')})${BOUNDARY_AFTER}`, 'g') : null;
  const stopwords = new Set(cfg.fuzzy.stopwords.map(normalizeText));

  function extract(text: string, optionalText?: string): SkillMatch[] {
    const found = new Map<string, SkillMatch>();
    const add = (id: string, optional: boolean, fuzzy: boolean) => {
      const prev = found.get(id);
      if (!prev) found.set(id, { id, optional, fuzzy });
      else found.set(id, { id, optional: prev.optional && optional, fuzzy: prev.fuzzy && fuzzy });
    };
    scan(text ?? '', false, add);
    if (optionalText) scan(optionalText, true, add);
    return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  function scan(text: string, forceOptional: boolean, add: (id: string, optional: boolean, fuzzy: boolean) => void) {
    if (!text.trim()) return;
    const original = stripAccents(text).replace(/[ \t\f\v ]+/g, ' ');
    const lines = original.split('\n');
    const modes = forceOptional ? lines.map(() => true) : lineModes(lines, cfg);
    const lineStarts: number[] = [];
    let offset = 0;
    for (const l of lines) {
      lineStarts.push(offset);
      offset += l.length + 1;
    }
    const lower = original.toLowerCase();
    const optionalAt = (index: number) => {
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid]! <= index) lo = mid;
        else hi = mid - 1;
      }
      return modes[lo] ?? false;
    };

    const covered: [number, number][] = [];
    if (combined) combined.lastIndex = 0;
    for (let m = combined?.exec(lower) ?? null; m && combined; m = combined.exec(lower)) {
      if (m[0] === '') {
        combined.lastIndex++;
        continue;
      }
      const ids = keyToIds.get(aliasKey(m[0]));
      if (!ids) continue;
      covered.push([m.index, m.index + m[0].length]);
      for (const id of ids) add(id, optionalAt(m.index), false);
    }

    for (const ctx of contexts) {
      const haystack = ctx.caseSensitive ? original : lower;
      ctx.regex.lastIndex = 0;
      for (let m = ctx.regex.exec(haystack); m; m = ctx.regex.exec(haystack)) {
        const from = Math.max(0, m.index - ctx.window);
        const around = lower.slice(from, m.index + m[0].length + ctx.window);
        if (ctx.anyOf.some((w) => around.includes(w))) add(ctx.skillId, optionalAt(m.index), false);
      }
    }

    if (fuzzyCandidates.length === 0) return;
    const tokenRe = /[a-z]{4,}/g;
    for (let t = tokenRe.exec(lower); t; t = tokenRe.exec(lower)) {
      const token = t[0];
      if (token.length < cfg.fuzzy.minLength || stopwords.has(token) || keyToIds.has(token)) continue;
      const start = t.index;
      if (covered.some(([a, b]) => start >= a && start < b)) continue;
      const maxDistance = token.length >= cfg.fuzzy.longMinLength ? cfg.fuzzy.longMaxDistance : cfg.fuzzy.maxDistance;
      for (const cand of fuzzyCandidates) {
        if (cand.key[0] !== token[0] || Math.abs(cand.key.length - token.length) > maxDistance) continue;
        if (damerauLevenshtein(token, cand.key, maxDistance) <= maxDistance) {
          add(cand.id, optionalAt(start), true);
          break;
        }
      }
    }
  }

  function expandImplied(ids: Iterable<string>): Set<string> {
    const out = new Set<string>();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id) || !byId.has(id)) continue;
      out.add(id);
      for (const implied of byId.get(id)?.implies ?? []) stack.push(implied);
    }
    return out;
  }

  return { catalog, byId: (id) => byId.get(id), extract, expandImplied };
}

function compileContext(skillId: string, ctx: ContextAlias, cfg: ExtractionConfig): CompiledContext {
  const caseSensitive = ctx.caseSensitive ?? false;
  const alias = caseSensitive ? stripAccents(ctx.alias) : normalizeText(ctx.alias);
  const before = caseSensitive ? '(?<![A-Za-z0-9+#])' : BOUNDARY_BEFORE;
  const after = caseSensitive ? '(?![A-Za-z0-9+#])' : BOUNDARY_AFTER;
  return {
    skillId,
    regex: new RegExp(`${before}${escapeRegExp(alias)}${after}`, 'g'),
    anyOf: ctx.anyOf.map(normalizeText),
    window: ctx.window ?? cfg.contextWindow,
    caseSensitive,
  };
}

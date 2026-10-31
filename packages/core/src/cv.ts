import type { JobClassifier } from './classify.js';
import type { SkillMatcher } from './skills.js';
import { stripAccents } from './text.js';
import type { Cefr, SkillMatch } from './types.js';

export interface CvAnalysis {
  skills: SkillMatch[];
  /** Años de experiencia estimados a partir de los rangos de fechas del CV (sin solapamientos). */
  yearsOfExperience: number | null;
  yearsSource: 'date-ranges' | 'stated' | null;
  englishLevel: Cefr | null;
  ranges: { from: string; to: string }[];
}

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1, feb: 2, febrero: 2, february: 2, mar: 3, marzo: 3, march: 3, abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, june: 6, jul: 7, julio: 7, july: 7, ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9, september: 9, oct: 10, octubre: 10, october: 10, nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};
const PRESENT = '(actualidad|presente|actual|la fecha|hoy|present|current|now|today)';
const MONTH = `(${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')})\\.?`;
const POINT = `(?:${MONTH}\\s*(?:de\\s*|del\\s*)?)?((?:19|20)\\d{2})|(\\d{1,2})[/.-]((?:19|20)\\d{2})`;
/** Los periodos de estudio no cuentan como experiencia laboral. */
const EDUCATION = /(universidad|university|colegio|bachiller|licenciatura|maestria|master|titulo|educacion|formacion academica|estudios|carrera de|ingenieria en|tecnologo|instituto|escuela|school|degree|bachelor)/;
const RANGE = new RegExp(`(?:${POINT})\\s*(?:-|–|—|a|al|hasta|to|until)\\s*(?:(?:${POINT})|${PRESENT})`, 'g');

function toMonthIndex(month: string | undefined, numericMonth: string | undefined, year: string | undefined, fallbackMonth: number): number | null {
  if (!year) return null;
  const m = month ? MONTHS[month] : numericMonth ? Number(numericMonth) : fallbackMonth;
  if (!m || m < 1 || m > 12) return null;
  return Number(year) * 12 + (m - 1);
}

/**
 * Estima la experiencia sumando los periodos laborales sin contar dos veces los que se solapan.
 * Es una estimación: la interfaz la muestra como tal y la persona puede corregirla.
 */
export function estimateExperience(text: string, now: Date): { years: number | null; ranges: { from: string; to: string }[] } {
  const t = stripAccents(text).toLowerCase().replace(/[ \t\f\v]+/g, ' ');
  const current = now.getFullYear() * 12 + now.getMonth();
  const intervals: [number, number][] = [];
  RANGE.lastIndex = 0;
  for (let m = RANGE.exec(t); m; m = RANGE.exec(t)) {
    const start = toMonthIndex(m[1], m[3], m[2] ?? m[4], 1);
    const endIsPresent = m[9] !== undefined;
    const end = endIsPresent ? current : toMonthIndex(m[5], m[7], m[6] ?? m[8], 12);
    if (start === null || end === null || end < start || start < 1970 * 12 || end > current + 1) continue;
    // Contexto: la línea del rango y la anterior (donde suele ir el cargo o la institución).
    const lineStart = t.lastIndexOf('\n', m.index - 1) + 1;
    const prevStart = lineStart > 1 ? t.lastIndexOf('\n', lineStart - 2) + 1 : 0;
    const lineEnd = t.indexOf('\n', m.index + m[0].length);
    const around = t.slice(Math.max(prevStart, m.index - 120), lineEnd === -1 ? m.index + m[0].length + 60 : lineEnd);
    if (EDUCATION.test(around)) continue;
    intervals.push([start, Math.min(end, current)]);
  }
  if (intervals.length === 0) return { years: null, ranges: [] };
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + 1) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  const months = merged.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
  const fmt = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  return { years: Math.round((months / 12) * 10) / 10, ranges: merged.map(([a, b]) => ({ from: fmt(a), to: fmt(b) })) };
}

/** Análisis del CV 100 % local: recibe texto (extraído en el navegador) y devuelve habilidades declaradas, años e inglés. */
export function analyzeCv(text: string, matcher: SkillMatcher, classifier: JobClassifier, now: Date): CvAnalysis {
  const skills = matcher.extract(text).map((s) => ({ ...s, optional: false }));
  const experience = estimateExperience(text, now);
  const stated = experience.years === null ? classifier.yearsRequired(text) : null;
  const english = classifier.languages(text, 'es').find((l) => l.language === 'en' && !l.inferred);
  return {
    skills,
    yearsOfExperience: experience.years ?? stated,
    yearsSource: experience.years !== null ? 'date-ranges' : stated !== null ? 'stated' : null,
    englishLevel: english?.level ?? null,
    ranges: experience.ranges,
  };
}

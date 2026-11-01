import { normalizeText, remoteEligibility, type Job, type RegionCode, type Seniority, type SkillDef } from '@norte/core';
import type { LoadedData } from '../config.js';
import { DATA_LICENSE } from '../publish.js';
import { toCsv } from './csv.js';

const DAY = 86_400_000;

export type Market = 'ecuador' | 'internacional';
const MARKETS: Market[] = ['ecuador', 'internacional'];
const SENIORITIES: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'unknown'];

export interface ObservatoryConfig {
  version: string;
  utcOffsetHours: number;
  cities: string[];
  otherCitiesLabel: string;
  minSample: number;
  topSkills: number;
  topCompanies: number;
  topSkillsPerCity: number;
  topCompaniesPerCity: number;
  trend: { windowDays: number; weeks: number; skills: number; minCount: number; highlights: number };
  monthly: { keepMonths: number; companiesPerMonth: number; keepDays: number };
  academia: { demandTopSkills: number };
  roles: { id: string; label: string; keywords: string[] }[];
  otherRoleLabel: string;
  seniorityLabels: Record<Seniority, string>;
  marketLabels: Record<Market, string>;
  monthNames: string[];
  report: Record<'headline' | 'changeUp' | 'changeDown' | 'changeFlat' | 'mix' | 'salary' | 'topSkill' | 'rising' | 'partial' | 'firstMonth', string>;
  methodology: string[];
  academiaEmptyNote: string;
  publicApi: { title: string; updateFrequency: string; endpoints: Record<string, string> };
}

export interface SalaryStat {
  n: number;
  medianUsd: number | null;
  p25Usd: number | null;
  p75Usd: number | null;
  /** true: hay vacantes con salario, pero menos que la muestra mínima; las cifras no se publican. */
  suppressed: boolean;
}

export interface DaySnapshot {
  day: string;
  open: number;
  remote: number | null;
  ecuador: number | null;
  withSalary: number | null;
}

export interface MonthAggregate {
  month: string;
  newJobs: number;
  remote: number;
  ecuador: number;
  withSalary: number;
  byCity: Record<string, number>;
  skills: Record<string, number>;
  companies: Record<string, number>;
  sources: Record<string, number>;
  salary: Record<Market, SalaryStat>;
  /** Un mes cerrado no se recalcula: el estado solo retiene unos 90 días de vacantes. */
  frozen: boolean;
}

export interface ObservatoryInput {
  jobs: Job[];
  data: LoadedData;
  now: Date;
  previousDays: unknown[];
  previousMonths: unknown[];
  demo: boolean;
}

interface Ctx {
  cfg: ObservatoryConfig;
  homeCountry: string;
  regions: Partial<Record<RegionCode, string[]>>;
  skills: Map<string, SkillDef>;
  role: (title: string) => string;
  cityByKey: Map<string, string>;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Porcentaje con un decimal; null si no hay base. */
export function share(part: number, total: number): number | null {
  return total > 0 ? round1((part / total) * 100) : null;
}

/** Interpolación lineal entre rangos (tipo 7 de Hyndman y Fan, la de PERCENTIL.INC en hojas de cálculo). */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error('quantile de una lista vacía');
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export function salaryStat(values: number[], minSample: number): SalaryStat {
  const n = values.length;
  if (n === 0 || n < minSample) return { n, medianUsd: null, p25Usd: null, p75Usd: null, suppressed: n > 0 };
  const s = [...values].sort((a, b) => a - b);
  return { n, medianUsd: Math.round(quantile(s, 0.5)), p25Usd: Math.round(quantile(s, 0.25)), p75Usd: Math.round(quantile(s, 0.75)), suppressed: false };
}

/** Salario mensual en USD de una vacante: punto medio del rango publicado, o el único extremo que exista. */
export function jobSalaryUsd(job: Job): number | null {
  const s = job.salary;
  if (!s?.convertible) return null;
  if (s.usdMonthlyMin !== null && s.usdMonthlyMax !== null) return Math.round((s.usdMonthlyMin + s.usdMonthlyMax) / 2);
  return s.usdMonthlyMin ?? s.usdMonthlyMax ?? null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rol a partir del título: el primer rol de la configuración cuyas palabras aparezcan (en orden de prioridad). */
export function createRoleClassifier(roles: ObservatoryConfig['roles']): (title: string) => string {
  const compiled = roles.map((r) => ({
    id: r.id,
    re: new RegExp(`(?:^|[^a-z0-9])(?:${r.keywords.map((k) => escapeRe(normalizeText(k))).join('|')})(?:$|[^a-z0-9])`),
  }));
  return (title) => {
    const t = normalizeText(title);
    return compiled.find((r) => r.re.test(t))?.id ?? 'other';
  };
}

function localDate(t: number, offsetHours: number): string {
  return new Date(t + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function inc(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function top(counts: Map<string, number> | Record<string, number>, n: number): [string, number][] {
  const entries = counts instanceof Map ? [...counts.entries()] : Object.entries(counts);
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

function skillCounts(jobs: Job[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const j of jobs) for (const id of new Set(j.skills.map((s) => s.id))) inc(counts, id);
  return counts;
}

/** Accesible desde el país foco: ubicada ahí o remota que no lo excluye. */
export const accessible = (ctx: Ctx, j: Job): boolean =>
  j.location.country === ctx.homeCountry || (j.modality === 'remote' && remoteEligibility(j.remoteScope, ctx.homeCountry, ctx.regions) !== false);

const market = (ctx: Ctx, j: Job): Market => (j.location.country === ctx.homeCountry ? 'ecuador' : 'internacional');
const cityOf = (ctx: Ctx, j: Job): string | null => (j.location.city ? (ctx.cityByKey.get(normalizeText(j.location.city)) ?? null) : null);
const skillName = (ctx: Ctx, id: string) => ctx.skills.get(id)?.name ?? id;

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}

/** Formato numérico en español: punto para miles, coma decimal. */
export function fmtNumber(x: number, decimals = 0): string {
  const [int, dec] = Math.abs(x).toFixed(decimals).split('.') as [string, string | undefined];
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${x < 0 ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

function monthLabel(cfg: ObservatoryConfig, month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${cfg.monthNames[m - 1] ?? month} de ${y}`;
}

function dayLabel(cfg: ObservatoryConfig, day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${d} de ${cfg.monthNames[m - 1] ?? ''} de ${y}`;
}

// ---------------------------------------------------------------- foto actual

function buildSalaries(ctx: Ctx, jobs: Job[]) {
  const { cfg } = ctx;
  const roleLabel = (id: string) => cfg.roles.find((r) => r.id === id)?.label ?? cfg.otherRoleLabel;
  const withSalary = jobs.filter((j) => jobSalaryUsd(j) !== null).length;
  return {
    minSample: cfg.minSample,
    jobs: jobs.length,
    withSalary,
    withSalaryShare: share(withSalary, jobs.length),
    withoutSalaryShare: share(jobs.length - withSalary, jobs.length),
    markets: MARKETS.map((m) => {
      const mj = jobs.filter((j) => market(ctx, j) === m);
      const paid = mj.flatMap((j) => {
        const usd = jobSalaryUsd(j);
        return usd === null ? [] : [{ role: ctx.role(j.title), seniority: j.seniority, usd }];
      });
      const roles = [...new Set(paid.map((p) => p.role))].sort();
      return {
        market: m,
        label: cfg.marketLabels[m],
        jobs: mj.length,
        withSalary: paid.length,
        withSalaryShare: share(paid.length, mj.length),
        overall: salaryStat(paid.map((p) => p.usd), cfg.minSample),
        bySeniority: SENIORITIES.map((s) => ({ seniority: s, label: cfg.seniorityLabels[s], ...salaryStat(paid.filter((p) => p.seniority === s).map((p) => p.usd), cfg.minSample) })).filter((r) => r.n > 0),
        byRole: roles.map((r) => ({ role: r, label: roleLabel(r), ...salaryStat(paid.filter((p) => p.role === r).map((p) => p.usd), cfg.minSample) })),
        byRoleLevel: roles.flatMap((r) =>
          SENIORITIES.map((s) => ({ role: r, roleLabel: roleLabel(r), seniority: s, seniorityLabel: cfg.seniorityLabels[s], ...salaryStat(paid.filter((p) => p.role === r && p.seniority === s).map((p) => p.usd), cfg.minSample) })).filter((x) => x.n > 0),
        ),
      };
    }),
  };
}

function buildCities(ctx: Ctx, inEcuador: Job[]) {
  const { cfg } = ctx;
  const describe = (city: string, jobs: Job[]) => {
    const modality = { onsite: 0, hybrid: 0, remote: 0, unknown: 0 };
    for (const j of jobs) modality[j.modality]++;
    const salaries = jobs.map(jobSalaryUsd).filter((x): x is number => x !== null);
    return {
      city,
      open: jobs.length,
      share: share(jobs.length, inEcuador.length),
      modality,
      topSkills: top(skillCounts(jobs), cfg.topSkillsPerCity).map(([id, count]) => ({ id, name: skillName(ctx, id), count, share: share(count, jobs.length) })),
      topCompanies: top(new Map(countCompanies(jobs)), cfg.topCompaniesPerCity).map(([name, count]) => ({ name, count })),
      withSalaryShare: share(salaries.length, jobs.length),
      salary: salaryStat(salaries, cfg.minSample),
    };
  };
  return [
    ...cfg.cities.map((c) => describe(c, inEcuador.filter((j) => cityOf(ctx, j) === c))),
    describe(cfg.otherCitiesLabel, inEcuador.filter((j) => cityOf(ctx, j) === null)),
  ];
}

function countCompanies(jobs: Job[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const j of jobs) inc(counts, j.company.name);
  return counts;
}

function buildTrend(ctx: Ctx, jobs: Job[], now: Date, observedSince: string | null) {
  const { windowDays, weeks, skills: seriesSize, minCount, highlights } = ctx.cfg.trend;
  const end = now.getTime();
  const observedDays = observedSince ? Math.max(0, Math.floor((end - Date.parse(observedSince)) / DAY)) : 0;
  const status = observedDays >= windowDays ? 'ok' : 'insufficient-history';
  const seen = jobs.map((j) => ({ j, t: Date.parse(j.firstSeenAt) })).filter((x) => x.t <= end);

  const weekly = seen.filter((x) => x.t > end - weeks * 7 * DAY);
  const bucket = (t: number) => weeks - 1 - Math.floor((end - t) / (7 * DAY));
  const weeklyTotals = Array<number>(weeks).fill(0);
  for (const x of weekly) weeklyTotals[bucket(x.t)]!++;

  const windowJobs = seen.filter((x) => x.t > end - windowDays * DAY);
  const half = end - (windowDays / 2) * DAY;
  const first = windowJobs.filter((x) => x.t <= half).map((x) => x.j);
  const second = windowJobs.filter((x) => x.t > half).map((x) => x.j);
  const c1 = skillCounts(first);
  const c2 = skillCounts(second);
  const movement = (id: string) => {
    const s1 = share(c1.get(id) ?? 0, first.length);
    const s2 = share(c2.get(id) ?? 0, second.length);
    return { firstHalfShare: s1, secondHalfShare: s2, deltaPp: s1 !== null && s2 !== null ? round1(s2 - s1) : null };
  };

  const series = top(skillCounts(weekly.map((x) => x.j)), seriesSize).map(([id, count]) => {
    const counts = Array<number>(weeks).fill(0);
    for (const x of weekly) if (x.j.skills.some((s) => s.id === id)) counts[bucket(x.t)]!++;
    return { id, name: skillName(ctx, id), count, weekly: counts, ...movement(id) };
  });

  const movers = status === 'ok'
    ? [...new Set([...c1.keys(), ...c2.keys()])]
        .filter((id) => (c1.get(id) ?? 0) + (c2.get(id) ?? 0) >= minCount)
        .map((id) => ({ id, name: skillName(ctx, id), ...movement(id) }))
        .filter((m): m is typeof m & { deltaPp: number } => m.deltaPp !== null)
    : [];

  return {
    status,
    windowDays,
    observedDays,
    observedSince,
    weekStarts: Array.from({ length: weeks }, (_, i) => localDate(end - (weeks - i) * 7 * DAY, ctx.cfg.utcOffsetHours)),
    weeklyTotals,
    firstHalfJobs: first.length,
    secondHalfJobs: second.length,
    skills: series,
    rising: movers.filter((m) => m.deltaPp > 0).sort((a, b) => b.deltaPp - a.deltaPp).slice(0, highlights),
    falling: movers.filter((m) => m.deltaPp < 0).sort((a, b) => a.deltaPp - b.deltaPp).slice(0, highlights),
  };
}

function buildSources(open: Job[]) {
  const bySource = new Map<string, { name: string; openJobs: number; lastFetchedAt: string }>();
  for (const j of open) {
    for (const s of j.sources) {
      const prev = bySource.get(s.sourceName);
      if (!prev) bySource.set(s.sourceName, { name: s.sourceName, openJobs: 1, lastFetchedAt: s.fetchedAt });
      else {
        prev.openJobs++;
        if (s.fetchedAt > prev.lastFetchedAt) prev.lastFetchedAt = s.fetchedAt;
      }
    }
  }
  return [...bySource.values()].sort((a, b) => b.openJobs - a.openJobs || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- series

export function aggregateMonth(ctx: Ctx, month: string, jobs: Job[], frozen: boolean): MonthAggregate {
  const inMonth = jobs.filter((j) => localDate(Date.parse(j.firstSeenAt), ctx.cfg.utcOffsetHours).slice(0, 7) === month);
  const byCity: Record<string, number> = Object.fromEntries(ctx.cfg.cities.map((c) => [c, 0]));
  const sources = new Map<string, number>();
  for (const j of inMonth) {
    const c = market(ctx, j) === 'ecuador' ? cityOf(ctx, j) : null;
    if (c) byCity[c] = (byCity[c] ?? 0) + 1;
    for (const name of new Set(j.sources.map((s) => s.sourceName))) inc(sources, name);
  }
  const salary = Object.fromEntries(
    MARKETS.map((m) => [m, salaryStat(inMonth.filter((j) => market(ctx, j) === m).map(jobSalaryUsd).filter((x): x is number => x !== null), ctx.cfg.minSample)]),
  ) as Record<Market, SalaryStat>;
  return {
    month,
    newJobs: inMonth.length,
    remote: inMonth.filter((j) => j.modality === 'remote').length,
    ecuador: inMonth.filter((j) => market(ctx, j) === 'ecuador').length,
    withSalary: inMonth.filter((j) => jobSalaryUsd(j) !== null).length,
    byCity,
    skills: Object.fromEntries(top(skillCounts(inMonth), Number.MAX_SAFE_INTEGER)),
    companies: Object.fromEntries(top(countCompanies(inMonth), ctx.cfg.monthly.companiesPerMonth)),
    sources: Object.fromEntries(top(sources, Number.MAX_SAFE_INTEGER)),
    salary,
    frozen,
  };
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const numbers = (x: unknown): Record<string, number> =>
  isRecord(x) ? Object.fromEntries(Object.entries(x).filter((e): e is [string, number] => typeof e[1] === 'number')) : {};
const emptyStat: SalaryStat = { n: 0, medianUsd: null, p25Usd: null, p75Usd: null, suppressed: false };

/** El historial viene del sitio publicado: se valida antes de usarlo. */
export function sanitizeMonths(stored: unknown[]): MonthAggregate[] {
  return stored.flatMap((x) => {
    if (!isRecord(x) || typeof x['month'] !== 'string' || !/^\d{4}-\d{2}$/.test(x['month']) || typeof x['newJobs'] !== 'number') return [];
    const salary = isRecord(x['salary']) ? x['salary'] : {};
    const stat = (m: Market): SalaryStat => (isRecord(salary[m]) ? { ...emptyStat, ...(salary[m] as Partial<SalaryStat>) } : emptyStat);
    const num = (k: string) => (typeof x[k] === 'number' ? (x[k] as number) : 0);
    return [{
      month: x['month'],
      newJobs: x['newJobs'],
      remote: num('remote'),
      ecuador: num('ecuador'),
      withSalary: num('withSalary'),
      byCity: numbers(x['byCity']),
      skills: numbers(x['skills']),
      companies: numbers(x['companies']),
      sources: numbers(x['sources']),
      salary: { ecuador: stat('ecuador'), internacional: stat('internacional') },
      frozen: true,
    }];
  });
}

export function mergeMonths(ctx: Ctx, stored: unknown[], jobs: Job[], now: Date): MonthAggregate[] {
  const current = localDate(now.getTime(), ctx.cfg.utcOffsetHours).slice(0, 7);
  const months = new Map(sanitizeMonths(stored).map((m) => [m.month, m]));
  for (const month of [previousMonth(current), current]) {
    const fresh = aggregateMonth(ctx, month, jobs, month !== current);
    const old = months.get(month);
    if (fresh.newJobs === 0 && !old) continue;
    if (!old || fresh.newJobs >= old.newJobs) months.set(month, fresh);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-ctx.cfg.monthly.keepMonths);
}

export function mergeDays(stored: unknown[], snapshot: DaySnapshot, keep: number): DaySnapshot[] {
  const valid = stored.flatMap((x): DaySnapshot[] => {
    if (!isRecord(x) || typeof x['day'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x['day']) || typeof x['open'] !== 'number') return [];
    const opt = (k: string) => (typeof x[k] === 'number' ? (x[k] as number) : null);
    return [{ day: x['day'], open: x['open'], remote: opt('remote'), ecuador: opt('ecuador'), withSalary: opt('withSalary') }];
  });
  return [...valid.filter((d) => d.day !== snapshot.day), snapshot].sort((a, b) => a.day.localeCompare(b.day)).slice(-keep);
}

// ---------------------------------------------------------------- informes

export function buildReport(ctx: Ctx, months: MonthAggregate[], index: number, now: Date, generatedAt: string, demo: boolean) {
  const { cfg } = ctx;
  const m = months[index] as MonthAggregate;
  const candidate = index > 0 ? months[index - 1] : undefined;
  const prev = candidate && candidate.month === previousMonth(m.month) ? candidate : null;
  const today = localDate(now.getTime(), cfg.utcOffsetHours);
  const complete = m.month < today.slice(0, 7);
  const label = monthLabel(cfg, m.month);
  const previousLabel = prev ? monthLabel(cfg, prev.month) : null;
  const changePct = prev && prev.newJobs > 0 ? round1(((m.newJobs - prev.newJobs) / prev.newJobs) * 100) : null;

  const topSkills = top(m.skills, 10).map(([id, count]) => {
    const s = share(count, m.newJobs);
    const p = prev ? share(prev.skills[id] ?? 0, prev.newJobs) : null;
    return { id, name: skillName(ctx, id), count, share: s, previousShare: p, deltaPp: s !== null && p !== null ? round1(s - p) : null };
  });
  const rising = prev
    ? Object.entries(m.skills)
        .filter(([, count]) => count >= cfg.minSample)
        .map(([id, count]) => ({ id, delta: round1((share(count, m.newJobs) ?? 0) - (share(prev.skills[id] ?? 0, prev.newJobs) ?? 0)) }))
        .filter((x) => x.delta > 0)
        .sort((a, b) => b.delta - a.delta || a.id.localeCompare(b.id))[0]
    : undefined;

  const remoteShare = share(m.remote, m.newJobs);
  const ecuadorShare = share(m.ecuador, m.newJobs);
  const withSalaryShare = share(m.withSalary, m.newJobs);
  const highlights: string[] = [fill(cfg.report.headline, { month: label, newJobs: fmtNumber(m.newJobs) })];
  if (prev && previousLabel && changePct !== null) {
    const template = changePct > 0 ? cfg.report.changeUp : changePct < 0 ? cfg.report.changeDown : cfg.report.changeFlat;
    highlights.push(fill(template, { change: fmtNumber(Math.abs(changePct), 1), previousMonth: previousLabel, previousNewJobs: fmtNumber(prev.newJobs) }));
  }
  if (remoteShare !== null && ecuadorShare !== null) highlights.push(fill(cfg.report.mix, { remoteShare: fmtNumber(remoteShare, 1), ecuadorShare: fmtNumber(ecuadorShare, 1) }));
  if (withSalaryShare !== null) highlights.push(fill(cfg.report.salary, { withSalaryShare: fmtNumber(withSalaryShare, 1) }));
  const first = topSkills[0];
  if (first && first.share !== null) highlights.push(fill(cfg.report.topSkill, { skill: first.name, share: fmtNumber(first.share, 1) }));
  if (rising && previousLabel) highlights.push(fill(cfg.report.rising, { skill: skillName(ctx, rising.id), delta: fmtNumber(rising.delta, 1), previousMonth: previousLabel }));
  if (!complete) highlights.push(fill(cfg.report.partial, { until: dayLabel(cfg, today) }));
  if (index === 0) highlights.push(cfg.report.firstMonth);

  return {
    month: m.month,
    label,
    complete,
    generatedAt,
    demo,
    license: DATA_LICENSE.statistics,
    newJobs: m.newJobs,
    previous: prev ? { month: prev.month, label: previousLabel, newJobs: prev.newJobs } : null,
    changePct,
    remoteShare,
    ecuadorShare,
    withSalaryShare,
    highlights,
    topSkills,
    cities: cfg.cities.map((c) => ({ city: c, newJobs: m.byCity[c] ?? 0, previous: prev ? (prev.byCity[c] ?? 0) : null })),
    topCompanies: top(m.companies, 5).map(([name, count]) => ({ name, count })),
    salary: MARKETS.map((k) => ({ market: k, label: cfg.marketLabels[k], ...m.salary[k] })),
    sources: top(m.sources, Number.MAX_SAFE_INTEGER).map(([name, count]) => ({ name, count })),
    methodology: cfg.methodology.map((t) => fill(t, { minSample: cfg.minSample })),
  };
}

// ---------------------------------------------------------------- brecha academia–mercado

interface Curriculum {
  id: string;
  university: string;
  program: string;
  city: string;
  source: { url: string; retrievedAt: string; license?: string };
  courses: { name: string; semester?: number; skills: string[] }[];
}

function isCurriculum(x: unknown): x is Curriculum {
  return isRecord(x) && typeof x['id'] === 'string' && typeof x['university'] === 'string' && typeof x['program'] === 'string'
    && isRecord(x['source']) && typeof (x['source'] as Record<string, unknown>)['url'] === 'string' && Array.isArray(x['courses']);
}

export function buildAcademia(ctx: Ctx, curricula: unknown, open: Job[]) {
  const list = (isRecord(curricula) && Array.isArray(curricula['curricula']) ? curricula['curricula'] : []).filter(isCurriculum);
  const base = open.filter((j) => market(ctx, j) === 'ecuador');
  const demandJobs = base.length > 0 ? base : open;
  const demand = top(skillCounts(demandJobs), ctx.cfg.academia.demandTopSkills).map(([id, count]) => ({ id, name: skillName(ctx, id), count, share: share(count, demandJobs.length) ?? 0 }));
  if (list.length === 0) return { status: 'sin-datos', note: ctx.cfg.academiaEmptyNote, demandBase: demandJobs.length, demand, curricula: [] };
  const totalWeight = demand.reduce((s, d) => s + d.share, 0);
  return {
    status: 'ok',
    demandBase: demandJobs.length,
    demand,
    curricula: list.map((c) => {
      const taught = new Set(c.courses.flatMap((k) => k.skills).filter((id) => ctx.skills.has(id)));
      const covered = demand.filter((d) => taught.has(d.id));
      return {
        id: c.id,
        university: c.university,
        program: c.program,
        city: c.city,
        source: c.source,
        coverage: totalWeight > 0 ? round1((covered.reduce((s, d) => s + d.share, 0) / totalWeight) * 100) : null,
        missing: demand.filter((d) => !taught.has(d.id)).slice(0, 10),
        taughtWithoutDemand: [...taught].filter((id) => !demand.some((d) => d.id === id)).map((id) => ({ id, name: skillName(ctx, id) })),
      };
    }),
  };
}

// ---------------------------------------------------------------- todo junto

export function createContext(data: LoadedData): Ctx {
  const cfg = data.observatory;
  return {
    cfg,
    homeCountry: data.ingest.home.country,
    regions: data.geo.regions,
    skills: new Map(data.catalog.skills.map((s) => [s.id, s])),
    role: createRoleClassifier(cfg.roles),
    cityByKey: new Map(cfg.cities.map((c) => [normalizeText(c), c])),
  };
}

/** Estadísticas públicas del observatorio: solo conteos y agregados, nunca datos personales (T-10). */
export function buildObservatory(input: ObservatoryInput): Record<string, object | string> {
  const ctx = createContext(input.data);
  const { cfg } = ctx;
  const generatedAt = input.now.toISOString();
  // El índice es global; el observatorio mira el mercado accesible desde su país foco (Ecuador).
  const jobs = input.jobs.filter((j) => accessible(ctx, j));
  const open = jobs.filter((j) => j.status === 'open');
  const inEcuador = open.filter((j) => market(ctx, j) === 'ecuador');
  const remote = open.filter((j) => j.modality === 'remote');
  const withSalary = open.filter((j) => jobSalaryUsd(j) !== null);
  const today = localDate(input.now.getTime(), cfg.utcOffsetHours);

  const days = mergeDays(input.previousDays, { day: today, open: open.length, remote: remote.length, ecuador: inEcuador.length, withSalary: withSalary.length }, cfg.monthly.keepDays);
  const firstSeen = jobs.map((j) => j.firstSeenAt).sort()[0] ?? null;
  const firstDay = days[0]?.day ? `${days[0].day}T00:00:00.000Z` : null;
  const observedSince = [firstSeen, firstDay].filter((x): x is string => x !== null).sort()[0] ?? null;
  const months = mergeMonths(ctx, input.previousMonths, jobs, input.now);

  const skills = skillCounts(open);
  const categories = new Map<string, number>();
  for (const j of open) for (const c of new Set(j.skills.map((s) => ctx.skills.get(s.id)?.category).filter((x): x is SkillDef['category'] => x !== undefined))) inc(categories, c);
  const scopes = new Map<string, number>();
  for (const j of remote) inc(scopes, j.remoteScope?.type ?? 'unknown');
  const trend = buildTrend(ctx, jobs, input.now, observedSince);
  const salaries = buildSalaries(ctx, open);
  const cities = buildCities(ctx, inEcuador);
  const topSkills = top(skills, cfg.topSkills).map(([id, count]) => ({
    id,
    name: skillName(ctx, id),
    category: ctx.skills.get(id)?.category ?? null,
    count,
    share: share(count, open.length),
    trendDeltaPp: trend.status === 'ok' ? (trend.skills.find((s) => s.id === id)?.deltaPp ?? null) : null,
  }));
  const topCompanies = top(countCompanies(open), cfg.topCompanies).map(([name, count]) => ({ name, count, share: share(count, open.length) }));
  const common = { generatedAt, demo: input.demo, license: DATA_LICENSE.statistics };
  const methodology = cfg.methodology.map((t) => fill(t, { minSample: cfg.minSample }));

  const summary = {
    ...common,
    methodology,
    population: { open: open.length, ecuador: inEcuador.length, remote: remote.length, freelance: open.filter((j) => j.employmentType === 'freelance').length },
    remote: { share: share(remote.length, open.length), jobs: remote.length, scopes: Object.fromEntries(top(scopes, 10)) },
    topSkills,
    categories: top(categories, 30).map(([category, count]) => ({ category, count, share: share(count, open.length) })),
    topCompanies,
    cities,
    salaries,
    trend,
    latestMonth: months.at(-1)?.month ?? null,
    sources: buildSources(open),
  };

  const reports = months.map((_, i) => buildReport(ctx, months, i, input.now, generatedAt, input.demo));
  const files: Record<string, object | string> = {
    'stats/summary.json': summary,
    'stats/history.json': { ...common, days },
    'stats/monthly.json': { ...common, methodology, months },
    'stats/academia.json': { ...common, ...buildAcademia(ctx, input.data.curricula, open) },
    'stats/reports/index.json': { ...common, reports: reports.map((r) => ({ month: r.month, label: r.label, complete: r.complete, newJobs: r.newJobs })).reverse() },
    ...Object.fromEntries(reports.map((r) => [`stats/reports/${r.month}.json`, r])),
    'stats/skills.csv': toCsv(['skill_id', 'skill', 'category', 'open_jobs', 'share_pct', 'trend_90d_pp'], topSkills.map((s) => [s.id, s.name, s.category, s.count, s.share, s.trendDeltaPp])),
    'stats/monthly.csv': toCsv(
      ['month', 'new_jobs', 'remote_pct', 'ecuador_pct', 'with_salary_pct', ...cfg.cities.map((c) => `new_jobs_${normalizeText(c).replace(/[^a-z0-9]+/g, '_')}`), 'frozen'],
      months.map((m) => [m.month, m.newJobs, share(m.remote, m.newJobs), share(m.ecuador, m.newJobs), share(m.withSalary, m.newJobs), ...cfg.cities.map((c) => m.byCity[c] ?? 0), m.frozen]),
    ),
    'stats/monthly-skills.csv': toCsv(['month', 'skill_id', 'skill', 'new_jobs', 'share_pct'], months.flatMap((m) => top(m.skills, Number.MAX_SAFE_INTEGER).map(([id, n]) => [m.month, id, skillName(ctx, id), n, share(n, m.newJobs)]))),
    'stats/cities.csv': toCsv(
      ['city', 'open_jobs', 'share_of_ecuador_pct', 'onsite', 'hybrid', 'remote', 'with_salary_pct', 'salary_n', 'median_salary_usd'],
      cities.map((c) => [c.city, c.open, c.share, c.modality.onsite, c.modality.hybrid, c.modality.remote, c.withSalaryShare, c.salary.n, c.salary.medianUsd]),
    ),
    'stats/salaries.csv': toCsv(
      ['market', 'role', 'seniority', 'n', 'median_usd', 'p25_usd', 'p75_usd', 'suppressed'],
      salaries.markets.flatMap((m) => m.byRoleLevel.map((r) => [m.market, r.role, r.seniority, r.n, r.medianUsd, r.p25Usd, r.p75Usd, r.suppressed])),
    ),
    'stats/companies.csv': toCsv(['company', 'open_jobs', 'share_pct'], topCompanies.map((c) => [c.name, c.count, c.share])),
  };
  files['stats/api.json'] = {
    ...common,
    title: cfg.publicApi.title,
    updateFrequency: cfg.publicApi.updateFrequency,
    attribution: DATA_LICENSE.statistics,
    endpoints: Object.entries(cfg.publicApi.endpoints).map(([path, summary]) => ({ path, summary })),
    files: Object.keys(files).sort(),
  };
  return files;
}

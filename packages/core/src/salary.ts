import { normalizeText } from './text.js';
import type { Salary } from './types.js';

export type SalaryPeriod = Salary['period'];

export interface RawSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
}

export interface FxTable {
  source: string;
  date: string;
  /** Unidades de cada moneda por 1 EUR, como publica el BCE (incluye USD). */
  perEur: Record<string, number>;
}

export interface SalaryConfig {
  hoursPerMonth: number;
  workDaysPerMonth: number;
  weeksPerMonth: number;
  minUsdMonthly: number;
  maxUsdMonthly: number;
}

const CURRENCY_HINTS: [RegExp, string][] = [
  [/\b(?:r\$|brl)/, 'BRL'],
  [/\bmxn\b/, 'MXN'],
  [/\bcop\b/, 'COP'],
  [/\bars\b/, 'ARS'],
  [/\bclp\b/, 'CLP'],
  [/\b(?:pen|s\/\.)/, 'PEN'],
  [/\bcad\b|c\$/, 'CAD'],
  [/€|\beur\b/, 'EUR'],
  [/£|\bgbp\b/, 'GBP'],
  [/\busd\b|us\$|\$/, 'USD'],
];

const PERIOD_HINTS: [RegExp, SalaryPeriod | 'unsupported'][] = [
  [/per (task|project|word|article|video)|por (tarea|proyecto|palabra)|\/task/, 'unsupported'],
  [/\/\s*h(ou)?r\b|per hour|hourly|por hora|\/hora|an hour/, 'hour'],
  [/per day|daily|por dia|\/day|\/dia/, 'day'],
  [/per week|weekly|semanal|\/week/, 'week'],
  [/\/\s*mo(nth)?\b|per month|monthly|mensual|al mes|\/mes|por mes|a month/, 'month'],
  [/\/\s*y(ea)?r\b|per year|annual|anual|al ano|per annum|a year|\bpa\b/, 'year'],
];

function parseAmount(token: string): number | null {
  let t = token.trim().toLowerCase();
  let multiplier = 1;
  if (t.endsWith('k')) {
    multiplier = 1000;
    t = t.slice(0, -1);
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n * multiplier : null;
}

/** Interpreta salarios en texto libre: «$3.5k–$5k/month», «USD 1.200 - 1.500 mensual», «70K-80K». */
export function parseSalaryText(input: string | null | undefined): RawSalary | null {
  if (!input) return null;
  const text = normalizeText(input);
  const amounts = [...text.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*k?\b/g)]
    .map((m) => parseAmount(m[0].replace(/\s+/g, '')))
    .filter((n): n is number => n !== null);
  if (amounts.length === 0) return null;
  let period: SalaryPeriod | 'unsupported' | null = null;
  for (const [re, p] of PERIOD_HINTS) if (re.test(text)) { period = p; break; }
  if (period === 'unsupported') return null;
  const currency = CURRENCY_HINTS.find(([re]) => re.test(text))?.[1] ?? null;
  const [a, b] = amounts;
  const min = Math.min(a!, b ?? a!);
  const max = Math.max(a!, b ?? a!);
  return { min, max, currency, period: period ?? inferPeriod(max) };
}

function inferPeriod(amount: number): SalaryPeriod | null {
  if (amount >= 15000) return 'year';
  if (amount >= 300) return 'month';
  if (amount >= 5 && amount <= 250) return 'hour';
  return null;
}

export function toUsd(amount: number, currency: string, fx: FxTable | null): number | null {
  const cur = currency.toUpperCase();
  if (cur === 'USD') return amount;
  if (!fx) return null;
  const usdPerEur = fx.perEur['USD'];
  if (!usdPerEur) return null;
  if (cur === 'EUR') return amount * usdPerEur;
  const rate = fx.perEur[cur];
  return rate ? (amount / rate) * usdPerEur : null;
}

function monthlyFactor(period: SalaryPeriod, cfg: SalaryConfig): number {
  switch (period) {
    case 'hour': return cfg.hoursPerMonth;
    case 'day': return cfg.workDaysPerMonth;
    case 'week': return cfg.weeksPerMonth;
    case 'month': return 1;
    case 'year': return 1 / 12;
  }
}

const round = (n: number) => Math.round(n);

/**
 * Normaliza a dólares mensuales. Devuelve null si el monto es inverosímil (probable error de lectura):
 * preferimos no publicar una cifra antes que publicar una falsa.
 */
export function normalizeSalary(raw: RawSalary | null, fx: FxTable | null, cfg: SalaryConfig): Salary | null {
  if (!raw || (raw.min === null && raw.max === null) || !raw.period) return null;
  const currency = (raw.currency ?? 'USD').toUpperCase();
  const factor = monthlyFactor(raw.period, cfg);
  const usd = (v: number | null) => (v === null ? null : toUsd(v * factor, currency, fx));
  const usdMin = usd(raw.min);
  const usdMax = usd(raw.max);
  const convertible = usdMin !== null || usdMax !== null;
  if (convertible) {
    const probe = usdMax ?? usdMin!;
    const low = usdMin ?? usdMax!;
    if (probe > cfg.maxUsdMonthly || low < cfg.minUsdMonthly) return null;
  }
  const rate = currency === 'USD' || !fx ? null : currency === 'EUR' ? fx.perEur['USD'] ?? null : fx.perEur[currency] ?? null;
  return {
    min: raw.min,
    max: raw.max,
    currency,
    period: raw.period,
    usdMonthlyMin: usdMin === null ? null : round(usdMin),
    usdMonthlyMax: usdMax === null ? null : round(usdMax),
    convertible,
    fx: convertible && rate && fx ? { source: fx.source, date: fx.date, rate } : null,
  };
}

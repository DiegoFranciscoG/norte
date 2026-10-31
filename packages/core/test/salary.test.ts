import { describe, expect, it } from 'vitest';
import { normalizeSalary, parseSalaryText, toUsd, type FxTable } from '../src/salary.js';

const fx: FxTable = { source: 'BCE', date: '2026-10-30', perEur: { USD: 1.1172, MXN: 21.1237, BRL: 6.0692, GBP: 0.8338 } };
const cfg = { hoursPerMonth: 173.33, workDaysPerMonth: 21.67, weeksPerMonth: 4.333, minUsdMonthly: 150, maxUsdMonthly: 60000 };

describe('salary parsing', () => {
  it.each([
    ['$3.5k–$5k/month', { min: 3500, max: 5000, currency: 'USD', period: 'month' }],
    ['70K-80K', { min: 70000, max: 80000, currency: null, period: 'year' }],
    ['$170k - $200k', { min: 170000, max: 200000, currency: 'USD', period: 'year' }],
    ['$35,3k- $52k', { min: 35300, max: 52000, currency: 'USD', period: 'year' }],
    ['USD 1.200 - 1.500 mensual', { min: 1200, max: 1500, currency: 'USD', period: 'month' }],
    ['€50,000 – €60,000 per year', { min: 50000, max: 60000, currency: 'EUR', period: 'year' }],
    ['$25/hour', { min: 25, max: 25, currency: 'USD', period: 'hour' }],
    ['R$ 8.000 por mês', { min: 8000, max: 8000, currency: 'BRL', period: 'month' }],
  ])('parses %s', (text, expected) => {
    expect(parseSalaryText(text)).toEqual(expected);
  });

  it('rejects amounts that are not a wage', () => {
    expect(parseSalaryText('$1000 per task')).toBeNull();
    expect(parseSalaryText('Competitive')).toBeNull();
    expect(parseSalaryText('')).toBeNull();
  });
});

describe('salary normalization', () => {
  it('converts yearly USD to monthly USD', () => {
    expect(normalizeSalary({ min: 60000, max: 72000, currency: 'USD', period: 'year' }, fx, cfg)).toMatchObject({ usdMonthlyMin: 5000, usdMonthlyMax: 6000, convertible: true, fx: null });
  });

  it('converts EUR and MXN with the ECB rate and records the source and date', () => {
    const eur = normalizeSalary({ min: 3000, max: 3000, currency: 'EUR', period: 'month' }, fx, cfg)!;
    expect(eur.usdMonthlyMin).toBe(3352);
    expect(eur.fx).toEqual({ source: 'BCE', date: '2026-10-30', rate: 1.1172 });
    expect(toUsd(21123.7, 'MXN', fx)).toBeCloseTo(1117.2, 1);
  });

  it('converts hourly rates with the configured hours per month', () => {
    expect(normalizeSalary({ min: 20, max: 30, currency: 'USD', period: 'hour' }, fx, cfg)).toMatchObject({ usdMonthlyMin: 3467, usdMonthlyMax: 5200 });
  });

  it('keeps unconvertible currencies without inventing a USD value', () => {
    const cop = normalizeSalary({ min: 5000000, max: 6000000, currency: 'COP', period: 'month' }, fx, cfg)!;
    expect(cop).toMatchObject({ convertible: false, usdMonthlyMin: null, usdMonthlyMax: null, currency: 'COP' });
    expect(toUsd(100, 'EUR', null)).toBeNull();
  });

  it('discards implausible amounts (likely parsing errors)', () => {
    expect(normalizeSalary({ min: 25000, max: 30000, currency: 'USD', period: 'month' }, fx, { ...cfg, maxUsdMonthly: 20000 })).toBeNull();
    expect(normalizeSalary({ min: 5, max: 10, currency: 'USD', period: 'month' }, fx, cfg)).toBeNull();
    expect(normalizeSalary(null, fx, cfg)).toBeNull();
    expect(normalizeSalary({ min: 100, max: 200, currency: 'USD', period: null }, fx, cfg)).toBeNull();
  });
});

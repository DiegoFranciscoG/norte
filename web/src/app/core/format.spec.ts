import type { Job } from '@norte/core';
import { avatarColor, initials, locationLabel, salaryLabel, slug, timeAgo } from './format';

const base = {
  location: { city: 'Cuenca', province: 'Azuay', country: 'EC', raw: '' },
  modality: 'hybrid',
  remoteScope: null,
  salary: null,
} as unknown as Job;

describe('format', () => {
  it('describes how long ago a job was published', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    expect(timeAgo('2026-10-31T08:00:00Z', now)).toBe('hoy');
    expect(timeAgo('2026-10-30T08:00:00Z', now)).toBe('hace 1 día');
    expect(timeAgo('2026-10-02T08:00:00Z', now)).toBe('hace 29 días');
    expect(timeAgo('2026-10-01T08:00:00Z', now)).toBe('hace 1 mes');
    expect(timeAgo('2026-08-01T08:00:00Z', now)).toBe('hace 3 meses');
  });

  it('labels on-site and remote locations honestly', () => {
    expect(locationLabel(base)).toBe('Cuenca, Azuay, Ecuador (híbrido)');
    expect(locationLabel({ ...base, modality: 'remote', remoteScope: { type: 'latam', countries: [], ecuadorEligible: true } })).toBe('Remoto · Latinoamérica');
    expect(locationLabel({ ...base, modality: 'remote', remoteScope: { type: 'unknown', countries: [], ecuadorEligible: null } })).toBe('Remoto (alcance no declarado)');
  });

  it('shows normalized salaries and flags unconvertible currencies', () => {
    expect(salaryLabel(base)).toBeNull();
    expect(salaryLabel({ ...base, salary: { min: 1200, max: 1500, currency: 'USD', period: 'month', usdMonthlyMin: 1200, usdMonthlyMax: 1500, convertible: true, fx: null } })).toBe('$1.200 – $1.500 /mes');
    expect(salaryLabel({ ...base, salary: { min: 5000000, max: null, currency: 'COP', period: 'month', usdMonthlyMin: null, usdMonthlyMax: null, convertible: false, fx: null } })).toContain('moneda no convertible');
  });

  it('builds stable avatars and slugs', () => {
    expect(initials('Kruger NearShore (Rekluti)')).toBe('KN');
    expect(avatarColor('Devsu')).toBe(avatarColor('Devsu'));
    expect(slug('Desarrollador Java Señor')).toBe('desarrollador-java-senor');
  });
});

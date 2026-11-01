import type { Job, Salary } from '@norte/core';

export const NOW = new Date('2026-10-31T17:00:00Z');
const DAY = 86_400_000;

export const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

export function usd(min: number, max: number): Salary {
  return { min, max, currency: 'USD', period: 'month', usdMonthlyMin: min, usdMonthlyMax: max, convertible: true, fx: null };
}

/** Vacante ficticia completa; cada prueba cambia solo lo que le importa. */
export function job(p: Partial<Job> & { id: string }): Job {
  const seen = p.firstSeenAt ?? NOW.toISOString();
  return {
    title: 'Desarrollador Java',
    company: { name: 'Andina Software Demo', slug: 'andina-software-demo' },
    location: { city: 'Cuenca', province: 'Azuay', country: 'EC', raw: 'Cuenca, Ecuador' },
    modality: 'onsite',
    remoteScope: null,
    group: 'home',
    employmentType: 'full-time',
    seniority: 'mid',
    yearsRequired: 2,
    yearsInferred: false,
    skills: [{ id: 'java', optional: false }],
    salary: null,
    languages: [],
    postingLanguage: 'es',
    publishedAt: seen,
    firstSeenAt: seen,
    lastSeenAt: NOW.toISOString(),
    status: 'open',
    closedAt: null,
    excerpt: 'Extracto ficticio de la vacante.',
    sector: null,
    sources: [{ sourceId: 'greenhouse', externalId: p.id, sourceName: 'Greenhouse', url: `https://example.com/jobs/${p.id}`, applyUrl: null, attribution: null, allowInAlerts: true, fetchedAt: NOW.toISOString() }],
    fingerprint: p.id,
    ...p,
  };
}

const remoteLatam = { type: 'latam' as const, countries: [], ecuadorEligible: true };
const remoteUnknown = { type: 'unknown' as const, countries: [], ecuadorEligible: null };
const nowhere = { city: null, province: null, country: null, raw: 'Remote' };

/** Seis vacantes abiertas y una cerrada, todas vistas por primera vez en octubre de 2026. */
export function octoberJobs(): Job[] {
  return [
    job({ id: 'j1', skills: [{ id: 'java', optional: false }, { id: 'spring-boot', optional: false }], salary: usd(1000, 1400) }),
    job({ id: 'j2', title: 'Backend Developer', modality: 'hybrid', salary: usd(1200, 1200) }),
    job({ id: 'j3', title: 'Frontend Developer', seniority: 'junior', location: { city: 'Quito', province: 'Pichincha', country: 'EC', raw: 'Quito' }, group: 'ecuador', skills: [{ id: 'react', optional: false }], salary: usd(1400, 1600), company: { name: 'Volcán Fintech Demo', slug: 'volcan-fintech-demo' } }),
    job({ id: 'j4', title: 'Data Engineer', seniority: 'senior', location: { city: 'Guayaquil', province: 'Guayas', country: 'EC', raw: 'Guayaquil' }, group: 'ecuador', skills: [{ id: 'python', optional: false }], company: { name: 'Pacífico Datos Demo', slug: 'pacifico-datos-demo' } }),
    job({ id: 'j5', title: 'Senior Backend Engineer', seniority: 'senior', modality: 'remote', remoteScope: remoteLatam, location: nowhere, group: 'remote', skills: [{ id: 'java', optional: false }, { id: 'aws', optional: true }], salary: usd(3000, 4000), company: { name: 'Remoto Latam Demo', slug: 'remoto-latam-demo' } }),
    job({ id: 'j6', title: 'Frontend Engineer', modality: 'remote', remoteScope: remoteUnknown, location: nowhere, group: 'remote', skills: [{ id: 'react', optional: false }], company: { name: 'Remoto Latam Demo', slug: 'remoto-latam-demo' } }),
    job({ id: 'j7', status: 'closed', closedAt: NOW.toISOString(), firstSeenAt: daysAgo(10) }),
  ];
}

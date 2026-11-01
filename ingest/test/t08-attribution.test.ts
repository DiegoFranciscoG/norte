import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HttpClient } from '../src/http/client.js';
import { runPipeline } from '../src/pipeline.js';
import { portalTask } from '../src/sources/portals.js';
import { publish } from '../src/publish.js';
import { fakeFetch, json, testData } from './helpers.js';

const data = testData();
const now = new Date('2026-10-31T12:00:00Z');

/** Respuestas mínimas con la misma forma que las reales (verificadas el 2026-10-31), con datos ficticios. */
const RESPONSES: Record<string, unknown> = {
  'remoteok.com': [
    { legal: 'API Terms of Service: Please link back...' },
    { id: '101', position: 'Senior Backend Engineer', company: 'Ficticia Uno', location: 'Worldwide', tags: ['java'], description: '<p>Java</p>', date: '2026-10-29T10:00:00+00:00', url: 'https://remoteOK.com/remote-jobs/101', apply_url: 'https://remoteOK.com/l/101', salary_min: 0, salary_max: 0 },
  ],
  'remotive.com': { jobs: [{ id: 202, url: 'https://remotive.com/remote-jobs/software-dev/202', title: 'Frontend Developer', company_name: 'Ficticia Dos', category: 'Software Development', tags: ['react'], job_type: 'full_time', publication_date: '2026-10-28T08:00:00', candidate_required_location: 'Latin America', salary: '$3.5k–$5k/month', description: '<p>React</p>' }] },
  'himalayas.app': { jobs: [{ title: 'Data Engineer', companyName: 'Ficticia Tres', employmentType: 'Full Time', minSalary: 3000, maxSalary: 4000, salaryPeriod: 'monthly', currency: 'USD', seniority: ['Senior'], locationRestrictions: [], categories: ['Data-Engineer'], description: '<p>Python, AWS</p>', pubDate: 1793300000, applicationLink: 'https://himalayas.app/companies/f3/jobs/data?utm_source=api', guid: 'https://himalayas.app/companies/f3/jobs/data' }] },
  'weworkremotely.com': '<?xml version="1.0"?><rss><channel><item><title>Ficticia Cuatro: DevOps Engineer</title><region>Anywhere in the World</region><skills>Kubernetes, AWS</skills><type>Full-Time</type><description>&lt;p&gt;Kubernetes&lt;/p&gt;</description><pubDate>Sat, 31 Oct 2026 10:00:00 +0000</pubDate><guid>https://weworkremotely.com/remote-jobs/f4-devops</guid><link>https://weworkremotely.com/remote-jobs/f4-devops</link></item></channel></rss>',
  'www.arbeitnow.com': { data: [{ slug: 'f5-qa', company_name: 'Ficticia Cinco', title: 'QA Automation Engineer', description: '<p>QA</p>', remote: true, url: 'https://www.arbeitnow.com/jobs/companies/f5/qa', tags: [], job_types: ['full time'], location: 'Remote', created_at: 1793300000 }, { slug: 'f5-onsite', company_name: 'Ficticia Cinco', title: 'Backend Developer', description: '', remote: false, url: 'https://www.arbeitnow.com/x', tags: [], job_types: [], location: 'Berlin', created_at: 1793300000 }] },
  'jobicy.com': { jobs: [{ id: 606, url: 'https://jobicy.com/jobs/606-mobile', jobTitle: 'Mobile Developer', companyName: 'Ficticia Seis', jobIndustry: ['Software Engineering'], jobType: ['Full-Time'], jobGeo: 'LATAM', jobLevel: 'Midweight', jobDescription: '<p>Flutter</p>', pubDate: '2026-10-30T09:00:00+00:00' }] },
  'www.getonbrd.com': { data: [{ id: 'f7-java', type: 'job', attributes: { title: 'Desarrollador Java', description: '<p>Java y Spring Boot</p>', desirable: '<p>Kubernetes</p>', remote: false, remote_modality: 'no_remote', countries: ['Ecuador'], lang: 'lang_es', min_salary: 1500, max_salary: 2000, published_at: 1793300000, location_cities: { data: [{ id: '9', type: 'tenant_city', attributes: { name: 'Quito', country: 'Ecuador' } }] }, modality: { data: { id: '1', type: 'modality', attributes: { name: 'Full time', locale_key: 'full_time' } } }, seniority: { data: { id: '3', type: 'seniority', attributes: { name: 'Semi Senior' } } }, tags: { data: [] }, company: { data: { id: 'f7', type: 'company', attributes: { name: 'Ficticia Siete' } } } }, links: { public_url: 'https://www.getonbrd.com/jobs/f7-java' } }] },
};

function portalHttp() {
  return new HttpClient({
    policies: { default: { minIntervalMs: 0, maxRequestsPerRun: 20 } },
    userAgent: 'test',
    sleep: async () => undefined,
    fetchImpl: fakeFetch((url) => {
      const host = new URL(url).host;
      const body = RESPONSES[host];
      if (host === 'himalayas.app' && !url.endsWith('page=1')) return json({ jobs: [] });
      if (host === 'www.getonbrd.com' && !url.includes('/programming/')) return json({ data: [] });
      return typeof body === 'string' ? new Response(body, { status: 200 }) : json(body);
    }),
  });
}

describe('T-08 atribución presente en toda vacante que la exija', async () => {
  const tasks = data.sources.portals.filter((p) => p.enabled).map(portalTask);
  const result = await runPipeline({ data, http: portalHttp(), now, previous: null, fx: null, log: () => undefined, tasks });
  const required = new Map(data.sources.portals.map((p) => [`portal:${p.id}`, p]));

  it('lee una vacante de cada portal habilitado, también las presenciales fuera de Ecuador', () => {
    expect(Object.values(result.sourceRuns).every((r) => r.status === 'ok')).toBe(true);
    expect(result.jobs).toHaveLength(8);
    expect(result.jobs.find((j) => j.title === 'Backend Developer')).toMatchObject({ location: { city: 'Berlin', country: 'DE' } });
  });

  it('cada origen de portal lleva texto y enlace de atribución que apunta al portal', () => {
    for (const job of result.jobs) {
      for (const src of job.sources) {
        const portal = required.get(src.sourceId);
        if (!portal?.attribution.required) continue;
        expect(src.attribution, `${job.title} (${src.sourceId})`).toEqual({ text: portal.attribution.text, url: portal.attribution.url, follow: portal.attribution.follow });
        expect(new URL(src.url).host.replace(/^www\./, '').toLowerCase()).toContain(new URL(portal.attribution.url).host.replace(/^www\./, ''));
      }
    }
  });

  it('el botón de postular usa el enlace original sin modificar (Himalayas, Jobicy)', () => {
    const hima = result.jobs.find((j) => j.sources[0]!.sourceId === 'portal:himalayas')!;
    expect(hima.sources[0]!.applyUrl).toBe('https://himalayas.app/companies/f3/jobs/data?utm_source=api');
  });

  it('las vacantes de Remotive quedan excluidas de las alertas por correo', () => {
    const remotive = result.jobs.find((j) => j.sources[0]!.sourceId === 'portal:remotive')!;
    expect(remotive.sources[0]!.allowInAlerts).toBe(false);
  });

  it('el índice publicado conserva la atribución y no declara datos estructurados JobPosting', async () => {
    const out = await mkdtemp(join(tmpdir(), 'norte-t08-'));
    await publish({ outDir: out, data, result, now, demo: false, buildVersion: 't08', commit: null });
    const published = JSON.parse(await readFile(join(out, 'jobs.json'), 'utf8')) as typeof result & { jobs: typeof result.jobs };
    const missing = published.jobs.flatMap((j) => j.sources).filter((s) => required.get(s.sourceId)?.attribution.required && !s.attribution);
    expect(missing).toEqual([]);
    const raw = await readFile(join(out, 'jobs.json'), 'utf8');
    expect(raw).not.toContain('JobPosting');
    await rm(out, { recursive: true, force: true });
  });
});

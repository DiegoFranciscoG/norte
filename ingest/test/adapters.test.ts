import { describe, expect, it } from 'vitest';
import type { CompanyEntry } from '../src/config.js';
import { HttpClient } from '../src/http/client.js';
import { atsTask, mapAshby, mapGreenhouse, mapLever, mapRecruitee, mapSmartRecruitersItem, mapTeamtailor, mapWorkable, xml } from '../src/sources/ats.js';
import { fakeFetch, json, testData } from './helpers.js';

const data = testData();
const company = (ats: CompanyEntry['ats'], board = 'ficticia'): CompanyEntry => ({ id: 'f', name: 'Ficticia S.A.', ats, board, region: 'EC', cities: ['Quito'], sector: 'software', website: null, evidence: { jobs: 1, ecuador: 1, latam: 0 } });
const def = (ats: CompanyEntry['ats']) => data.sources.ats[ats];

describe('adaptadores ATS (forma real, datos ficticios)', () => {
  it('Greenhouse: ubicación, oficinas, metadatos y HTML escapado', () => {
    const [p] = mapGreenhouse({ jobs: [{ id: 1, title: ' Backend Engineer ', absolute_url: 'https://x/1', location: { name: 'Quito, Ecuador' }, offices: [{ name: 'Quito', location: 'Quito, Pichincha, Ecuador' }], metadata: [{ name: 'Employment Type', value: 'Employee' }, { name: 'Job Grade', value: 'Senior' }, { name: 'No. of days in office', value: 'Hybrid - 3 days' }], content: '&lt;p&gt;Java&lt;/p&gt;', language: 'en', first_published: '2026-10-19T09:03:08-04:00' }] }, company('greenhouse'), def('greenhouse'));
    expect(p).toMatchObject({ sourceId: 'ats:greenhouse:ficticia', externalId: '1', title: 'Backend Engineer', employmentText: 'Employee', seniorityTexts: ['Senior'], postingLanguageHint: 'en', publishedAt: '2026-10-19T13:03:08.000Z' });
    expect(p!.locationTexts).toContain('Hybrid - 3 days');
  });

  it('Lever: modalidad estructurada, listas y salario', () => {
    const [p] = mapLever([{ id: 'abc', text: 'Data Engineer', categories: { commitment: 'Full-time', location: 'Quito', allLocations: ['Quito', 'Remote'] }, country: 'EC', workplaceType: 'hybrid', createdAt: 1793300000000, descriptionPlain: 'Intro', lists: [{ text: 'Requirements', content: '<li>Python</li>' }], additionalPlain: 'Bye', hostedUrl: 'https://jobs.lever.co/f/abc', applyUrl: 'https://jobs.lever.co/f/abc/apply', salaryRange: { min: 1000, max: 2000, currency: 'USD', interval: 'per-month-salary' } }], company('lever'), def('lever'));
    expect(p).toMatchObject({ modality: 'hybrid', countryIso: 'EC', salary: { min: 1000, max: 2000, currency: 'USD', period: 'month' }, applyUrl: 'https://jobs.lever.co/f/abc/apply' });
    expect(p!.descriptionText).toContain('Requirements:\n• Python');
  });

  it('Ashby: omite no listadas y lee la compensación', () => {
    const res = mapAshby({ jobs: [
      { id: 'a', title: 'QA', isListed: false },
      { id: 'b', title: 'Backend Engineer', isListed: true, workplaceType: 'Remote', employmentType: 'FullTime', location: 'Remote (LATAM)', secondaryLocations: [{ location: 'Quito' }], address: { postalAddress: { addressCountry: 'Ecuador' } }, publishedAt: '2026-10-01T00:00:00.000+00:00', jobUrl: 'https://jobs.ashbyhq.com/f/b', applyUrl: 'https://jobs.ashbyhq.com/f/b/application', descriptionPlain: 'Go', compensation: { summaryComponents: [{ compensationType: 'EquityPercentage', interval: 'NONE' }, { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'USD', minValue: 60000, maxValue: 72000 }] } },
    ] }, company('ashby'), def('ashby'));
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ modality: 'remote', employmentText: 'FullTime', salary: { min: 60000, max: 72000, period: 'year' } });
  });

  it('Workable: ubicación y teletrabajo', () => {
    const [p] = mapWorkable({ jobs: [{ title: 'Ingeniero Cloud', shortcode: 'C3', employment_type: 'Full-time', telecommuting: false, url: 'https://apply.workable.com/j/C3', application_url: 'https://apply.workable.com/j/C3/apply', published_on: '2026-07-30', country: 'Ecuador', city: 'Quito', state: 'Pichincha', experience: 'Mid-Senior level', locations: [{ country: 'Ecuador', countryCode: 'EC', city: 'Quito', region: 'Pichincha', hidden: false }], description: '<p>AWS</p>' }] }, company('workable'), def('workable'));
    expect(p).toMatchObject({ externalId: 'C3', countryIso: 'EC', city: 'Quito', modality: null, seniorityTexts: ['Mid-Senior level'] });
  });

  it('Recruitee: descarta mailbox_email y lee modalidad y salario', () => {
    const [p] = mapRecruitee({ offers: [{ id: 7, title: 'Desarrollador', status: 'published', location: 'Quito, Pichincha, Ecuador', city: 'Quito', country_code: 'EC', remote: false, hybrid: true, on_site: false, employment_type_code: 'fulltime_permanent', experience_code: 'mid_level', salary: { min: 1200, max: 1600, period: 'month', currency: 'USD' }, description: '<p>Java</p>', requirements: '<p>SQL</p>', published_at: '2026-10-28 13:21:58 UTC', careers_url: 'https://f.recruitee.com/o/dev', careers_apply_url: 'https://f.recruitee.com/o/dev/c/new', mailbox_email: 'job.x@f.recruitee.com', tags: ['backend'] }] }, company('recruitee'), def('recruitee'));
    expect(p).toMatchObject({ modality: 'hybrid', salary: { min: 1200, max: 1600, period: 'month', currency: 'USD' }, publishedAt: '2026-10-28T13:21:58.000Z' });
    expect(JSON.stringify(p)).not.toContain('job.x@');
  });

  it('SmartRecruiters: listado más detalle', () => {
    const p = mapSmartRecruitersItem(
      { id: '744', name: 'Analista Programador', releasedDate: '2026-10-31T00:14:50.750Z', location: { city: 'Machachi', region: 'Pichincha', country: 'ec', remote: false, hybrid: false, fullLocation: 'Machachi, Pichincha, Ecuador' }, typeOfEmployment: { label: 'Full-time' }, experienceLevel: { id: 'associate', label: 'Associate' }, language: { code: 'es' } },
      { postingUrl: 'https://jobs.smartrecruiters.com/F/744-analista', jobAd: { sections: { jobDescription: { title: 'Descripción', text: '<p>SAP</p>' }, qualifications: { title: 'Requisitos', text: '<p>SQL</p>' } } } },
      company('smartrecruiters', 'F'), def('smartrecruiters'));
    expect(p).toMatchObject({ countryIso: 'EC', modality: 'onsite', url: 'https://jobs.smartrecruiters.com/F/744-analista' });
    expect(p.descriptionText).toBe('Descripción:\nSAP\n\nRequisitos:\nSQL');
  });

  it('Teamtailor: RSS con ubicaciones y modalidad', () => {
    const rss = '<?xml version="1.0"?><rss xmlns:tt="https://teamtailor.com/locations"><channel><item><title>PASANTE DE CLOUD</title><description>&lt;p&gt;Linux&lt;/p&gt;</description><pubDate>Sat, 31 Oct 2026 14:31:24 -0500</pubDate><link>https://f.teamtailor.com/jobs/1-cloud</link><remoteStatus>hybrid</remoteStatus><guid>g-1</guid><tt:locations><tt:location><tt:city>Cuenca</tt:city><tt:country>Ecuador</tt:country></tt:location></tt:locations><tt:department>TI</tt:department></item></channel></rss>';
    const [p] = mapTeamtailor(xml.parse(rss), company('teamtailor'), def('teamtailor'));
    expect(p).toMatchObject({ externalId: 'g-1', city: 'Cuenca', modality: 'hybrid', locationTexts: ['Cuenca, Ecuador'], publishedAt: '2026-10-31T19:31:24.000Z' });
  });

  it('SmartRecruiters pide detalle solo para títulos de TI y pagina el listado', async () => {
    const urls: string[] = [];
    const http = new HttpClient({ policies: { default: { minIntervalMs: 0, maxRequestsPerRun: 10 } }, userAgent: 't', sleep: async () => undefined, fetchImpl: fakeFetch((url) => {
      urls.push(url);
      if (url.includes('/postings?')) return json({ totalFound: 2, content: [{ id: '1', name: 'Desarrollador Java', location: { country: 'ec', city: 'Quito' } }, { id: '2', name: 'Chofer', location: { country: 'ec', city: 'Quito' } }] });
      return json({ jobAd: { sections: { jobDescription: { title: 'D', text: 'Java' } } } });
    }) });
    const task = atsTask(company('smartrecruiters', 'F'), data.sources.ats, true);
    const out = await task.run({ http, now: new Date(), log: () => undefined, isTechTitle: (t) => t.includes('Java') });
    expect(out).toHaveLength(2);
    expect(urls.filter((u) => /postings\/\d/.test(u))).toEqual(['https://api.smartrecruiters.com/v1/companies/F/postings/1']);
    expect(urls[0]).toContain('country=ec');
  });
});

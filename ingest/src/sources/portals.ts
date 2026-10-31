import { parseSalaryText, type Modality } from '@norte/core';
import type { PortalDef } from '../config.js';
import { BudgetExceededError } from '../http/client.js';
import { xml } from './ats.js';
import { asArr, asNum, asObj, asStr, isoFromDate, isoFromEpoch, parseJson, type FetchContext, type RawPosting, type SourceTask } from './types.js';

type PortalMapper = (data: unknown, def: PortalDef) => RawPosting[];

const remote = (def: PortalDef) => ({ sourceId: `portal:${def.id}`, modality: 'remote' as Modality, remoteOnlySource: true });

export const mapRemoteOk: PortalMapper = (data, def) =>
  asArr(data).map(asObj).filter((j) => j['id'] !== undefined && j['position']).map((j) => {
    const max = asNum(j['salary_max']) ?? 0;
    const min = asNum(j['salary_min']) ?? 0;
    return {
      ...remote(def),
      externalId: asStr(j['id']),
      title: asStr(j['position']).trim(),
      company: asStr(j['company']).trim(),
      locationTexts: [asStr(j['location'])],
      salary: max > 0 ? { min: min > 0 ? min : max, max, currency: 'USD', period: 'year' } : null,
      descriptionHtml: asStr(j['description']),
      publishedAt: isoFromDate(j['date']) ?? isoFromEpoch(j['epoch']),
      url: asStr(j['url']),
      applyUrl: asStr(j['apply_url']) || null,
      tags: asArr(j['tags']).map(asStr),
    } satisfies RawPosting;
  });

export const mapRemotive: PortalMapper = (data, def) =>
  asArr(asObj(data)['jobs']).map(asObj).map((j) => ({
    ...remote(def),
    externalId: asStr(j['id']),
    title: asStr(j['title']).trim(),
    company: asStr(j['company_name']).trim(),
    locationTexts: [asStr(j['candidate_required_location'])],
    employmentText: asStr(j['job_type']) || null,
    salary: parseSalaryText(asStr(j['salary'])),
    salaryText: asStr(j['salary']) || null,
    descriptionHtml: asStr(j['description']),
    publishedAt: isoFromDate(j['publication_date']),
    url: asStr(j['url']),
    applyUrl: asStr(j['url']) || null,
    tags: asArr(j['tags']).map(asStr),
  }) satisfies RawPosting);

const HIMALAYAS_PERIOD: Record<string, 'hour' | 'month' | 'year' | 'week' | 'day'> = { hourly: 'hour', monthly: 'month', annual: 'year', yearly: 'year', weekly: 'week', daily: 'day' };

export const mapHimalayas: PortalMapper = (data, def) =>
  asArr(asObj(data)['jobs']).map(asObj).map((j) => {
    const min = asNum(j['minSalary']);
    const max = asNum(j['maxSalary']);
    const period = HIMALAYAS_PERIOD[asStr(j['salaryPeriod']).toLowerCase()] ?? null;
    const restrictions = asArr(j['locationRestrictions']).map(asStr);
    return {
      ...remote(def),
      externalId: asStr(j['guid']),
      title: asStr(j['title']).trim(),
      company: asStr(j['companyName']).trim(),
      locationTexts: restrictions.length ? [] : ['Worldwide'],
      structuredCountries: restrictions,
      employmentText: asStr(j['employmentType']) || null,
      seniorityTexts: asArr(j['seniority']).map(asStr),
      salary: (min !== null || max !== null) && period ? { min, max, currency: asStr(j['currency']) || 'USD', period } : null,
      descriptionHtml: asStr(j['description']),
      publishedAt: isoFromEpoch(j['pubDate']),
      url: asStr(j['guid']),
      applyUrl: asStr(j['applicationLink']) || null,
      tags: asArr(j['categories']).map((c) => asStr(c).replace(/-/g, ' ')),
    } satisfies RawPosting;
  });

export const mapWeWorkRemotely: PortalMapper = (data, def) => {
  const channel = asObj(asObj(asObj(data)['rss'])['channel']);
  return asArr(channel['item']).map(asObj).map((it) => {
    const full = asStr(it['title']);
    const idx = full.indexOf(':');
    return {
      ...remote(def),
      externalId: asStr(it['guid']) || asStr(it['link']),
      title: (idx >= 0 ? full.slice(idx + 1) : full).trim(),
      company: (idx >= 0 ? full.slice(0, idx) : '').trim(),
      locationTexts: [asStr(it['region']), asStr(it['country']), asStr(it['state'])],
      employmentText: asStr(it['type']) || null,
      descriptionHtml: asStr(it['description']),
      publishedAt: isoFromDate(it['pubDate']),
      url: asStr(it['link']),
      applyUrl: asStr(it['link']) || null,
      tags: asStr(it['skills']).split(/,|\band\b/).map((s) => s.trim()).filter(Boolean),
    } satisfies RawPosting;
  });
};

export const mapArbeitnow: PortalMapper = (data, def) =>
  asArr(asObj(data)['data']).map(asObj).filter((j) => !def.remoteOnly || j['remote'] === true).map((j) => ({
    ...remote(def),
    externalId: asStr(j['slug']),
    title: asStr(j['title']).trim(),
    company: asStr(j['company_name']).trim(),
    locationTexts: [asStr(j['location'])],
    employmentText: asArr(j['job_types']).map(asStr).join(' ') || null,
    descriptionHtml: asStr(j['description']),
    publishedAt: isoFromEpoch(j['created_at']),
    url: asStr(j['url']),
    applyUrl: asStr(j['url']) || null,
    tags: asArr(j['tags']).map(asStr),
  }) satisfies RawPosting);

export const mapJobicy: PortalMapper = (data, def) =>
  asArr(asObj(data)['jobs']).map(asObj).map((j) => {
    const min = asNum(j['annualSalaryMin'] ?? j['salaryMin']);
    const max = asNum(j['annualSalaryMax'] ?? j['salaryMax']);
    return {
      ...remote(def),
      externalId: asStr(j['id']),
      title: asStr(j['jobTitle']).trim(),
      company: asStr(j['companyName']).trim(),
      locationTexts: [asStr(j['jobGeo'])],
      employmentText: asArr(j['jobType']).map(asStr).join(' ') || null,
      seniorityTexts: [asStr(j['jobLevel'])].filter(Boolean),
      salary: min !== null || max !== null ? { min, max, currency: asStr(j['salaryCurrency']) || 'USD', period: 'year' } : null,
      descriptionHtml: asStr(j['jobDescription']),
      publishedAt: isoFromDate(j['pubDate']),
      url: asStr(j['url']),
      applyUrl: asStr(j['url']) || null,
      tags: asArr(j['jobIndustry']).map(asStr),
    } satisfies RawPosting;
  });

const GOB_MODALITY: Record<string, Modality> = { fully_remote: 'remote', remote_local: 'remote', hybrid: 'hybrid', no_remote: 'onsite' };

export const mapGetOnBoard: PortalMapper = (data, def) =>
  asArr(asObj(data)['data']).map(asObj).map((item) => {
    const a = asObj(item['attributes']);
    const rel = (key: string) => asObj(asObj(a[key])['data']);
    const cities = asArr(asObj(a['location_cities'])['data']).map((c) => asObj(asObj(c)['attributes']));
    const remoteModality = asStr(a['remote_modality']);
    const countries = asArr(a['countries']).map(asStr).filter((c) => c && c.toLowerCase() !== 'remote');
    const cityCountries = cities.map((c) => asStr(c['country'])).filter(Boolean);
    const min = asNum(a['min_salary']);
    const max = asNum(a['max_salary']);
    const html = (key: string) => asStr(a[key]);
    return {
      sourceId: `portal:${def.id}`,
      externalId: asStr(item['id']),
      title: asStr(a['title']).trim(),
      company: asStr(asObj(rel('company')['attributes'])['name']).trim(),
      locationTexts: [...cities.map((c) => `${asStr(c['name'])}, ${asStr(c['country'])}`), ...countries, asStr(a['remote_zone'])],
      city: asStr(cities[0]?.['name']) || null,
      structuredCountries: remoteModality === 'fully_remote' ? [] : [...new Set([...countries, ...cityCountries])],
      modality: GOB_MODALITY[remoteModality] ?? null,
      employmentText: asStr(asObj(rel('modality')['attributes'])['locale_key']) || null,
      seniorityTexts: [asStr(asObj(rel('seniority')['attributes'])['name'])].filter(Boolean),
      salary: min !== null || max !== null ? { min, max, currency: 'USD', period: 'month' } : null,
      descriptionHtml: [html('description_headline'), html('description'), html('functions_headline'), html('functions'), html('projects')].join('\n'),
      optionalText: [html('desirable_headline'), html('desirable')].join('\n') || null,
      postingLanguageHint: asStr(a['lang']).replace('lang_', '') || null,
      publishedAt: isoFromEpoch(a['published_at']),
      url: asStr(asObj(item['links'])['public_url']),
      applyUrl: asStr(asObj(item['links'])['public_url']) || null,
      tags: asArr(asObj(a['tags'])['data']).map((t) => asStr(asObj(asObj(t)['attributes'])['name'])),
    } satisfies RawPosting;
  });

const MAPPERS: Record<string, PortalMapper> = {
  remoteok: mapRemoteOk,
  remotive: mapRemotive,
  himalayas: mapHimalayas,
  weworkremotely: mapWeWorkRemotely,
  arbeitnow: mapArbeitnow,
  jobicy: mapJobicy,
  getonboard: mapGetOnBoard,
};

async function fetchPages(ctx: FetchContext, def: PortalDef): Promise<unknown[]> {
  if (def.id === 'himalayas') {
    const pages: unknown[] = [];
    for (let page = 1; page <= (def.maxPages ?? 1); page++) {
      try {
        const res = await ctx.http.get(def.endpoint.replace('{page}', String(page)));
        const data = parseJson(res.body, def.id);
        if (asArr(asObj(data)['jobs']).length === 0) break;
        pages.push(data);
      } catch (err) {
        if (err instanceof BudgetExceededError && pages.length > 0) break;
        throw err;
      }
    }
    return pages;
  }
  if (def.id === 'getonboard') {
    const pages: unknown[] = [];
    for (const category of def.categories ?? []) {
      const url = def.endpoint.replace('{category}', category).replace('expand=%5B%22company%22%5D', 'expand=%5B%22company%22%2C%22seniority%22%2C%22modality%22%2C%22location_cities%22%2C%22tags%22%5D');
      const res = await ctx.http.get(url);
      pages.push(parseJson(res.body, def.id));
    }
    return pages;
  }
  const isRss = def.endpoint.endsWith('.rss');
  const res = await ctx.http.get(def.endpoint, isRss ? 'application/rss+xml' : 'application/json');
  return [isRss ? xml.parse(res.body) : parseJson(res.body, def.id)];
}

export function portalTask(def: PortalDef): SourceTask {
  return {
    sourceId: `portal:${def.id}`,
    sourceName: def.name,
    kind: 'portal',
    attribution: def.attribution.required ? { text: def.attribution.text, url: def.attribution.url, follow: def.attribution.follow } : null,
    allowInAlerts: def.usage.alerts,
    minHoursBetweenFetches: def.minHoursBetweenFetches,
    async run(ctx) {
      const mapper = MAPPERS[def.id];
      if (!mapper) throw new Error(`Portal sin adaptador: ${def.id}`);
      const pages = await fetchPages(ctx, def);
      const seen = new Set<string>();
      return pages.flatMap((p) => mapper(p, def)).filter((p) => {
        if (!p.title || !p.url || seen.has(p.externalId)) return false;
        seen.add(p.externalId);
        return true;
      });
    },
  };
}

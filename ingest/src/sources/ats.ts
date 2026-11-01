import { htmlToText, type Modality, type RawSalary, type SalaryPeriod } from '@norte/core';
import { XMLParser } from 'fast-xml-parser';
import type { AtsDef, AtsId, CompanyEntry } from '../config.js';
import { BudgetExceededError } from '../http/client.js';
import { asArr, asNum, asObj, asStr, isoFromDate, isoFromEpoch, parseJson, type FetchContext, type Json, type RawPosting, type SourceTask } from './types.js';

type Mapper = (data: unknown, company: CompanyEntry, def: AtsDef) => RawPosting[];

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(values[k] ?? '').replace(/%2F/g, '/'));

function base(company: CompanyEntry, ats: AtsId): Pick<RawPosting, 'sourceId' | 'company' | 'companyRegion' | 'sector'> {
  return { sourceId: `ats:${ats}:${company.board}`, company: company.name, companyRegion: company.region, sector: company.sector };
}

function intervalToPeriod(interval: string): SalaryPeriod | null {
  const s = interval.toLowerCase();
  if (s.includes('year') || s.includes('annual')) return 'year';
  if (s.includes('month')) return 'month';
  if (s.includes('week')) return 'week';
  if (s.includes('day')) return 'day';
  if (s.includes('hour')) return 'hour';
  return null;
}

export const mapGreenhouse: Mapper = (data, company) => {
  return asArr(asObj(data)['jobs']).map((raw) => {
    const j = asObj(raw);
    const metadata = asArr(j['metadata']).map(asObj);
    const meta = (re: RegExp) => metadata.filter((m) => re.test(asStr(m['name']))).flatMap((m) => asArr(m['value']).map(asStr)).filter(Boolean);
    const offices = asArr(j['offices']).map(asObj).map((o) => asStr(o['location']) || asStr(o['name']));
    return {
      ...base(company, 'greenhouse'),
      externalId: asStr(j['id']),
      title: asStr(j['title']).trim(),
      locationTexts: [asStr(asObj(j['location'])['name']), ...offices, ...meta(/location|country|remote|workplace|office|days/i)],
      employmentText: meta(/employment|contract|type/i).join(' ') || null,
      seniorityTexts: meta(/grade|level|seniority/i),
      descriptionHtml: asStr(j['content']),
      postingLanguageHint: asStr(j['language']) || null,
      publishedAt: isoFromDate(j['first_published']) ?? isoFromDate(j['updated_at']),
      url: asStr(j['absolute_url']),
      applyUrl: asStr(j['absolute_url']) || null,
    };
  });
};

export const mapLever: Mapper = (data, company) => {
  return asArr(data).map((raw) => {
    const j = asObj(raw);
    const cats = asObj(j['categories']);
    const lists = asArr(j['lists']).map(asObj).map((l) => `${asStr(l['text'])}:\n${htmlToText(asStr(l['content']))}`);
    const workplace = asStr(j['workplaceType']).toLowerCase();
    const range = asObj(j['salaryRange']);
    const salary: RawSalary | null = asNum(range['min']) !== null || asNum(range['max']) !== null
      ? { min: asNum(range['min']), max: asNum(range['max']), currency: asStr(range['currency']) || null, period: intervalToPeriod(asStr(range['interval'])) }
      : null;
    return {
      ...base(company, 'lever'),
      externalId: asStr(j['id']),
      title: asStr(j['text']).trim(),
      locationTexts: [asStr(cats['location']), ...asArr(cats['allLocations']).map(asStr)],
      countryIso: asStr(j['country']) || null,
      modality: (['onsite', 'hybrid', 'remote'].includes(workplace) ? workplace : null) as Modality | null,
      employmentText: asStr(cats['commitment']) || null,
      salary,
      salaryText: asStr(j['salaryDescriptionPlain']) || null,
      descriptionText: [asStr(j['openingPlain']) || asStr(j['descriptionPlain']), ...lists, asStr(j['additionalPlain'])].filter(Boolean).join('\n\n'),
      publishedAt: isoFromEpoch(j['createdAt']),
      url: asStr(j['hostedUrl']),
      applyUrl: asStr(j['applyUrl']) || null,
    };
  });
};

export const mapAshby: Mapper = (data, company) => {
  return asArr(asObj(data)['jobs']).map(asObj).filter((j) => j['isListed'] !== false).map((j) => {
    const workplace = asStr(j['workplaceType']).toLowerCase();
    const address = asObj(asObj(j['address'])['postalAddress']);
    const comp = asObj(j['compensation']);
    const components = [
      ...asArr(comp['summaryComponents']),
      ...asArr(comp['compensationTiers']).flatMap((t) => asArr(asObj(t)['components'])),
    ].map(asObj);
    const pay = components.find((c) => asStr(c['compensationType']) === 'Salary' && (asNum(c['minValue']) !== null || asNum(c['maxValue']) !== null));
    return {
      ...base(company, 'ashby'),
      externalId: asStr(j['id']),
      title: asStr(j['title']).trim(),
      locationTexts: [asStr(j['location']), ...asArr(j['secondaryLocations']).map((s) => asStr(asObj(s)['location'])), asStr(address['addressLocality']), asStr(address['addressCountry'])],
      modality: workplace === 'onsite' ? 'onsite' : workplace === 'hybrid' ? 'hybrid' : workplace === 'remote' || j['isRemote'] === true ? 'remote' : null,
      employmentText: asStr(j['employmentType']) || null,
      salary: pay ? { min: asNum(pay['minValue']), max: asNum(pay['maxValue']), currency: asStr(pay['currencyCode']) || null, period: intervalToPeriod(asStr(pay['interval'])) } : null,
      descriptionHtml: asStr(j['descriptionHtml']) || null,
      descriptionText: asStr(j['descriptionPlain']) || null,
      publishedAt: isoFromDate(j['publishedAt']),
      url: asStr(j['jobUrl']),
      applyUrl: asStr(j['applyUrl']) || null,
    } satisfies RawPosting;
  });
};

export const mapWorkable: Mapper = (data, company) => {
  return asArr(asObj(data)['jobs']).map(asObj).map((j) => {
    const locations = asArr(j['locations']).map(asObj).filter((l) => l['hidden'] !== true);
    return {
      ...base(company, 'workable'),
      externalId: asStr(j['shortcode']),
      title: asStr(j['title']).trim(),
      locationTexts: [asStr(j['city']), asStr(j['state']), asStr(j['country']), ...locations.map((l) => `${asStr(l['city'])} ${asStr(l['region'])} ${asStr(l['country'])}`.trim())],
      countryIso: asStr(locations[0]?.['countryCode']) || null,
      city: asStr(j['city']) || asStr(locations[0]?.['city']) || null,
      modality: j['telecommuting'] === true ? 'remote' : null,
      employmentText: asStr(j['employment_type']) || null,
      seniorityTexts: [asStr(j['experience'])].filter(Boolean),
      descriptionHtml: asStr(j['description']) || null,
      publishedAt: isoFromDate(j['published_on']) ?? isoFromDate(j['created_at']),
      url: asStr(j['url']) || asStr(j['shortlink']),
      applyUrl: asStr(j['application_url']) || null,
    } satisfies RawPosting;
  });
};

export const mapRecruitee: Mapper = (data, company) => {
  return asArr(asObj(data)['offers']).map(asObj).filter((o) => !o['status'] || o['status'] === 'published').map((o) => {
    const salary = asObj(o['salary']);
    const period = asStr(salary['period']);
    const modality: Modality | null = o['remote'] === true ? 'remote' : o['hybrid'] === true ? 'hybrid' : o['on_site'] === true ? 'onsite' : null;
    return {
      ...base(company, 'recruitee'),
      externalId: asStr(o['id']),
      title: asStr(o['title']).trim(),
      locationTexts: [asStr(o['location']), ...asArr(o['locations']).map(asObj).map((l) => `${asStr(l['city'])} ${asStr(l['state'])} ${asStr(l['country'])}`.trim())],
      countryIso: asStr(o['country_code']) || null,
      city: asStr(o['city']) || null,
      modality,
      employmentText: asStr(o['employment_type_code']) || null,
      seniorityTexts: [asStr(o['experience_code'])].filter(Boolean),
      salary: asNum(salary['min']) !== null || asNum(salary['max']) !== null
        ? { min: asNum(salary['min']), max: asNum(salary['max']), currency: asStr(salary['currency']) || null, period: intervalToPeriod(period) }
        : null,
      descriptionHtml: `${asStr(o['description'])}\n${asStr(o['requirements'])}`,
      publishedAt: isoFromDate(o['published_at']) ?? isoFromDate(o['created_at']),
      url: asStr(o['careers_url']),
      applyUrl: asStr(o['careers_apply_url']) || null,
      tags: asArr(o['tags']).map(asStr),
    } satisfies RawPosting;
  });
};

export function mapSmartRecruitersItem(item: Json, detail: Json | null, company: CompanyEntry, def: AtsDef): RawPosting {
  const loc = asObj(item['location']);
  const sections = asObj(asObj(asObj(detail)['jobAd'])['sections']);
  const sectionText = (key: string) => {
    const s = asObj(sections[key]);
    return s['text'] ? `${asStr(s['title'])}:\n${htmlToText(asStr(s['text']))}` : '';
  };
  const id = asStr(item['id']);
  const modality: Modality | null = loc['remote'] === true ? 'remote' : loc['hybrid'] === true ? 'hybrid' : 'onsite';
  return {
    ...base(company, 'smartrecruiters'),
    externalId: id,
    title: asStr(item['name']).trim(),
    locationTexts: [asStr(loc['fullLocation']), asStr(loc['city']), asStr(loc['region'])],
    countryIso: asStr(loc['country']).toUpperCase() || null,
    city: asStr(loc['city']) || null,
    modality,
    employmentText: asStr(asObj(item['typeOfEmployment'])['label']) || null,
    seniorityTexts: [asStr(asObj(item['experienceLevel'])['id']), asStr(asObj(item['experienceLevel'])['label'])].filter(Boolean),
    descriptionText: ['jobDescription', 'qualifications', 'additionalInformation'].map(sectionText).filter(Boolean).join('\n\n') || null,
    postingLanguageHint: asStr(asObj(item['language'])['code']) || null,
    publishedAt: isoFromDate(item['releasedDate']),
    url: asStr(asObj(detail)['postingUrl']) || fill(def.jobUrl ?? def.boardUrl, { board: company.board, id }),
    applyUrl: asStr(asObj(detail)['applyUrl']) || null,
  };
}

export const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, isArray: (name) => name === 'item' || name === 'tt:location' });

export const mapTeamtailor: Mapper = (data, company) => {
  const channel = asObj(asObj(asObj(data)['rss'])['channel']);
  return asArr(channel['item']).map(asObj).map((it) => {
    const locations = asArr(asObj(it['tt:locations'])['tt:location']).map(asObj);
    const status = asStr(it['remoteStatus']).toLowerCase();
    const modality: Modality | null = status === 'fully' || status === 'remote' ? 'remote' : status === 'hybrid' ? 'hybrid' : status === 'none' ? 'onsite' : null;
    const link = asStr(it['link']);
    return {
      ...base(company, 'teamtailor'),
      externalId: asStr(it['guid']) || link,
      title: asStr(it['title']).trim(),
      locationTexts: locations.map((l) => `${asStr(l['tt:city'])}, ${asStr(l['tt:country'])}`),
      city: asStr(locations[0]?.['tt:city']) || null,
      modality,
      descriptionHtml: asStr(it['description']),
      publishedAt: isoFromDate(it['pubDate']),
      url: link,
      applyUrl: link || null,
      tags: [asStr(it['tt:department']), asStr(it['tt:role'])].filter(Boolean),
    } satisfies RawPosting;
  });
};

const MAPPERS: Record<Exclude<AtsId, 'smartrecruiters'>, Mapper> = {
  greenhouse: mapGreenhouse,
  lever: mapLever,
  ashby: mapAshby,
  workable: mapWorkable,
  recruitee: mapRecruitee,
  teamtailor: mapTeamtailor,
};

async function runSmartRecruiters(ctx: FetchContext, company: CompanyEntry, def: AtsDef, detailOnlyForTech: boolean): Promise<RawPosting[]> {
  const items: Json[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const res = await ctx.http.get(fill(def.listUrl, { board: company.board, offset: String(offset) }) + '&country=ec');
    const page = asObj(parseJson(res.body, company.board));
    const content = asArr(page['content']).map(asObj);
    items.push(...content);
    const total = asNum(page['totalFound']) ?? 0;
    if (content.length < 100 || items.length >= total) break;
  }
  const out: RawPosting[] = [];
  for (const item of items) {
    const title = asStr(item['name']);
    let detail: Json | null = null;
    if (!detailOnlyForTech || ctx.isTechTitle(title)) {
      try {
        const res = await ctx.http.get(fill(def.detailUrl!, { board: company.board, id: asStr(item['id']) }));
        detail = asObj(parseJson(res.body, company.board));
      } catch (err) {
        if (!(err instanceof BudgetExceededError)) throw err;
        ctx.log(`smartrecruiters:${company.board}: presupuesto agotado, sigue sin descripción`);
      }
    }
    out.push(mapSmartRecruitersItem(item, detail, company, def));
  }
  return out;
}

export function atsTask(company: CompanyEntry, defs: Record<AtsId, AtsDef>, detailOnlyForTech: boolean, minHoursBetweenFetches = 0): SourceTask {
  const def = defs[company.ats];
  return {
    sourceId: `ats:${company.ats}:${company.board}`,
    sourceName: `${company.name} (${def.name})`,
    kind: 'ats',
    attribution: null,
    allowInAlerts: true,
    minHoursBetweenFetches,
    async run(ctx) {
      if (company.ats === 'smartrecruiters') return runSmartRecruiters(ctx, company, def, detailOnlyForTech);
      const url = fill(company.eu && def.euListUrl ? def.euListUrl : def.listUrl, { board: company.board });
      const res = await ctx.http.get(url, company.ats === 'teamtailor' ? 'application/rss+xml' : 'application/json');
      const data = company.ats === 'teamtailor' ? xml.parse(res.body) : parseJson(res.body, company.board);
      return MAPPERS[company.ats](data, company, def).filter((p) => p.title && p.url);
    },
  };
}

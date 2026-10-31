import { escapeRegExp, normalizeText } from './text.js';
import type { JobLocation, Region, RemoteScope } from './types.js';

export interface GeoData {
  ecuador: {
    provinces: { name: string; capital: string; cities: string[] }[];
    ambiguousCities: Record<string, string>;
  };
  countries: { iso: string; names: string[]; latam: boolean }[];
  remoteScopes: { worldwide: string[]; latam: string[]; americas: string[]; excludingLatam: string[] };
}

export interface LocationHints {
  /** País ya estructurado por la fuente (ISO alfa-2), si lo trae. */
  countryIso?: string | null;
  city?: string | null;
  /** Región de la empresa en el registro: ayuda a resolver «Cuenca». */
  companyRegion?: Region | null;
}

interface CityEntry { name: string; province: string; regex: RegExp; ambiguous: boolean }

export interface GeoResolver {
  parseLocation(texts: string[], hints?: LocationHints): JobLocation;
  detectRemoteScope(texts: string[], structuredCountries?: string[]): RemoteScope;
  isLatam(iso: string): boolean;
  countryName(iso: string): string;
  /** Acepta un código ISO alfa-2 o un nombre de país en español o inglés. */
  toIso(nameOrIso: string): string | null;
}

function wordRegex(term: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(normalizeText(term))}(?![a-z0-9])`);
}

export function createGeoResolver(geo: GeoData): GeoResolver {
  const cities: CityEntry[] = [];
  for (const p of geo.ecuador.provinces) {
    for (const c of new Set([p.capital, ...p.cities])) {
      cities.push({ name: c, province: p.name, regex: wordRegex(c), ambiguous: c in geo.ecuador.ambiguousCities });
    }
  }
  cities.sort((a, b) => b.name.length - a.name.length);
  const provinces = geo.ecuador.provinces.map((p) => ({ name: p.name, regex: wordRegex(p.name) }));
  const countries = geo.countries.map((c) => ({ ...c, regexes: c.names.map(wordRegex) }));
  const isoToCountry = new Map(geo.countries.map((c) => [c.iso, c] as const));
  const scopeRegex = (terms: string[]) => terms.map(wordRegex);
  const scopes = {
    worldwide: scopeRegex(geo.remoteScopes.worldwide),
    latam: scopeRegex(geo.remoteScopes.latam),
    americas: scopeRegex(geo.remoteScopes.americas),
    excludingLatam: scopeRegex(geo.remoteScopes.excludingLatam),
  };

  function countriesIn(text: string): string[] {
    const found: string[] = [];
    for (const c of countries) if (c.regexes.some((r) => r.test(text))) found.push(c.iso);
    return found;
  }

  function parseLocation(texts: string[], hints: LocationHints = {}): JobLocation {
    const raw = texts.filter(Boolean).join(' | ').slice(0, 300);
    const text = normalizeText(raw);
    const hintIso = hints.countryIso?.toUpperCase() ?? null;
    const mentioned = countriesIn(text);
    const mentionsEcuador = mentioned.includes('EC') || hintIso === 'EC';
    const foreignOnly = mentioned.length > 0 && !mentioned.includes('EC') && hintIso !== 'EC';
    const province = provinces.find((p) => p.regex.test(text))?.name ?? null;
    const candidates = [hints.city ? normalizeText(hints.city) : '', text];
    let city: CityEntry | undefined;
    for (const t of candidates) {
      if (!t) continue;
      city = cities.find((c) => c.regex.test(t));
      if (city) break;
    }
    if (city) {
      const contextOk = mentionsEcuador || province === city.province || (hints.companyRegion === 'EC' && !foreignOnly);
      if ((city.ambiguous && !contextOk) || (foreignOnly && !mentionsEcuador)) city = undefined;
    }
    if (city) return { city: city.name, province: city.province, country: 'EC', raw };
    if (province && !foreignOnly) return { city: null, province, country: 'EC', raw };
    if (mentionsEcuador) return { city: null, province: null, country: 'EC', raw };
    const country = hintIso ?? (mentioned.length === 1 ? mentioned[0]! : null);
    return { city: null, province: null, country, raw };
  }

  function detectRemoteScope(texts: string[], structuredCountries: string[] = []): RemoteScope {
    const text = normalizeText(texts.filter(Boolean).join(' | '));
    const listed = new Set<string>([...structuredCountries.map((c) => c.toUpperCase()), ...countriesIn(text)]);
    if (listed.has('EC')) return { type: 'countries', countries: [...listed].sort(), ecuadorEligible: true };
    if (scopes.worldwide.some((r) => r.test(text))) return { type: 'worldwide', countries: [], ecuadorEligible: true };
    if (scopes.latam.some((r) => r.test(text))) return { type: 'latam', countries: [...listed].sort(), ecuadorEligible: true };
    if (scopes.americas.some((r) => r.test(text))) return { type: 'americas', countries: [...listed].sort(), ecuadorEligible: true };
    if (listed.size > 0) {
      return { type: 'countries', countries: [...listed].sort(), ecuadorEligible: false };
    }
    if (scopes.excludingLatam.some((r) => r.test(text))) return { type: 'excluding-latam', countries: [], ecuadorEligible: false };
    return { type: 'unknown', countries: [], ecuadorEligible: null };
  }

  return {
    parseLocation,
    detectRemoteScope,
    isLatam: (iso) => isoToCountry.get(iso.toUpperCase())?.latam ?? false,
    toIso: (value) => {
      const v = value.trim();
      if (/^[a-z]{2}$/i.test(v)) return v.toUpperCase();
      const found = countriesIn(normalizeText(v));
      return found.length === 1 ? found[0]! : null;
    },
    countryName: (iso) => isoToCountry.get(iso.toUpperCase())?.names[0] ?? iso,
  };
}

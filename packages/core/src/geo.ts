import { normalizeText } from './text.js';
import type { JobLocation, Region, RegionCode, RemoteScope } from './types.js';

/** Fila compacta de GeoNames: nombre, nombre ASCII (vacío si es igual), país ISO, latitud, longitud, población. */
export type CityRow = [string, string, string, number, number, number];

export interface CountryName {
  iso: string;
  es: string;
  en: string;
}

export interface GeoData {
  ecuador: {
    provinces: { name: string; capital: string; cities: string[] }[];
    ambiguousCities: Record<string, string>;
  };
  countries: CountryName[];
  countryAliases: Record<string, string[]>;
  /** Nombres de país que también son otra cosa («Georgia» es un estado de EE. UU.): no se buscan en texto libre. */
  ambiguousCountryNames: string[];
  regions: Record<RegionCode, string[]>;
  remoteScopes: { worldwide: string[]; worldwideNotInTitle?: string[]; regions: Partial<Record<RegionCode, string[]>>; countryOnly: Record<string, string[]> };
  usStates: Record<string, string>;
  cities?: CityRow[];
}

export interface LocationHints {
  /** País ya estructurado por la fuente (ISO alfa-2), si lo trae. */
  countryIso?: string | null;
  city?: string | null;
  /** Región de la empresa en el registro: ayuda a resolver «Cuenca». */
  companyRegion?: Region | null;
}

export interface GeoResolver {
  parseLocation(texts: string[], hints?: LocationHints): JobLocation;
  detectRemoteScope(texts: string[], structuredCountries?: string[], title?: string): RemoteScope;
  isLatam(iso: string): boolean;
  countryName(iso: string): string;
  /** Acepta un código ISO alfa-2 o un nombre de país en español o inglés. */
  toIso(nameOrIso: string): string | null;
}

/** Clave comparable: sin tildes, minúsculas y solo letras y números separados por un espacio. */
export function placeKey(s: string): string {
  return normalizeText(s).replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Une los tres archivos de datos geográficos en la estructura que usan el resolvedor y el puntaje. */
export function buildGeoData(geo: Omit<GeoData, 'countries' | 'cities'>, countries: { countries: CountryName[] }, cities?: { cities: CityRow[] }): GeoData {
  return { ...geo, countries: countries.countries, cities: cities?.cities ?? [] };
}

/**
 * ¿Este remoto admite a alguien que vive en `country`? true / false, o null si la vacante no declara alcance
 * (o si no se conoce el país de la persona). Las regiones se resuelven con la tabla de pertenencia configurada.
 */
export function remoteEligibility(scope: RemoteScope | null, country: string | null, regions: Partial<Record<RegionCode, string[]>>): boolean | null {
  if (!scope || scope.type === 'unknown') return null;
  if (scope.type === 'worldwide') return true;
  if (!country) return null;
  return scope.countries.includes(country) || scope.regions.some((r) => regions[r]?.includes(country) ?? false);
}

const MAX_NGRAM = 6;

/** Busca nombres (de varias palabras) en un texto, de izquierda a derecha y prefiriendo el más largo. */
function findNames<T>(text: string, index: Map<string, T>): { value: T; at: number }[] {
  const tokens = placeKey(text).split(' ').filter(Boolean);
  const found: { value: T; at: number }[] = [];
  for (let i = 0; i < tokens.length; ) {
    let matched = 0;
    for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 1 && !matched; n--) {
      const value = index.get(tokens.slice(i, i + n).join(' '));
      if (value !== undefined) {
        found.push({ value, at: i });
        matched = n;
      }
    }
    i += matched || 1;
  }
  return found;
}

const phraseRegex = (phrases: string[]) => phrases.map((p) => new RegExp(`(?:^| )${placeKey(p)}(?: |$)`));

export function createGeoResolver(geo: GeoData): GeoResolver {
  // Ecuador conserva su detalle de provincias y cantones (INEC).
  interface EcCity { name: string; province: string; ambiguous: boolean }
  const ecCities = new Map<string, EcCity>();
  for (const p of geo.ecuador.provinces) {
    for (const c of new Set([p.capital, ...p.cities])) ecCities.set(placeKey(c), { name: c, province: p.name, ambiguous: c in geo.ecuador.ambiguousCities });
  }
  const ecProvinces = new Map(geo.ecuador.provinces.map((p) => [placeKey(p.name), p.name] as const));

  const ambiguous = new Set(geo.ambiguousCountryNames.map(placeKey));
  const byName = new Map<string, string>();
  const textIndex = new Map<string, string>();
  for (const c of geo.countries) {
    for (const name of [c.es, c.en, ...(geo.countryAliases[c.iso] ?? [])]) {
      const k = placeKey(name);
      if (!k) continue;
      byName.set(k, c.iso);
      if (!ambiguous.has(k)) textIndex.set(k, c.iso);
    }
  }
  const names = new Map(geo.countries.map((c) => [c.iso, c.es] as const));
  const latam = new Set(geo.regions.latam ?? []);

  const cityIndex = new Map<string, { name: string; country: string; population: number }[]>();
  // Las ciudades de Ecuador se resuelven con la lista del INEC y sus reglas de ambigüedad, no con GeoNames.
  for (const [name, ascii, country, , , population] of geo.cities ?? []) {
    if (country === 'EC') continue;
    for (const k of new Set([placeKey(name), ascii ? placeKey(ascii) : ''])) {
      if (!k) continue;
      const list = cityIndex.get(k) ?? [];
      list.push({ name, country, population });
      cityIndex.set(k, list);
    }
  }
  const stateNames = new Map(Object.values(geo.usStates).map((n) => [placeKey(n), 'US'] as const));
  const stateCodes = new Set(Object.keys(geo.usStates));
  const worldwide = phraseRegex(geo.remoteScopes.worldwide);
  const notInTitle = new Set(geo.remoteScopes.worldwideNotInTitle ?? []);
  const worldwideInTitle = phraseRegex(geo.remoteScopes.worldwide.filter((p) => !notInTitle.has(p)));
  const regionPhrases = Object.entries(geo.remoteScopes.regions).map(([region, phrases]) => ({ region: region as RegionCode, res: phraseRegex(phrases ?? []) }));
  const countryOnly = Object.entries(geo.remoteScopes.countryOnly).map(([iso, phrases]) => ({ iso, res: phraseRegex(phrases) }));

  const countriesIn = (text: string) => [...new Set(findNames(text, textIndex).map((f) => f.value))];

  /** Ciudad más poblada con ese nombre (dentro del país dado, si se conoce). */
  function cityIn(text: string, country: string | null): { name: string; country: string } | null {
    for (const { value } of findNames(text, cityIndex)) {
      const options = value.filter((c) => country === null || c.country === country).sort((a, b) => b.population - a.population);
      if (options[0]) return options[0];
    }
    return null;
  }

  function parseEcuador(text: string, hintIso: string | null, mentioned: string[], hints: LocationHints, hintCity: string): JobLocation | null {
    const mentionsEcuador = mentioned.includes('EC') || hintIso === 'EC';
    const foreignOnly = (mentioned.length > 0 && !mentionsEcuador) || (hintIso !== null && hintIso !== 'EC');
    const province = findNames(text, ecProvinces)[0]?.value ?? null;
    const city = findNames(hintCity, ecCities)[0]?.value ?? findNames(text, ecCities)[0]?.value;
    if (city) {
      const contextOk = mentionsEcuador || province === city.province || (hints.companyRegion === 'EC' && !foreignOnly);
      if (!(city.ambiguous && !contextOk) && !foreignOnly) return { city: city.name, province: city.province, country: 'EC', raw: '' };
    }
    if (province && !foreignOnly) return { city: null, province, country: 'EC', raw: '' };
    if (mentionsEcuador) return { city: null, province: null, country: 'EC', raw: '' };
    return null;
  }

  function parseLocation(texts: string[], hints: LocationHints = {}): JobLocation {
    const raw = texts.filter(Boolean).join(' | ').slice(0, 300);
    const hintIso = hints.countryIso ? (toIso(hints.countryIso) ?? null) : null;
    const hintCity = hints.city ?? '';
    const mentioned = countriesIn(raw);
    const ec = parseEcuador(raw, hintIso, mentioned, hints, hintCity);
    if (ec) return { ...ec, raw };

    let country = hintIso ?? mentioned[0] ?? null;
    if (!country) {
      const state = /,\s*([A-Z]{2})\b/.exec(raw)?.[1];
      if ((state && stateCodes.has(state)) || findNames(raw, stateNames).length > 0) country = 'US';
    }
    const city = cityIn(`${hintCity} | ${raw}`, country);
    if (!country && city) country = city.country;
    return { city: city && city.country === country ? city.name : hintCity && country ? hintCity : null, province: null, country, raw };
  }

  function restrictionIn(text: string): RemoteScope | null {
    const regions = regionPhrases.filter((p) => p.res.some((r) => r.test(text))).map((p) => p.region).sort();
    const countries = [...new Set([...countriesIn(text), ...countryOnly.filter((c) => c.res.some((r) => r.test(text))).map((c) => c.iso)])].sort();
    if (regions.length > 0) return { type: 'regions', regions, countries };
    if (countries.length > 0) return { type: 'countries', regions: [], countries };
    return null;
  }

  /**
   * Orden de confianza: países estructurados de la fuente, restricción en el título, ubicación y, por último, un «worldwide»
   * en el título. El título manda sobre la ubicación porque los portales ponen etiquetas genéricas («Anywhere in the World»)
   * a vacantes que dicen «United States» o «Remote in Europe». «Global» en un título no es alcance («Global Payments»).
   */
  function detectRemoteScope(texts: string[], structuredCountries: string[] = [], title = ''): RemoteScope {
    const structured = [...new Set(structuredCountries.map((c) => toIso(c)).filter((c): c is string => c !== null))].sort();
    if (structured.length > 0) return { type: 'countries', regions: [], countries: structured };
    const inTitle = placeKey(title);
    const fromTitle = restrictionIn(inTitle);
    if (fromTitle) return fromTitle;
    const text = placeKey(texts.filter(Boolean).join(' | '));
    if (worldwide.some((r) => r.test(text))) return { type: 'worldwide', regions: [], countries: [] };
    const fromLocation = restrictionIn(text);
    if (fromLocation) return fromLocation;
    if (worldwideInTitle.some((r) => r.test(inTitle))) return { type: 'worldwide', regions: [], countries: [] };
    return { type: 'unknown', regions: [], countries: [] };
  }

  function toIso(value: string): string | null {
    const v = value.trim();
    if (/^[a-z]{2}$/i.test(v)) return names.has(v.toUpperCase()) ? v.toUpperCase() : null;
    const exact = byName.get(placeKey(v));
    if (exact) return exact;
    const found = countriesIn(v);
    return found.length === 1 ? found[0]! : null;
  }

  return {
    parseLocation,
    detectRemoteScope,
    isLatam: (iso) => latam.has(iso.toUpperCase()),
    toIso,
    countryName: (iso) => names.get(iso.toUpperCase()) ?? iso,
  };
}

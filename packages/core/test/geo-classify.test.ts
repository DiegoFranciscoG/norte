import { describe, expect, it } from 'vitest';
import { cefrRank, createJobClassifier } from '../src/classify.js';
import { createGeoResolver, remoteEligibility } from '../src/geo.js';
import { groupFor, isPlaceable } from '../src/groups.js';
import { classification, geoData } from './fixtures.js';

const geo = createGeoResolver(geoData);
const cls = createJobClassifier(classification);
const cuenca = { city: 'Cuenca', country: 'EC' };
const madrid = { city: 'Madrid', country: 'ES' };
const regions = geoData.regions;

describe('location parsing', () => {
  it('resolves Ecuadorian cities with their province', () => {
    expect(geo.parseLocation(['Quito, Pichincha, Ecuador'])).toMatchObject({ city: 'Quito', province: 'Pichincha', country: 'EC' });
    expect(geo.parseLocation(['Guayaquil'])).toMatchObject({ city: 'Guayaquil', country: 'EC' });
    expect(geo.parseLocation(['Samborondón, Ecuador'])).toMatchObject({ city: 'Samborondón', province: 'Guayas' });
  });

  it('does not confuse Cuenca (Spain) with Cuenca (Ecuador)', () => {
    expect(geo.parseLocation(['Cuenca, España'])).toMatchObject({ city: null, country: 'ES' });
    expect(geo.parseLocation(['Cuenca'])).toMatchObject({ city: null });
    expect(geo.parseLocation(['Cuenca'], { companyRegion: 'EC' })).toMatchObject({ city: 'Cuenca', province: 'Azuay', country: 'EC' });
    expect(geo.parseLocation(['Cuenca, Azuay'])).toMatchObject({ city: 'Cuenca', country: 'EC' });
    expect(geo.parseLocation(['Cuenca, Ecuador (remote)'])).toMatchObject({ city: 'Cuenca', country: 'EC' });
  });

  it('uses structured hints and falls back to a single mentioned country', () => {
    expect(geo.parseLocation([''], { countryIso: 'ec', city: 'Loja' })).toMatchObject({ city: 'Loja', country: 'EC' });
    expect(geo.parseLocation(['Bogotá, Colombia'])).toMatchObject({ city: 'Bogotá', country: 'CO' });
    expect(geo.parseLocation(['Pichincha'])).toMatchObject({ province: 'Pichincha', country: 'EC' });
    expect(geo.toIso('Ecuador')).toBe('EC');
    expect(geo.toIso('br')).toBe('BR');
    expect(geo.toIso('Atlantis')).toBeNull();
    expect(geo.isLatam('EC')).toBe(true);
    expect(geo.isLatam('US')).toBe(false);
    expect(geo.countryName('EC')).toBe('Ecuador');
    expect(geo.toIso('Alemania')).toBe('DE');
    expect(geo.toIso('Georgia')).toBe('GE');
  });

  it('resolves cities and countries anywhere in the world', () => {
    expect(geo.parseLocation(['Berlin, Germany'])).toMatchObject({ city: 'Berlin', country: 'DE' });
    expect(geo.parseLocation(['Berlin'])).toMatchObject({ city: 'Berlin', country: 'DE' });
    expect(geo.parseLocation(['San Francisco, CA'])).toMatchObject({ city: 'San Francisco', country: 'US' });
    expect(geo.parseLocation(['Austin, Texas'])).toMatchObject({ city: 'Austin', country: 'US' });
    expect(geo.parseLocation(['Toronto, ON'])).toMatchObject({ city: 'Toronto', country: 'CA' });
    expect(geo.parseLocation(['London'])).toMatchObject({ country: 'GB' });
    expect(geo.parseLocation(['San José, Costa Rica'])).toMatchObject({ country: 'CR' });
    expect(geo.parseLocation(['Multiple locations'])).toMatchObject({ city: null, country: null });
  });

  it('detects the geographic scope of remote jobs as regions and countries', () => {
    expect(geo.detectRemoteScope(['Anywhere in the World'])).toEqual({ type: 'worldwide', regions: [], countries: [] });
    expect(geo.detectRemoteScope(['Remote - LATAM'])).toEqual({ type: 'regions', regions: ['latam'], countries: [] });
    expect(geo.detectRemoteScope(['Home Based - Americas'])).toEqual({ type: 'regions', regions: ['americas'], countries: [] });
    expect(geo.detectRemoteScope(['USA Only'])).toEqual({ type: 'countries', regions: [], countries: ['US'] });
    expect(geo.detectRemoteScope(['Remote (Europe)'])).toEqual({ type: 'regions', regions: ['europe'], countries: [] });
    expect(geo.detectRemoteScope(['Remote'], ['CO', 'Peru'])).toEqual({ type: 'countries', regions: [], countries: ['CO', 'PE'] });
    expect(geo.detectRemoteScope(['Remote'])).toEqual({ type: 'unknown', regions: [], countries: [] });
  });

  it('lets the title rule over a generic location tag, but never over structured countries', () => {
    const world = ['Anywhere in the World'];
    const unitedStates = { type: 'countries', regions: [], countries: ['US'] };
    const worldwide = { type: 'worldwide', regions: [], countries: [] };
    expect(geo.detectRemoteScope(world, [], 'Remote AI Training - $20/hr - United States')).toEqual(unitedStates);
    expect(geo.detectRemoteScope(world, [], 'Web Developer: WordPress (U.S. Based, Remote Contractor)')).toEqual(unitedStates);
    expect(geo.detectRemoteScope(world, [], 'Head of Design (Remote in Europe)')).toEqual({ type: 'regions', regions: ['europe'], countries: [] });
    expect(geo.detectRemoteScope(['Remote, Global'], [], 'Platform Security Engineer (AMER/APAC)')).toEqual({ type: 'regions', regions: ['americas', 'apac'], countries: [] });
    expect(geo.detectRemoteScope(world, [], 'Backend Engineer')).toEqual(worldwide);
    expect(geo.detectRemoteScope(['Remote'], [], 'Backend Engineer (Worldwide)')).toEqual(worldwide);
    expect(geo.detectRemoteScope(world, ['CO'], 'Backend Engineer - United States')).toEqual({ type: 'countries', regions: [], countries: ['CO'] });
  });

  it('does not read «global» in a title as a remote scope', () => {
    expect(geo.detectRemoteScope(['Remote'], [], 'DevOps Engineer - Global Strategy Consultancy')).toEqual({ type: 'unknown', regions: [], countries: [] });
    expect(geo.detectRemoteScope(['LatAm'], [], 'DevOps Engineer - Global Payments')).toEqual({ type: 'regions', regions: ['latam'], countries: [] });
    expect(geo.detectRemoteScope(['Remote, Global'], [], 'DevOps Engineer')).toEqual({ type: 'worldwide', regions: [], countries: [] });
  });

  it("decides remote eligibility for the person's country", () => {
    const latam = geo.detectRemoteScope(['LATAM']);
    const europe = geo.detectRemoteScope(['Europe']);
    expect(remoteEligibility(latam, 'EC', regions)).toBe(true);
    expect(remoteEligibility(europe, 'EC', regions)).toBe(false);
    expect(remoteEligibility(europe, 'ES', regions)).toBe(true);
    expect(remoteEligibility(geo.detectRemoteScope(['USA Only']), 'MX', regions)).toBe(false);
    expect(remoteEligibility(geo.detectRemoteScope(['Worldwide']), null, regions)).toBe(true);
    expect(remoteEligibility(geo.detectRemoteScope(['Remote']), 'EC', regions)).toBeNull();
    expect(remoteEligibility(latam, null, regions)).toBeNull();
  });
});

describe('job classification', () => {
  it('reads modality from structure first, then text', () => {
    expect(cls.modality('remote', ['Presencial en Quito'])).toBe('remote');
    expect(cls.modality(null, ['Hybrid in Quito - Developer'])).toBe('hybrid');
    expect(cls.modality(null, ['Trabajo 100% remoto'])).toBe('remote');
    expect(cls.modality(null, ['Presencial, Guayaquil'])).toBe('onsite');
    expect(cls.modality(null, ['Quito'])).toBe('unknown');
  });

  it('detects employment type', () => {
    expect(cls.employmentType('Full-time', [])).toBe('full-time');
    expect(cls.employmentType(null, ['Freelance - Senior Data Engineer'])).toBe('freelance');
    expect(cls.employmentType('contractor', [])).toBe('contract');
    expect(cls.employmentType(null, ['Pasante de Cloud'])).toBe('internship');
    expect(cls.employmentType(null, ['Backend Engineer'])).toBe('unknown');
  });

  it('detects seniority from the title or structured level', () => {
    expect(cls.seniority('Sr. Backend Engineer', [])).toBe('senior');
    expect(cls.seniority('Desarrollador Java', ['Mid-Senior level'])).toBe('senior');
    expect(cls.seniority('Ssr Developer', [])).toBe('mid');
    expect(cls.seniority('Tech Lead', [])).toBe('lead');
    expect(cls.seniority('Junior QA', [])).toBe('junior');
    expect(cls.seniority('Pasante Automatización', [])).toBe('intern');
    expect(cls.seniority('Developer', [])).toBe('unknown');
  });

  it('extracts years of experience and ignores company boasting', () => {
    expect(cls.yearsRequired('Requisitos: 5+ years of experience with Java')).toBe(5);
    expect(cls.yearsRequired('Al menos 3 años de experiencia en desarrollo y 2 años con AWS')).toBe(3);
    expect(cls.yearsRequired('Experiencia de 3-5 años')).toBe(3);
    expect(cls.yearsRequired('Contamos con 20 años de experiencia en el mercado')).toBeNull();
    expect(cls.yearsRequired('Sin requisitos')).toBeNull();
  });

  it('extracts the English level, inferring it only for English postings', () => {
    expect(cls.languages('Inglés avanzado (C1) indispensable', 'es')).toEqual([{ language: 'en', level: 'C1', inferred: false }]);
    expect(cls.languages('Intermediate English', 'en')).toEqual([{ language: 'en', level: 'B1', inferred: false }]);
    expect(cls.languages('We build software', 'en')).toEqual([{ language: 'en', level: 'B2', inferred: true }]);
    expect(cls.languages('Buscamos desarrollador', 'es')).toEqual([]);
    expect(cls.languages('Português fluente', 'es')[0]).toMatchObject({ language: 'pt', level: 'C1' });
    expect(cefrRank('C2')).toBe(6);
  });

  it('keeps technology roles and drops sales or recruiting roles', () => {
    expect(cls.isTechTitle('Desarrollador Backend Java')).toBe(true);
    expect(cls.isTechTitle('Senior Data Engineer')).toBe(true);
    expect(cls.isTechTitle('Ejecutivo de Ventas')).toBe(false);
    expect(cls.isTechTitle('IT Recruiter')).toBe(false);
    expect(cls.isTechTitle('Salesforce Developer')).toBe(true);
  });
});

describe('groups relative to each person', () => {
  const loc = (city: string | null, country: string | null) => ({ city, province: null, country, raw: '' });
  const scope = (text: string) => geo.detectRemoteScope([text]);
  type Scope = ReturnType<typeof scope>;
  const job = (modality: 'onsite' | 'hybrid' | 'remote', location: ReturnType<typeof loc>, remoteScope: Scope | null = null, employmentType: 'full-time' | 'freelance' = 'full-time') => ({ modality, location, remoteScope, employmentType });

  it('assigns near, country, remote and freelance from where the person lives', () => {
    expect(groupFor(job('hybrid', loc('Cuenca', 'EC')), cuenca, regions)).toBe('near');
    expect(groupFor(job('onsite', loc('Quito', 'EC')), cuenca, regions)).toBe('country');
    expect(groupFor(job('remote', loc(null, null), scope('LATAM')), cuenca, regions)).toBe('remote');
    expect(groupFor(job('remote', loc(null, null), scope('Worldwide'), 'freelance'), cuenca, regions)).toBe('freelance');
    expect(groupFor(job('onsite', loc('Madrid', 'ES')), madrid, regions)).toBe('near');
    expect(groupFor(job('remote', loc(null, null), scope('Europe')), madrid, regions)).toBe('remote');
  });

  it('leaves out what the person cannot take', () => {
    expect(groupFor(job('remote', loc(null, 'US'), scope('USA Only')), cuenca, regions)).toBeNull();
    expect(groupFor(job('remote', loc(null, null), scope('Europe')), cuenca, regions)).toBeNull();
    expect(groupFor(job('onsite', loc(null, 'CO')), cuenca, regions)).toBeNull();
    expect(groupFor(job('onsite', loc(null, 'MX'), null, 'freelance'), cuenca, regions)).toBeNull();
  });

  it('without a known country shows everything instead of an empty list', () => {
    expect(groupFor(job('onsite', loc('Lima', 'PE')), { country: null, city: null }, regions)).toBe('country');
    expect(groupFor(job('remote', loc(null, null), scope('Remote')), { country: null, city: null }, regions)).toBe('remote');
  });

  it('keeps in the index only jobs that can be placed', () => {
    expect(isPlaceable({ modality: 'onsite', location: loc(null, null) })).toBe(false);
    expect(isPlaceable({ modality: 'remote', location: loc(null, null) })).toBe(true);
    expect(isPlaceable({ modality: 'hybrid', location: loc(null, 'DE') })).toBe(true);
  });
});

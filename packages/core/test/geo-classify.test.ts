import { describe, expect, it } from 'vitest';
import { cefrRank, createJobClassifier } from '../src/classify.js';
import { createGeoResolver } from '../src/geo.js';
import { classifyGroup } from '../src/groups.js';
import { classification, geoData } from './fixtures.js';

const geo = createGeoResolver(geoData);
const cls = createJobClassifier(classification);
const home = { city: 'Cuenca', country: 'EC' };

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
    expect(geo.parseLocation(['Bogotá, Colombia'])).toMatchObject({ city: null, country: 'CO' });
    expect(geo.parseLocation(['Pichincha'])).toMatchObject({ province: 'Pichincha', country: 'EC' });
    expect(geo.toIso('Ecuador')).toBe('EC');
    expect(geo.toIso('br')).toBe('BR');
    expect(geo.toIso('Atlantis')).toBeNull();
    expect(geo.isLatam('EC')).toBe(true);
    expect(geo.isLatam('US')).toBe(false);
    expect(geo.countryName('EC')).toBe('ecuador');
  });

  it('detects the geographic scope of remote jobs', () => {
    expect(geo.detectRemoteScope(['Anywhere in the World'])).toMatchObject({ type: 'worldwide', ecuadorEligible: true });
    expect(geo.detectRemoteScope(['Remote - LATAM'])).toMatchObject({ type: 'latam', ecuadorEligible: true });
    expect(geo.detectRemoteScope(['Home Based - Americas'])).toMatchObject({ type: 'americas', ecuadorEligible: true });
    expect(geo.detectRemoteScope(['USA Only'])).toMatchObject({ ecuadorEligible: false });
    expect(geo.detectRemoteScope(['Remote (Europe)'])).toMatchObject({ type: 'excluding-latam', ecuadorEligible: false });
    expect(geo.detectRemoteScope(['Remote'], ['CO', 'PE'])).toMatchObject({ type: 'countries', ecuadorEligible: false });
    expect(geo.detectRemoteScope(['Remote'], ['EC', 'CO'])).toMatchObject({ type: 'countries', ecuadorEligible: true });
    expect(geo.detectRemoteScope(['Remote'])).toMatchObject({ type: 'unknown', ecuadorEligible: null });
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

describe('groups', () => {
  const loc = (city: string | null, country: string | null) => ({ city, province: null, country, raw: '' });
  it('assigns the four groups relative to the home city', () => {
    expect(classifyGroup({ modality: 'hybrid', location: loc('Cuenca', 'EC'), remoteScope: null, employmentType: 'full-time' }, home)).toBe('home');
    expect(classifyGroup({ modality: 'onsite', location: loc('Quito', 'EC'), remoteScope: null, employmentType: 'full-time' }, home)).toBe('ecuador');
    expect(classifyGroup({ modality: 'remote', location: loc(null, null), remoteScope: { type: 'latam', countries: [], ecuadorEligible: true }, employmentType: 'full-time' }, home)).toBe('remote');
    expect(classifyGroup({ modality: 'remote', location: loc(null, null), remoteScope: { type: 'worldwide', countries: [], ecuadorEligible: true }, employmentType: 'freelance' }, home)).toBe('freelance');
  });

  it('drops jobs nobody in Ecuador can take', () => {
    expect(classifyGroup({ modality: 'remote', location: loc(null, 'US'), remoteScope: { type: 'countries', countries: ['US'], ecuadorEligible: false }, employmentType: 'full-time' }, home)).toBeNull();
    expect(classifyGroup({ modality: 'onsite', location: loc(null, 'CO'), remoteScope: null, employmentType: 'full-time' }, home)).toBeNull();
    expect(classifyGroup({ modality: 'onsite', location: loc(null, 'MX'), remoteScope: null, employmentType: 'freelance' }, home)).toBeNull();
  });
});

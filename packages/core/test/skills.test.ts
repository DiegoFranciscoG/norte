import { describe, expect, it } from 'vitest';
import { aliasKey, createSkillMatcher } from '../src/skills.js';
import { extraction, miniCatalog } from './fixtures.js';

const matcher = createSkillMatcher(miniCatalog, extraction);
const ids = (text: string, optional?: string) => matcher.extract(text, optional).map((m) => m.id);

describe('skill extraction', () => {
  it('recognizes every spelling of Spring Boot', () => {
    for (const variant of ['Spring Boot', 'SpringBoot', 'spring-boot', 'SPRING BOOT', 'spring.boot']) {
      expect(ids(`Experiencia con ${variant}`), variant).toContain('spring-boot');
    }
  });

  it('keeps symbol-heavy skills intact and does not confuse them', () => {
    expect(ids('Dominio de C# y .NET Core, ASP.NET')).toEqual(['csharp', 'dotnet']);
    expect(ids('Desarrollo con Node.js y React Native')).toEqual(['nodejs', 'react-native']);
    expect(ids('El salario neto es competitivo')).toEqual([]);
  });

  it('respects word boundaries', () => {
    expect(ids('Usamos JavaScript')).toEqual(['javascript']);
    expect(ids('Javanese culture')).toEqual([]);
  });

  it('resolves BDD by context: testing vs base de datos', () => {
    expect(ids('Escribir escenarios BDD con Cucumber y Gherkin')).toContain('bdd');
    expect(ids('Escribir escenarios BDD con Cucumber y Gherkin')).not.toContain('databases');
    expect(ids('Administrar la BDD Oracle y optimizar consultas SQL')).toContain('databases');
    expect(ids('Administrar la BDD Oracle y optimizar consultas SQL')).not.toContain('bdd');
  });

  it('only accepts the case-sensitive "Go" with a programming context', () => {
    expect(ids('Backend developer en Go y Kubernetes')).toContain('go');
    expect(ids('Ready to go the extra mile')).not.toContain('go');
    expect(ids('Microservicios en golang')).toContain('go');
  });

  it('marks skills under a "nice to have" section or with a marker as optional', () => {
    const text = 'Requisitos:\n- Java\n- PostgreSQL\nDeseable:\n- Kubernetes\nTambién React (es un plus)';
    const res = matcher.extract(text);
    const byId = Object.fromEntries(res.map((r) => [r.id, r.optional]));
    expect(byId).toEqual({ java: false, postgresql: false, kubernetes: true, react: true });
  });

  it('treats a skill as required when it appears both as required and optional', () => {
    const res = matcher.extract('Requisitos:\nJava\nNice to have:\nJava 21, Kubernetes');
    expect(res.find((r) => r.id === 'java')?.optional).toBe(false);
  });

  it('accepts a whole optional text block', () => {
    const res = matcher.extract('Java', 'Kubernetes y Testcontainers');
    expect(res.filter((r) => r.optional).map((r) => r.id)).toEqual(['kubernetes', 'testcontainers']);
  });

  it('recovers typos with bounded fuzzy matching and flags them', () => {
    const res = matcher.extract('Experiencia en kubernets y testcontainres');
    expect(res.map((r) => [r.id, r.fuzzy])).toEqual([['kubernetes', true], ['testcontainers', true]]);
  });

  it('expands implied skills only on demand', () => {
    expect([...matcher.expandImplied(['spring-boot'])].sort()).toEqual(['java', 'spring', 'spring-boot']);
    expect(matcher.byId('java')?.name).toBe('Java');
  });

  it('builds canonical alias keys', () => {
    expect(aliasKey('Node.js')).toBe('nodejs');
    expect(aliasKey('.NET')).toBe('.net');
    expect(aliasKey('CI/CD')).toBe('cicd');
  });

  it('handles empty input and an empty catalog without hanging', () => {
    expect(ids('')).toEqual([]);
    const empty = createSkillMatcher({ version: '0', skills: [] }, extraction);
    expect(empty.extract('Java y Spring')).toEqual([]);
  });
});

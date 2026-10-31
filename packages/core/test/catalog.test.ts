import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aliasKey, createSkillMatcher } from '../src/skills.js';
import type { SkillCatalog } from '../src/types.js';
import { extraction } from './fixtures.js';

const catalog = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../data/skills/catalog.json'), 'utf8')) as SkillCatalog;
const matcher = createSkillMatcher(catalog, extraction);
const ids = (text: string) => matcher.extract(text).map((s) => s.id);

/** Alias compartidos a propósito por dos habilidades. */
const SHARED_ALIASES = new Set(['cc++']);

describe('catálogo de habilidades (diccionario de sinónimos)', () => {
  it('tiene al menos 300 habilidades con ids únicos y referencias válidas', () => {
    expect(catalog.skills.length).toBeGreaterThanOrEqual(300);
    const all = new Set(catalog.skills.map((s) => s.id));
    expect(all.size).toBe(catalog.skills.length);
    for (const s of catalog.skills) {
      for (const ref of [...(s.implies ?? []), ...(s.related ?? [])]) expect(all.has(ref), `${s.id} → ${ref}`).toBe(true);
    }
  });

  it('no repite alias entre habilidades distintas salvo los compartidos a propósito', () => {
    const owner = new Map<string, string>();
    const dupes: string[] = [];
    for (const s of catalog.skills) {
      for (const a of new Set([s.name, ...s.aliases].map(aliasKey))) {
        const prev = owner.get(a);
        if (prev && prev !== s.id && !SHARED_ALIASES.has(a)) dupes.push(`${a}: ${prev} / ${s.id}`);
        owner.set(a, s.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('reconoce sinónimos en español e inglés', () => {
    expect(ids('Experiencia en integración continua y pruebas unitarias')).toEqual(['cicd', 'unit-testing']);
    expect(ids('Conocimientos de aprendizaje automático y ciencia de datos')).toEqual(['data-science', 'machine-learning']);
    expect(ids('Manejo de Spring-Boot, microservicios y bases de datos relacionales')).toEqual(['databases', 'microservices', 'spring-boot']);
    expect(ids('C#/.NET y SQL Server')).toEqual(['csharp', 'dotnet', 'sql-server']);
    expect(ids('React Native, Node.js y AWS Lambda')).toEqual(['aws-lambda', 'nodejs', 'react-native']);
  });

  it('desambigua términos comunes por contexto', () => {
    expect(ids('You will excel at communication and have a safe space to rest')).toEqual([]);
    expect(ids('Manejo de Excel avanzado con tablas dinámicas')).toContain('excel');
    expect(ids('Desarrollo de APIs REST con Node y Express')).toEqual(['express', 'nodejs', 'rest-api']);
    expect(ids('Spark interest in our community')).toEqual([]);
    expect(ids('Procesamiento con Spark y Databricks')).toEqual(['databricks', 'spark']);
    expect(ids('Programación en R con tidyverse y ggplot2')).toEqual(['r-lang']);
    expect(ids('Iniciativa ágil y proactiva')).toEqual([]);
    expect(ids('Configuración de redes LAN, firewall y VPN con Cisco')).toEqual(['networking']);
    expect(ids('Gestión de redes sociales y contenidos')).toEqual([]);
    expect(ids('Trabajo bi-weekly con el cliente')).toEqual([]);
    expect(ids('Reportes BI en Power BI y Tableau')).toEqual(['business-intelligence', 'power-bi', 'tableau']);
    expect(ids('Marco SAFe con PI Planning')).toEqual(['safe']);
  });
});

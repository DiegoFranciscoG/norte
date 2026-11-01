import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClassificationConfig } from '../src/classify.js';
import { buildGeoData } from '../src/geo.js';
import type { ExtractionConfig } from '../src/skills.js';
import type { SkillCatalog } from '../src/types.js';

const dataDir = resolve(import.meta.dirname, '../../../data');
const read = <T>(...p: string[]): T => JSON.parse(readFileSync(resolve(dataDir, ...p), 'utf8')) as T;

export const geoData = buildGeoData(read('geo', 'geo.json'), read('geo', 'countries.json'), read('geo', 'cities.json'));
export const extraction = read<ExtractionConfig>('skills', 'extraction.json');
export const classification = read<{ classification: ClassificationConfig }>('config', 'ingest.json').classification;

/** Catálogo mínimo e independiente del catálogo real para probar el motor de extracción. */
export const miniCatalog: SkillCatalog = {
  version: 'test',
  skills: [
    { id: 'java', name: 'Java', category: 'language', aliases: ['java se', 'jdk'] },
    { id: 'javascript', name: 'JavaScript', category: 'language', aliases: ['js', 'ecmascript'] },
    { id: 'spring-boot', name: 'Spring Boot', category: 'backend', aliases: ['springboot', 'spring-boot'], implies: ['java', 'spring'] },
    { id: 'spring', name: 'Spring Framework', category: 'backend', aliases: ['spring'], implies: ['java'] },
    { id: 'kubernetes', name: 'Kubernetes', category: 'devops', aliases: ['k8s'] },
    { id: 'csharp', name: 'C#', category: 'language', aliases: ['c sharp'] },
    { id: 'dotnet', name: '.NET', category: 'backend', aliases: ['dotnet', 'asp.net', '.net core'] },
    { id: 'nodejs', name: 'Node.js', category: 'backend', aliases: ['node', 'nodejs'] },
    { id: 'react', name: 'React', category: 'frontend', aliases: ['reactjs', 'react.js'] },
    { id: 'react-native', name: 'React Native', category: 'mobile', aliases: [] },
    { id: 'postgresql', name: 'PostgreSQL', category: 'database', aliases: ['postgres', 'psql'] },
    { id: 'testcontainers', name: 'Testcontainers', category: 'testing', aliases: [] },
    { id: 'bdd', name: 'BDD', category: 'methodology', aliases: ['behaviour driven development', 'behavior driven development'],
      contextAliases: [{ alias: 'bdd', anyOf: ['cucumber', 'gherkin', 'tdd', 'pruebas', 'testing', 'escenarios'] }] },
    { id: 'databases', name: 'Bases de datos', category: 'database', aliases: ['base de datos', 'bases de datos', 'database', 'databases', 'bbdd'],
      contextAliases: [{ alias: 'bdd', anyOf: ['sql', 'tablas', 'consultas', 'oracle', 'modelado', 'datos'] }] },
    { id: 'go', name: 'Go', category: 'language', aliases: ['golang'],
      contextAliases: [{ alias: 'Go', caseSensitive: true, anyOf: ['backend', 'microservic', 'developer', 'desarrollador', 'engineer', 'lenguaje'] }] },
  ],
};

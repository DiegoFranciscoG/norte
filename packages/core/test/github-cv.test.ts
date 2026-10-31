import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createJobClassifier } from '../src/classify.js';
import { analyzeCv, estimateExperience } from '../src/cv.js';
import { aggregateDemonstrated, createRepoAnalyzer, parseGradle, parsePackageJson, parsePom, parsePythonDeps, type DependencyRules } from '../src/github.js';
import { createSkillMatcher } from '../src/skills.js';
import type { SkillCatalog } from '../src/types.js';
import { classification, extraction } from './fixtures.js';

const data = (p: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../data', p), 'utf8'));
const catalog = data('skills/catalog.json') as SkillCatalog;
const rules = data('skills/dependencies.json') as DependencyRules;
const matcher = createSkillMatcher(catalog, extraction);
const analyzer = createRepoAnalyzer(rules, matcher);

const POM = `<project><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId></parent>
<dependencies>
  <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
  <!-- <dependency><groupId>org.mongodb</groupId><artifactId>x</artifactId></dependency> -->
  <dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId></dependency>
  <dependency><groupId>org.flywaydb</groupId><artifactId>flyway-database-postgresql</artifactId></dependency>
  <dependency><groupId>org.testcontainers</groupId><artifactId>postgresql</artifactId><scope>test</scope></dependency>
</dependencies></project>`;

describe('parsers de manifiestos', () => {
  it('lee pom.xml ignorando comentarios', () => {
    expect(parsePom(POM)).toEqual([
      'org.springframework.boot:spring-boot-starter-parent',
      'org.springframework.boot:spring-boot-starter-data-jpa',
      'org.postgresql:postgresql',
      'org.flywaydb:flyway-database-postgresql',
      'org.testcontainers:postgresql',
    ]);
  });

  it('lee build.gradle(.kts), package.json y dependencias Python', () => {
    const g = parseGradle(`plugins { id("org.springframework.boot") version "4.1.2"; kotlin("jvm") }\ndependencies { implementation("org.springframework.boot:spring-boot-starter-web"); testImplementation 'org.mockito:mockito-core:5.0' }`);
    expect(g.coordinates).toEqual(['org.springframework.boot:spring-boot-starter-web', 'org.mockito:mockito-core']);
    expect(g.plugins).toEqual(['org.springframework.boot', 'kotlin-jvm']);
    expect(parsePackageJson('{"dependencies":{"@angular/core":"22"},"devDependencies":{"vitest":"5"}}')).toEqual(['@angular/core', 'vitest']);
    expect(parsePackageJson('no json')).toEqual([]);
    expect(parsePythonDeps('# comment\nDjango==5.0\nuvicorn[standard]>=0.30\n-r base.txt\npsycopg2_binary', 'requirements.txt')).toEqual(['django', 'uvicorn', 'psycopg2-binary']);
    expect(parsePythonDeps('[project]\ndependencies = ["fastapi>=0.110", "sqlalchemy[asyncio]"]\n[tool.poetry.dependencies]\npython = "^3.12"\npandas = "^2"', 'pyproject.toml')).toEqual(expect.arrayContaining(['fastapi', 'sqlalchemy', 'pandas']));
  });
});

describe('análisis de repositorios de GitHub', () => {
  const tree = [
    'pom.xml', 'Dockerfile', 'docker-compose.yml', '.github/workflows/ci.yml',
    'src/main/java/ec/App.java', 'src/main/java/ec/Service.java', 'src/test/java/ec/AppTest.java', 'src/test/java/ec/RepoIT.java',
    'src/main/resources/db/migration/V1__init.sql', 'node_modules/x/index.js', 'frontend/package.json',
  ];

  it('elige solo los manifiestos útiles y fuera de carpetas generadas', () => {
    expect(analyzer.manifestPaths(tree)).toEqual(['pom.xml', 'frontend/package.json']);
  });

  it('obtiene habilidades demostradas con su evidencia y las señales de calidad', () => {
    const res = analyzer.analyze({ name: 'banca-microservicios', url: 'https://github.com/u/banca-microservicios', pushedAt: '2026-10-01T00:00:00Z', tree, manifests: { 'pom.xml': POM, 'frontend/package.json': '{"dependencies":{"@angular/core":"22","rxjs":"7"}}' } });
    const skillIds = res.skills.map((s) => s.id);
    expect(skillIds).toEqual(expect.arrayContaining(['java', 'maven', 'spring-boot', 'spring-data', 'jpa', 'hibernate', 'postgresql', 'flyway', 'db-migrations', 'testcontainers', 'docker', 'github-actions', 'unit-testing', 'integration-testing', 'angular', 'rxjs']));
    expect(skillIds).not.toContain('mongodb');
    expect(skillIds).not.toContain('javascript');
    expect(res.signals).toEqual({ ci: true, tests: true, docker: true, migrations: true });
    const flyway = res.skills.find((s) => s.id === 'flyway')!;
    expect(flyway.evidence[0]).toMatchObject({ repo: 'banca-microservicios', reason: 'file', path: 'src/main/resources/db/migration/V1__init.sql' });
  });

  it('agrega varios repositorios y propaga las habilidades implicadas', () => {
    const a = analyzer.analyze({ name: 'api', url: '', pushedAt: '', tree: ['pom.xml'], manifests: { 'pom.xml': POM } });
    const b = analyzer.analyze({ name: 'web', url: '', pushedAt: '', tree: ['package.json', 'src/a.ts', 'src/b.ts'], manifests: { 'package.json': '{"dependencies":{"react":"19"}}' } });
    const demo = aggregateDemonstrated([a, b], matcher);
    expect(demo.find((d) => d.id === 'spring-boot')?.repos).toEqual(['api']);
    expect(demo.find((d) => d.id === 'spring')?.repos).toEqual(['api']);
    expect(demo.find((d) => d.id === 'javascript')?.repos).toEqual(['web']);
    expect(demo.find((d) => d.id === 'typescript')?.repos).toEqual(['web']);
  });

  it('reconoce otros ecosistemas: Flutter, .NET y Go', () => {
    const res = analyzer.analyze({ name: 'm', url: '', pushedAt: '', tree: ['pubspec.yaml', 'Api/Api.csproj', 'go.mod'], manifests: { 'pubspec.yaml': 'dependencies:\n  firebase_core: ^3', 'Api/Api.csproj': '<PackageReference Include="Microsoft.AspNetCore.OpenApi" />', 'go.mod': 'module x\nrequire google.golang.org/grpc v1' } });
    expect(res.skills.map((s) => s.id)).toEqual(expect.arrayContaining(['flutter', 'dart', 'firebase', 'csharp', 'dotnet', 'aspnet', 'go', 'grpc']));
  });
});

describe('CV procesado localmente', () => {
  const classifier = createJobClassifier(classification);
  const now = new Date('2026-10-31T00:00:00Z');

  it('estima la experiencia sin contar dos veces los periodos solapados ni los estudios', () => {
    const text = 'EXPERIENCIA\nDesarrollador Java, Empresa A\nEne 2021 - Dic 2022\nFreelance\nJun 2022 – Actualidad\nEDUCACIÓN\nUniversidad de Cuenca 2015 - 2020';
    const res = estimateExperience(text, now);
    expect(res.ranges).toEqual([{ from: '2021-01', to: '2026-10' }]);
    expect(res.years).toBe(5.8);
  });

  it('acepta fechas numéricas y años sueltos', () => {
    expect(estimateExperience('Analista 03/2019 - 02/2020', now).years).toBe(1);
    expect(estimateExperience('Soporte 2018 a 2019', now).years).toBe(2);
    expect(estimateExperience('Sin fechas', now).years).toBeNull();
  });

  it('devuelve habilidades declaradas, años e inglés, sin tocar la red', () => {
    const res = analyzeCv('Ingeniero de software. Java, Spring Boot, Angular y Docker.\nExperiencia: Ene 2023 - Actualidad en Ficticia.\nInglés intermedio (B1).', matcher, classifier, now);
    expect(res.skills.map((s) => s.id)).toEqual(expect.arrayContaining(['java', 'spring-boot', 'angular', 'docker']));
    expect(res).toMatchObject({ yearsSource: 'date-ranges', englishLevel: 'B1' });
    expect(res.yearsOfExperience).toBe(3.8);
  });

  it('usa los años declarados cuando no hay fechas', () => {
    const res = analyzeCv('Cuento con 4 años de experiencia en desarrollo web', matcher, classifier, now);
    expect(res).toMatchObject({ yearsOfExperience: 4, yearsSource: 'stated', englishLevel: null });
  });
});

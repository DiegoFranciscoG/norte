import type { SkillMatcher } from './skills.js';

/** Reglas de data/skills/dependencies.json. */
export interface DependencyRules {
  maven: { match: string; skills: string[] }[];
  gradlePlugins: { match: string; skills: string[] }[];
  npm: { match: string; skills: string[] }[];
  pip: { match: string; skills: string[] }[];
  otherManifests: { file: string; skills: string[]; contains: { match: string; skills: string[] }[] }[];
  files: { pattern: string; skills: string[]; signal?: Signal }[];
  extensions: Record<string, string>;
  minFilesPerLanguage: number;
  ignorePaths: string;
  manifestFiles: string[];
  maxManifestsPerRepo: number;
}

export type Signal = 'ci' | 'tests' | 'docker' | 'migrations';

export interface RepoInput {
  name: string;
  url: string;
  pushedAt: string;
  /** Rutas de archivos del árbol del repositorio (git/trees?recursive=1). */
  tree: string[];
  /** Contenido de los manifiestos descargados, por ruta. */
  manifests: Record<string, string>;
}

export interface Evidence {
  repo: string;
  path: string;
  reason: 'dependency' | 'file' | 'language';
  detail: string;
}

export interface RepoAnalysis {
  repo: string;
  url: string;
  pushedAt: string;
  skills: { id: string; evidence: Evidence[] }[];
  signals: Record<Signal, boolean>;
  languages: Record<string, number>;
}

export interface DemonstratedSkill {
  id: string;
  repos: string[];
  evidence: Evidence[];
}

const globToRegex = (glob: string) => new RegExp(`^${glob.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('.*')}$`, 'i');

interface Compiled { re: RegExp; skills: string[] }
const compile = (list: { match: string; skills: string[] }[]): Compiled[] => list.map((r) => ({ re: globToRegex(r.match), skills: r.skills }));

/** Dependencias declaradas en un pom.xml (incluye plugins y el padre de Spring Boot). */
export function parsePom(xml: string): string[] {
  const out: string[] = [];
  const clean = xml.replace(/<!--[\s\S]*?-->/g, '');
  for (const block of clean.matchAll(/<(dependency|plugin|parent)>([\s\S]*?)<\/\1>/g)) {
    const g = block[2]!.match(/<groupId>\s*([^<\s]+)\s*<\/groupId>/)?.[1];
    const a = block[2]!.match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/)?.[1];
    if (g && a) out.push(`${g}:${a}`);
  }
  return out;
}

/** Coordenadas y plugins de build.gradle / build.gradle.kts. */
export function parseGradle(text: string): { coordinates: string[]; plugins: string[] } {
  const coordinates = [...text.matchAll(/["']([\w.-]+):([\w.-]+)(?::[^"']*)?["']/g)].map((m) => `${m[1]}:${m[2]}`);
  const plugins = [
    ...[...text.matchAll(/\bid\s*\(?\s*["']([\w.-]+)["']/g)].map((m) => m[1]!),
    ...[...text.matchAll(/\bkotlin\s*\(\s*["']([\w.-]+)["']\s*\)/g)].map((m) => `kotlin-${m[1]}`),
    ...[...text.matchAll(/apply\s+plugin:\s*["']([\w.-]+)["']/g)].map((m) => m[1]!),
  ];
  return { coordinates, plugins };
}

export function parsePackageJson(text: string): string[] {
  try {
    const pkg = JSON.parse(text) as Record<string, Record<string, string> | undefined>;
    return [...Object.keys(pkg['dependencies'] ?? {}), ...Object.keys(pkg['devDependencies'] ?? {}), ...Object.keys(pkg['peerDependencies'] ?? {})];
  } catch {
    return [];
  }
}

/** Nombres de paquetes de requirements.txt o de pyproject.toml (PEP 621 y Poetry). */
export function parsePythonDeps(text: string, fileName: string): string[] {
  const names = new Set<string>();
  const add = (n: string) => names.add(n.toLowerCase().replace(/_/g, '-'));
  if (fileName.endsWith('.txt')) {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('-')) continue;
      const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
      if (m) add(m[1]!);
    }
    return [...names];
  }
  for (const m of text.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(?:[<>=!~;][^"']*)?["']/g)) add(m[1]!);
  let inPoetryDeps = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) inPoetryDeps = /^\[tool\.poetry\.(group\.[\w-]+\.)?(dev-)?dependencies\]$/.test(line);
    else if (inPoetryDeps) {
      const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/);
      if (m) add(m[1]!);
    }
  }
  return [...names];
}

export interface RepoAnalyzer {
  /** Qué manifiestos conviene descargar de este árbol (los demás no aportan habilidades). */
  manifestPaths(tree: string[]): string[];
  analyze(input: RepoInput): RepoAnalysis;
}

export function createRepoAnalyzer(rules: DependencyRules, matcher: SkillMatcher): RepoAnalyzer {
  const maven = compile(rules.maven);
  const plugins = compile(rules.gradlePlugins);
  const npm = compile(rules.npm);
  const pip = compile(rules.pip);
  const files = rules.files.map((f) => ({ re: new RegExp(f.pattern), skills: f.skills, signal: f.signal }));
  const ignore = new RegExp(rules.ignorePaths);
  const manifestNames = new Set(rules.manifestFiles);
  const otherManifests = rules.otherManifests.map((m) => ({ ...m, re: globToRegex(m.file) }));
  const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  const known = (id: string) => matcher.byId(id) !== undefined;

  function manifestPaths(tree: string[]): string[] {
    return tree
      .filter((p) => !ignore.test(p) && (manifestNames.has(basename(p)) || otherManifests.some((m) => m.re.test(basename(p)))))
      .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
      .slice(0, rules.maxManifestsPerRepo);
  }

  function analyze(input: RepoInput): RepoAnalysis {
    const found = new Map<string, Evidence[]>();
    const add = (ids: string[], ev: Omit<Evidence, 'repo'>) => {
      for (const id of ids) {
        if (!known(id)) continue;
        const list = found.get(id) ?? [];
        if (list.length < 5 && !list.some((e) => e.path === ev.path && e.detail === ev.detail)) list.push({ repo: input.name, ...ev });
        found.set(id, list);
      }
    };
    const signals: Record<Signal, boolean> = { ci: false, tests: false, docker: false, migrations: false };
    const tree = input.tree.filter((p) => !ignore.test(p));

    for (const path of tree) {
      for (const rule of files) {
        if (rule.re.test(path)) {
          add(rule.skills, { path, reason: 'file', detail: basename(path) });
          if (rule.signal) signals[rule.signal] = true;
        }
      }
    }

    const counts: Record<string, number> = {};
    for (const path of tree) {
      const name = basename(path);
      if (name.endsWith('.d.ts')) continue;
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
      const skill = rules.extensions[ext];
      if (skill) counts[skill] = (counts[skill] ?? 0) + 1;
    }
    for (const [skill, n] of Object.entries(counts)) {
      if (n >= rules.minFilesPerLanguage) add([skill], { path: '', reason: 'language', detail: `${n} archivos` });
    }

    for (const [path, content] of Object.entries(input.manifests)) {
      const name = basename(path);
      const viaDeps = (deps: string[], table: Compiled[]) => {
        for (const dep of deps) {
          for (const rule of table) if (rule.re.test(dep)) add(rule.skills, { path, reason: 'dependency', detail: dep });
        }
      };
      if (name === 'pom.xml') {
        add(['maven', 'java'], { path, reason: 'dependency', detail: 'pom.xml' });
        viaDeps(parsePom(content), maven);
      } else if (name.startsWith('build.gradle')) {
        const g = parseGradle(content);
        add(['gradle'], { path, reason: 'dependency', detail: name });
        viaDeps(g.coordinates, maven);
        viaDeps(g.plugins, plugins);
      } else if (name === 'package.json') {
        viaDeps(parsePackageJson(content), npm);
      } else if (name.startsWith('requirements') || name === 'pyproject.toml') {
        add(['python'], { path, reason: 'dependency', detail: name });
        viaDeps(parsePythonDeps(content, name), pip);
      } else {
        for (const m of otherManifests) {
          if (!m.re.test(name)) continue;
          add(m.skills, { path, reason: 'dependency', detail: name });
          for (const c of m.contains) if (content.includes(c.match)) add(c.skills, { path, reason: 'dependency', detail: c.match });
        }
      }
    }

    return {
      repo: input.name,
      url: input.url,
      pushedAt: input.pushedAt,
      skills: [...found.entries()].map(([id, evidence]) => ({ id, evidence })).sort((a, b) => a.id.localeCompare(b.id)),
      signals,
      languages: counts,
    };
  }

  return { manifestPaths, analyze };
}

/** Une los análisis de varios repositorios: cada habilidad demostrada con los repos de donde salió. */
export function aggregateDemonstrated(analyses: RepoAnalysis[], matcher: SkillMatcher): DemonstratedSkill[] {
  const byId = new Map<string, DemonstratedSkill>();
  for (const a of analyses) {
    for (const s of a.skills) {
      const entry = byId.get(s.id) ?? { id: s.id, repos: [], evidence: [] };
      if (!entry.repos.includes(a.repo)) entry.repos.push(a.repo);
      entry.evidence.push(...s.evidence.slice(0, 3));
      byId.set(s.id, entry);
    }
  }
  // Una habilidad implicada por otra demostrada también queda demostrada, con la misma evidencia.
  for (const entry of [...byId.values()]) {
    for (const implied of matcher.expandImplied([entry.id])) {
      if (byId.has(implied)) continue;
      byId.set(implied, { id: implied, repos: [...entry.repos], evidence: entry.evidence.slice(0, 2).map((e) => ({ ...e, detail: `${e.detail} (implica ${implied})` })) });
    }
  }
  return [...byId.values()].sort((a, b) => b.repos.length - a.repos.length || a.id.localeCompare(b.id));
}

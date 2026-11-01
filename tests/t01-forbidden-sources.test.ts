import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const FORBIDDEN = /(linkedin\.com|multitrabajos\.com|computrabajo\.com)/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.angular', 'coverage', 'site', '.cache', 'target', 'playwright-report', 'test-results']);
const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|java|kt|py|html|scss|css|json|ya?ml|properties|sql|sh|xml)$/;

/** Únicos lugares donde esos dominios pueden aparecer: plantillas de enlace profundo, la lista de exclusiones y la documentación. */
const ALLOWED = new Set(['data/sources/deep-links.json', 'data/sources/sources.json', 'tests/t01-forbidden-sources.test.ts']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(relative(ROOT, path).split(sep).join('/'));
  }
  return out;
}

/** Archivos del repositorio (versionados o nuevos) sin los ignorados: copias generadas no cuentan. */
function repoFiles(): string[] {
  try {
    return execSync('git ls-files -co --exclude-standard', { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  } catch {
    return walk(ROOT);
  }
}

describe('T-01 ninguna fuente prohibida', () => {
  // Un archivo borrado aún sin commit sigue en el índice de git: se ignora.
  const files = repoFiles().filter((f) => CODE_EXT.test(f) && !f.startsWith('docs/') && existsSync(join(ROOT, f)));

  it('ningún archivo de código o configuración menciona LinkedIn, Multitrabajos o Computrabajo fuera de las listas permitidas', () => {
    const offenders = files.filter((f) => !ALLOWED.has(f) && FORBIDDEN.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('ninguna URL que la ingesta consulta apunta a esos dominios', () => {
    const sources = JSON.parse(readFileSync(join(ROOT, 'data/sources/sources.json'), 'utf8'));
    const fetched: string[] = [
      ...Object.values(sources.ats as Record<string, Record<string, string>>).flatMap((a) => [a['listUrl'], a['euListUrl'], a['detailUrl']].filter((u): u is string => !!u)),
      ...(sources.portals as { endpoint: string }[]).map((p) => p.endpoint),
      sources.fx.url,
      ...Object.keys(sources.hostPolicies),
    ];
    expect(fetched.filter((u) => FORBIDDEN.test(u))).toEqual([]);
    const outsideExcluded = JSON.stringify({ ...sources, excluded: [] });
    expect(FORBIDDEN.test(outsideExcluded)).toBe(false);
  });

  it('esos dominios solo existen como plantillas de enlace profundo que abre el navegador', () => {
    const deep = JSON.parse(readFileSync(join(ROOT, 'data/sources/deep-links.json'), 'utf8')) as { links: { template: string }[] };
    const forbiddenLinks = deep.links.filter((l) => FORBIDDEN.test(l.template));
    expect(forbiddenLinks.length).toBe(3);
    for (const link of forbiddenLinks) expect(link.template).toMatch(/^https:\/\//);
    const companies = readFileSync(join(ROOT, 'data/sources/companies.json'), 'utf8');
    expect(FORBIDDEN.test(companies)).toBe(false);
  });
});

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadData } from './config.js';
import { demoTask } from './demo.js';
import { loadFx } from './fx.js';
import { FileHttpCache } from './http/cache.js';
import { HttpClient } from './http/client.js';
import { buildTasks, runPipeline } from './pipeline.js';
import { publish } from './publish.js';
import { buildObservatory } from './stats/observatory.js';
import { loadPreviousState } from './state.js';

const log = (message: string) => console.log(`[norte] ${message}`);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: process.env['NORTE_OUT_DIR'] ?? 'site/data/v1' },
      previous: { type: 'string', default: process.env['NORTE_PREVIOUS_URL'] ?? '' },
      cache: { type: 'string', default: process.env['NORTE_CACHE_DIR'] ?? '.cache/http' },
      only: { type: 'string', default: '' },
      demo: { type: 'boolean', default: false },
    },
  });
  const now = new Date();
  const data = loadData();
  const outDir = resolve(values.out);
  const http = new HttpClient({ policies: data.sources.hostPolicies, userAgent: data.sources.userAgent, cache: values.demo ? undefined : new FileHttpCache(resolve(values.cache)) });
  const previous = values.demo ? null : await loadPreviousState(values.previous || null, log);
  const fx = values.demo ? null : await loadFx(http, data.sources.fx.url, data.sources.fx.source, log);
  const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;

  log(values.demo ? 'Modo demostración: datos ficticios, sin red.' : `Fuentes: ${data.companies.companies.length} tableros de empresa y ${data.sources.portals.filter((p) => p.enabled).length} portales.`);
  const result = await runPipeline({
    data,
    http,
    now,
    previous,
    fx,
    log,
    tasks: values.demo ? [demoTask()] : only ? buildTasks(data).filter((t) => only.has(t.sourceId)) : undefined,
  });

  const observatory = buildObservatory({ jobs: result.jobs, data, now, previousDays: previous?.history ?? [], previousMonths: previous?.months ?? [], demo: values.demo });
  const files = await publish({
    outDir,
    data,
    result,
    now,
    demo: values.demo,
    buildVersion: process.env['NORTE_BUILD_VERSION'] ?? now.toISOString().replace(/[-:]/g, '').slice(0, 13),
    commit: process.env['GITHUB_SHA']?.slice(0, 7) ?? null,
    extraFiles: observatory,
  });

  const runs = Object.values(result.sourceRuns);
  const failed = runs.filter((r) => r.status === 'failed');
  log(`Publicados ${files.length} archivos en ${outDir}`);
  log(`Vacantes abiertas: ${result.jobs.filter((j) => j.status === 'open').length} · nuevas: ${result.opened} · cerradas en esta ejecución: ${result.closed} · conservadas de fuentes no disponibles: ${result.carried}`);
  log(`Publicaciones leídas: ${result.postings} · duplicados unidos: ${result.duplicatesMerged} · descartadas: ${JSON.stringify(result.dropped)}`);
  log(`Fuentes: ${runs.filter((r) => r.status === 'ok').length} ok, ${runs.filter((r) => r.status === 'skipped').length} omitidas por su límite, ${failed.length} con error`);
  for (const f of failed) log(`  ✗ ${f.sourceName}: ${f.error}`);
  log(`Peticiones por host: ${JSON.stringify(http.stats())}`);
}

main().catch((err) => {
  console.error('[norte] Error fatal:', err);
  process.exitCode = 1;
});

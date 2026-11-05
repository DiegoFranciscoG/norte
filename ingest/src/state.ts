import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Job } from '@norte/core';
import type { MergedPosting } from './dedupe.js';

export type SourceStatus = 'ok' | 'failed' | 'skipped';

export interface SourceRun {
  sourceId: string;
  sourceName: string;
  status: SourceStatus;
  fetched: number;
  kept: number;
  error: string | null;
  durationMs: number;
  lastFetchedAt: string | null;
}

/** Lo que una ejecución hereda de la anterior: vacantes, última consulta por fuente y las series del observatorio. */
export interface PreviousState {
  jobs: Job[];
  sourceRuns: Record<string, SourceRun>;
  history: unknown[];
  months?: unknown[];
}

export function stableJobId(identity: string): string {
  return `j_${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`;
}

const DAY = 86400000;

export interface MergeResult {
  jobs: Job[];
  opened: number;
  closed: number;
  carried: number;
}

/**
 * Une la cosecha actual con el estado anterior:
 * - reutiliza el id y la fecha de primera aparición si cualquier origen ya se conocía;
 * - si un tablero repite la publicación por ciudad con el mismo id, cada ciudad es una vacante y la huella dice cuál es cuál;
 * - marca como cerrada (sin borrarla) la vacante que desaparece de una fuente consultada con éxito;
 * - conserva intacta la que venía de una fuente caída u omitida en esta ejecución (T-07);
 * - descarta las cerradas que superan la retención.
 */
export function mergeWithPrevious(
  current: MergedPosting[],
  previous: PreviousState | null,
  sourceStatus: Map<string, SourceStatus>,
  now: Date,
  retention: { closedDays: number; maxAgeDays: number },
): MergeResult {
  const nowIso = now.toISOString();
  const prevJobs = previous?.jobs ?? [];
  const prevByKey = new Map<string, Job[]>();
  for (const job of prevJobs) {
    for (const s of job.sources) {
      const key = `${s.sourceId}#${s.externalId}`;
      prevByKey.set(key, [...(prevByKey.get(key) ?? []), job]);
    }
  }
  const repeatedBefore = (job: Job) => job.sources.some((s) => (prevByKey.get(`${s.sourceId}#${s.externalId}`)?.length ?? 0) > 1);

  const currentPerKey = new Map<string, number>();
  for (const m of current) for (const k of new Set(m.externalKeys)) currentPerKey.set(k, (currentPerKey.get(k) ?? 0) + 1);

  const prevOpenByFingerprint = new Map<string, Job>();
  for (const job of prevJobs) if (job.status === 'open') prevOpenByFingerprint.set(job.fingerprint, job);

  const usedPrev = new Set<string>();
  const takenIds = new Set<string>();
  const jobs: Job[] = [];
  let opened = 0;
  for (const m of current) {
    const known = [...new Set(m.externalKeys.flatMap((k) => prevByKey.get(k) ?? []))];
    const repeatedNow = m.externalKeys.some((k) => (currentPerKey.get(k) ?? 0) > 1);
    let matches = known.filter((j) => j.fingerprint === m.fingerprint || (!repeatedNow && !repeatedBefore(j)));
    let carriedSources: Job['sources'] = [];
    if (matches.length === 0) {
      // Misma vacante que sigue viva en una fuente omitida o caída: se une por huella para no duplicarla.
      const byFingerprint = prevOpenByFingerprint.get(m.fingerprint);
      if (byFingerprint) {
        matches = [byFingerprint];
        carriedSources = byFingerprint.sources.filter((s) => sourceStatus.get(s.sourceId) !== 'ok');
      }
    }
    const prev = matches.filter((p) => !takenIds.has(p.id)).sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt))[0];
    for (const p of matches) usedPrev.add(p.id);
    if (!prev) opened++;
    const { externalKeys, externalKey: _k, sourceKind: _s, ...rest } = m;
    const ownSources = new Set(rest.sources.map((s) => `${s.sourceId}#${s.externalId}`));
    const id = prev?.id ?? stableJobId(`${externalKeys[0]!}|${m.fingerprint}`);
    takenIds.add(id);
    jobs.push({
      ...rest,
      sources: [...rest.sources, ...carriedSources.filter((s) => !ownSources.has(`${s.sourceId}#${s.externalId}`))],
      id,
      firstSeenAt: prev?.firstSeenAt ?? nowIso,
      lastSeenAt: nowIso,
      status: 'open',
      closedAt: null,
    });
  }

  let closed = 0;
  let carried = 0;
  const ids = new Set(jobs.map((j) => j.id));
  for (const job of prevJobs) {
    if (usedPrev.has(job.id) || ids.has(job.id)) continue;
    if (job.status === 'closed') {
      if (job.closedAt && now.getTime() - Date.parse(job.closedAt) <= retention.closedDays * DAY) jobs.push(job);
      continue;
    }
    const statuses = job.sources.map((s) => sourceStatus.get(s.sourceId));
    const allFetchedOk = statuses.length > 0 && statuses.every((st) => st === 'ok');
    const stale = now.getTime() - Date.parse(job.lastSeenAt) > retention.maxAgeDays * DAY;
    if (allFetchedOk || stale) {
      jobs.push({ ...job, status: 'closed', closedAt: nowIso });
      closed++;
    } else {
      jobs.push(job);
      carried++;
    }
  }
  jobs.sort((a, b) => (a.status === b.status ? b.publishedAt.localeCompare(a.publishedAt) : a.status === 'open' ? -1 : 1));
  return { jobs, opened, closed, carried };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

/** El estado vive en el propio sitio publicado: la ejecución anterior se lee desde GitHub Pages o desde un directorio local. */
export async function loadPreviousState(location: string | null, log: (m: string) => void): Promise<PreviousState | null> {
  if (!location) return null;
  const isUrl = /^https?:\/\//.test(location);
  const read = async (file: string): Promise<unknown> =>
    isUrl ? fetchJson(`${location.replace(/\/$/, '')}/${file}`) : JSON.parse(await readFile(join(location, file), 'utf8'));
  try {
    const [index, jobs] = await Promise.all([read('index.json'), read('jobs.json')]);
    const history = await read('stats/history.json').catch(() => ({ days: [] }));
    const monthly = await read('stats/monthly.json').catch(() => ({ months: [] }));
    const idx = index as { sourceRuns?: Record<string, SourceRun>; demo?: boolean };
    if (idx.demo) {
      log('El estado anterior es de demostración: se ignora.');
      return null;
    }
    return {
      jobs: ((jobs as { jobs?: Job[] }).jobs ?? []),
      sourceRuns: idx.sourceRuns ?? {},
      history: ((history as { days?: unknown[] }).days ?? []),
      months: ((monthly as { months?: unknown[] }).months ?? []),
    };
  } catch (err) {
    log(`Sin estado anterior utilizable (${err instanceof Error ? err.message : String(err)}): se empieza de cero.`);
    return null;
  }
}

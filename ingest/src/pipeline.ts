import { createGeoResolver, createJobClassifier, createSkillMatcher, type FxTable, type Job } from '@norte/core';
import type { LoadedData } from './config.js';
import { dedupe } from './dedupe.js';
import type { HttpClient } from './http/client.js';
import { normalizePosting, type DropReason, type NormalizedPosting } from './normalize.js';
import { atsTask } from './sources/ats.js';
import { portalTask } from './sources/portals.js';
import type { SourceTask } from './sources/types.js';
import { mergeWithPrevious, type PreviousState, type SourceRun, type SourceStatus } from './state.js';

export interface PipelineDeps {
  data: LoadedData;
  http: HttpClient;
  now: Date;
  previous: PreviousState | null;
  fx: FxTable | null;
  tasks?: SourceTask[];
  concurrency?: number;
  log: (message: string) => void;
}

export interface PipelineResult {
  jobs: Job[];
  sourceRuns: Record<string, SourceRun>;
  dropped: Record<DropReason, number>;
  postings: number;
  duplicatesMerged: number;
  opened: number;
  closed: number;
  carried: number;
}

export function buildTasks(data: LoadedData): SourceTask[] {
  return [
    ...data.companies.companies.map((c) => atsTask(c, data.sources.ats, data.ingest.smartrecruitersDetailOnlyForTechTitles)),
    ...data.sources.portals.filter((p) => p.enabled).map(portalTask),
  ];
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

const HOUR = 3600000;

/** Una fuente que falla o tarda no detiene a las demás: cada tarea se aísla y su resultado queda registrado. */
export async function runPipeline(deps: PipelineDeps): Promise<PipelineResult> {
  const { data, now, previous, log } = deps;
  const classifier = createJobClassifier(data.ingest.classification);
  const geo = createGeoResolver(data.geo);
  const matcher = createSkillMatcher(data.catalog, data.extraction);
  const tasks = deps.tasks ?? buildTasks(data);
  const sourceRuns: Record<string, SourceRun> = {};
  const normalized: NormalizedPosting[] = [];
  const dropped: Record<DropReason, number> = { 'not-tech': 0, 'outside-groups': 0, invalid: 0 };
  let postings = 0;

  await pool(tasks, deps.concurrency ?? 8, async (task) => {
    const prevRun = previous?.sourceRuns[task.sourceId];
    const last = prevRun?.lastFetchedAt ? Date.parse(prevRun.lastFetchedAt) : null;
    if (last !== null && task.minHoursBetweenFetches > 0 && now.getTime() - last < task.minHoursBetweenFetches * HOUR) {
      sourceRuns[task.sourceId] = { sourceId: task.sourceId, sourceName: task.sourceName, status: 'skipped', fetched: 0, kept: 0, error: null, durationMs: 0, lastFetchedAt: prevRun!.lastFetchedAt };
      return;
    }
    const started = Date.now();
    try {
      const raw = await task.run({ http: deps.http, now, log, isTechTitle: classifier.isTechTitle });
      let kept = 0;
      for (const posting of raw) {
        const result = normalizePosting(posting, task, { cfg: data.ingest, classifier, geo, matcher, fx: deps.fx, now });
        if (typeof result === 'string') dropped[result]++;
        else {
          normalized.push(result);
          kept++;
        }
      }
      postings += raw.length;
      sourceRuns[task.sourceId] = { sourceId: task.sourceId, sourceName: task.sourceName, status: 'ok', fetched: raw.length, kept, error: null, durationMs: Date.now() - started, lastFetchedAt: now.toISOString() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`✗ ${task.sourceName}: ${message}`);
      sourceRuns[task.sourceId] = { sourceId: task.sourceId, sourceName: task.sourceName, status: 'failed', fetched: 0, kept: 0, error: message.slice(0, 300), durationMs: Date.now() - started, lastFetchedAt: prevRun?.lastFetchedAt ?? null };
    }
  });

  const merged = dedupe(normalized, data.ingest.dedupe);
  const statuses = new Map<string, SourceStatus>(Object.values(sourceRuns).map((r) => [r.sourceId, r.status]));
  const merge = mergeWithPrevious(merged, previous, statuses, now, data.ingest.retention);
  return {
    jobs: merge.jobs,
    sourceRuns,
    dropped,
    postings,
    duplicatesMerged: normalized.length - merged.length,
    opened: merge.opened,
    closed: merge.closed,
    carried: merge.carried,
  };
}

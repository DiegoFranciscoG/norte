import { describe, expect, it } from 'vitest';
import { HttpClient } from '../src/http/client.js';
import { runPipeline } from '../src/pipeline.js';
import { atsTask } from '../src/sources/ats.js';
import type { PreviousState } from '../src/state.js';
import { fakeFetch, json, rawPosting, staticTask, testData } from './helpers.js';

const data = testData();
const now = new Date('2026-10-31T12:00:00Z');
const log = () => undefined;

function http(handler: Parameters<typeof fakeFetch>[0], timeoutMs = 50) {
  return new HttpClient({
    policies: { default: { minIntervalMs: 0, maxRequestsPerRun: 10, timeoutMs, maxRetries: 1, backoffBaseMs: 1, backoffMaxMs: 2 } },
    userAgent: 'test',
    fetchImpl: fakeFetch(handler),
    sleep: async () => undefined,
  });
}

const okTask = staticTask('portal:ok', [rawPosting({ sourceId: 'portal:ok', externalId: '1', title: 'Backend Engineer', company: 'Uno' })]);
const failingTask = staticTask('portal:caida', [], { run: async () => { throw new Error('ECONNRESET'); } });

describe('T-07 una fuente caída o lenta no rompe la ingesta', () => {
  it('termina, publica las demás y registra el error', async () => {
    const result = await runPipeline({ data, http: http(() => json({})), now, previous: null, fx: null, log, tasks: [failingTask, okTask] });
    expect(result.jobs.map((j) => j.title)).toEqual(['Backend Engineer']);
    expect(result.sourceRuns['portal:caida']).toMatchObject({ status: 'failed', error: 'ECONNRESET' });
    expect(result.sourceRuns['portal:ok']).toMatchObject({ status: 'ok', fetched: 1, kept: 1 });
  });

  it('corta por tiempo de espera una fuente lenta y sigue con las demás', async () => {
    const company = { ...data.companies.companies.find((c) => c.ats === 'greenhouse')! };
    const slowHttp = http((url, init) => new Promise<Response>((resolve, reject) => {
      if (!url.includes('greenhouse')) return resolve(json({}));
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }), 30);
    const result = await runPipeline({ data, http: slowHttp, now, previous: null, fx: null, log, tasks: [atsTask(company, data.sources.ats, true), okTask] });
    expect(result.sourceRuns[`ats:greenhouse:${company.board}`]?.status).toBe('failed');
    expect(result.sourceRuns[`ats:greenhouse:${company.board}`]?.error).toMatch(/Fallo de red o tiempo agotado/);
    expect(result.jobs).toHaveLength(1);
  });

  it('no marca como cerradas las vacantes de una fuente caída: las conserva', async () => {
    const first = await runPipeline({
      data, http: http(() => json({})), now: new Date('2026-10-30T12:00:00Z'), previous: null, fx: null, log,
      tasks: [staticTask('portal:caida', [rawPosting({ sourceId: 'portal:caida', externalId: '9', title: 'Data Engineer', company: 'Dos' })]), okTask],
    });
    const previous: PreviousState = { jobs: first.jobs, sourceRuns: first.sourceRuns, history: [] };
    const second = await runPipeline({ data, http: http(() => json({})), now, previous, fx: null, log, tasks: [failingTask, okTask] });
    const dataEngineer = second.jobs.find((j) => j.title === 'Data Engineer')!;
    expect(dataEngineer.status).toBe('open');
    expect(second.carried).toBe(1);
    expect(second.closed).toBe(0);
  });

  it('marca como cerrada la vacante que desaparece de una fuente consultada con éxito', async () => {
    const first = await runPipeline({
      data, http: http(() => json({})), now: new Date('2026-10-30T12:00:00Z'), previous: null, fx: null, log,
      tasks: [staticTask('portal:ok', [
        rawPosting({ sourceId: 'portal:ok', externalId: '1', title: 'Backend Engineer', company: 'Uno' }),
        rawPosting({ sourceId: 'portal:ok', externalId: '2', title: 'QA Engineer', company: 'Uno' }),
      ])],
    });
    const previous: PreviousState = { jobs: first.jobs, sourceRuns: first.sourceRuns, history: [] };
    const second = await runPipeline({ data, http: http(() => json({})), now, previous, fx: null, log, tasks: [okTask] });
    expect(second.jobs.find((j) => j.title === 'QA Engineer')).toMatchObject({ status: 'closed', closedAt: now.toISOString() });
    const backend = second.jobs.find((j) => j.title === 'Backend Engineer')!;
    expect(backend.id).toBe(first.jobs.find((j) => j.title === 'Backend Engineer')!.id);
    expect(backend.firstSeenAt).toBe('2026-10-30T12:00:00.000Z');
  });

  it('omite una fuente con tope diario y conserva sus vacantes sin cerrarlas', async () => {
    const limited = staticTask('portal:remotive', [rawPosting({ sourceId: 'portal:remotive', externalId: 'r1', title: 'Frontend Developer', company: 'Tres' })], { minHoursBetweenFetches: 6 });
    const first = await runPipeline({ data, http: http(() => json({})), now: new Date('2026-10-31T09:00:00Z'), previous: null, fx: null, log, tasks: [limited] });
    let calls = 0;
    const counting = { ...limited, run: async () => { calls++; return []; } };
    const second = await runPipeline({ data, http: http(() => json({})), now, previous: { jobs: first.jobs, sourceRuns: first.sourceRuns, history: [] }, fx: null, log, tasks: [counting] });
    expect(calls).toBe(0);
    expect(second.sourceRuns['portal:remotive']?.status).toBe('skipped');
    expect(second.jobs.find((j) => j.title === 'Frontend Developer')?.status).toBe('open');
  });
});

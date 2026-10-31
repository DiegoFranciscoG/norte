import type { FxTable, Job } from '@norte/core';
import type { LoadedData } from '../config.js';

export interface ObservatoryInput {
  jobs: Job[];
  data: LoadedData;
  now: Date;
  previousHistory: unknown[];
  fx: FxTable | null;
  demo: boolean;
}

/** Serie diaria mínima que hereda cada ejecución; el observatorio completo se construye sobre ella. */
export function buildObservatory(input: ObservatoryInput): Record<string, object | string> {
  const day = input.now.toISOString().slice(0, 10);
  const open = input.jobs.filter((j) => j.status === 'open');
  const snapshot = { day, open: open.length };
  const days = [...(input.previousHistory as { day: string }[]).filter((d) => d.day !== day), snapshot].slice(-400);
  return { 'stats/history.json': { days } };
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { GROUP_ORDER, cefrRank, groupFor, remoteEligibility, type Job, type JobGroup, type ScoreResult, type Seniority, type UserPlace } from '@norte/core';
import { DataService } from './data.service';
import type { WorkMode } from './models';
import { ProfileService } from './profile.service';
import { readStored, writeStored } from './storage';

/** «Para ti» junta lo que la persona busca; los demás feeds son los grupos relativos a su ubicación. */
export type Feed = 'for-you' | JobGroup;
export const FEEDS: Feed[] = ['for-you', ...GROUP_ORDER];

export interface Filters {
  query: string;
  feed: Feed;
  skill: string | null;
  seniority: Seniority | null;
  minSalary: number | null;
  english: 'any' | 'none' | 'mine';
  maxDays: number | null;
  company: string | null;
  includeUnknownScope: boolean;
  sort: 'score' | 'recent';
}

export const DEFAULT_FILTERS: Filters = {
  query: '',
  feed: 'for-you',
  skill: null,
  seniority: null,
  minSalary: null,
  english: 'any',
  maxDays: null,
  company: null,
  includeUnknownScope: true,
  sort: 'score',
};

export interface ResultItem {
  job: Job;
  group: JobGroup;
  score: ScoreResult | null;
  unknownScope: boolean;
}

const DAY = 86400000;

/** ¿Encaja con las modalidades que busca? Una vacante sin modalidad declarada no se descarta. */
export function wantsMode(job: Job, modes: WorkMode[]): boolean {
  if (modes.length === 0 || job.modality === 'unknown') return true;
  return modes.includes(job.modality);
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly data = inject(DataService);
  private readonly profiles = inject(ProfileService);

  readonly filters = signal<Filters>({ ...DEFAULT_FILTERS, ...readStored<Partial<Filters>>('norte.filters.v2', {}), query: '' });
  readonly dismissed = signal<Set<string>>(new Set(readStored<string[]>('norte.dismissed', [])));

  /** Las vacantes abiertas que le sirven a esta persona según dónde vive, con su grupo. */
  private readonly placed = computed(() => this.place(this.data.openJobs(), this.profiles.place()));

  private place(jobs: Job[], place: UserPlace): { job: Job; group: JobGroup; unknownScope: boolean }[] {
    const regions = this.data.regions();
    return jobs.flatMap((job) => {
      const group = groupFor(job, place, regions);
      return group ? [{ job, group, unknownScope: job.modality === 'remote' && remoteEligibility(job.remoteScope, place.country, regions) === null }] : [];
    });
  }

  /** Opciones de filtro derivadas del propio índice: nada de listas escritas a mano. */
  readonly options = computed(() => {
    const jobs = this.placed().map((p) => p.job);
    const count = (values: string[]) => {
      const m = new Map<string, number>();
      for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    };
    return {
      skills: count(jobs.flatMap((j) => j.skills.map((s) => s.id))).slice(0, 80).map(([id, n]) => ({ id, name: this.data.skillName(id), n })),
      companies: count(jobs.map((j) => j.company.name)).slice(0, 60).map(([name, n]) => ({ name, n })),
    };
  });

  /** Todos los filtros salvo el feed: así los conteos de cada chip siempre son coherentes. */
  private readonly filtered = computed<ResultItem[]>(() => {
    const f = this.filters();
    const textIds = this.data.searchIds(f.query);
    const scores = this.profiles.scores();
    const english = this.profiles.profile().englishLevel;
    const dismissed = this.dismissed();
    const now = Date.now();
    return this.placed()
      .filter(({ job: j, unknownScope }) => {
        if (dismissed.has(j.id)) return false;
        if (textIds && !textIds.has(j.id)) return false;
        if (unknownScope && !f.includeUnknownScope) return false;
        if (f.skill && !j.skills.some((s) => s.id === f.skill)) return false;
        if (f.seniority && j.seniority !== f.seniority) return false;
        if (f.minSalary !== null && !((j.salary?.usdMonthlyMax ?? j.salary?.usdMonthlyMin ?? 0) >= f.minSalary)) return false;
        if (f.maxDays !== null && now - Date.parse(j.publishedAt) > f.maxDays * DAY) return false;
        if (f.company && j.company.name !== f.company) return false;
        const en = j.languages.find((l) => l.language === 'en');
        if (f.english === 'none' && en) return false;
        if (f.english === 'mine' && en && (!english || cefrRank(en.level ?? 'B1') > cefrRank(english))) return false;
        return true;
      })
      .map((p) => ({ ...p, score: scores.get(p.job.id) ?? null }));
  });

  readonly counts = computed(() => {
    const modes = this.profiles.profile().modalities;
    const counts = Object.fromEntries(FEEDS.map((g) => [g, 0])) as Record<Feed, number>;
    for (const r of this.filtered()) {
      counts[r.group]++;
      if (wantsMode(r.job, modes)) counts['for-you']++;
    }
    return counts;
  });

  readonly results = computed<ResultItem[]>(() => {
    const f = this.filters();
    const modes = this.profiles.profile().modalities;
    const list = f.feed === 'for-you' ? this.filtered().filter((r) => wantsMode(r.job, modes)) : this.filtered().filter((r) => r.group === f.feed);
    const byDate = (a: ResultItem, b: ResultItem) => b.job.publishedAt.localeCompare(a.job.publishedAt);
    return f.sort === 'score' && list.some((r) => r.score) ? [...list].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0) || byDate(a, b)) : [...list].sort(byDate);
  });

  /** Vacantes nuevas del índice pendiente que le servirían a esta persona: con 10 o más aparece «Recargar». */
  readonly pendingNew = computed(() => {
    const p = this.data.pending();
    if (!p) return 0;
    const ids = new Set(p.newIds);
    const modes = this.profiles.profile().modalities;
    return this.place(p.jobs.filter((j) => ids.has(j.id)), this.profiles.place()).filter((x) => wantsMode(x.job, modes)).length;
  });
  readonly showReload = computed(() => this.pendingNew() >= this.data.config().newJobsThreshold);

  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    return [f.skill, f.seniority, f.minSalary, f.maxDays, f.company].filter((v) => v !== null).length + (f.english !== 'any' ? 1 : 0) + (f.includeUnknownScope ? 0 : 1);
  });

  set<K extends keyof Filters>(key: K, value: Filters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
    const { query: _q, ...persisted } = this.filters();
    writeStored('norte.filters.v2', persisted);
  }

  reset(): void {
    this.filters.update((f) => ({ ...DEFAULT_FILTERS, feed: f.feed, query: f.query }));
    writeStored('norte.filters.v2', { feed: this.filters().feed });
  }

  dismiss(id: string): void {
    const next = new Set(this.dismissed());
    next.add(id);
    this.dismissed.set(next);
    writeStored('norte.dismissed', [...next]);
  }

  restoreDismissed(): void {
    this.dismissed.set(new Set());
    writeStored('norte.dismissed', []);
  }
}

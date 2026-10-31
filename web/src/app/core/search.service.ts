import { Injectable, computed, inject, signal } from '@angular/core';
import { GROUP_ORDER, cefrRank, normalizeText, type Job, type JobGroup, type Modality, type ScoreResult, type Seniority } from '@norte/core';
import { DataService } from './data.service';
import { ProfileService } from './profile.service';
import { readStored, writeStored } from './storage';

export interface Filters {
  query: string;
  group: JobGroup;
  skill: string | null;
  city: string | null;
  modality: Modality | null;
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
  group: 'home',
  skill: null,
  city: null,
  modality: null,
  seniority: null,
  minSalary: null,
  english: 'any',
  maxDays: null,
  company: null,
  includeUnknownScope: false,
  sort: 'score',
};

export interface ResultItem {
  job: Job;
  score: ScoreResult | null;
}

const DAY = 86400000;

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly data = inject(DataService);
  private readonly profiles = inject(ProfileService);

  readonly filters = signal<Filters>({ ...DEFAULT_FILTERS, ...readStored<Partial<Filters>>('norte.filters', {}), query: '' });
  readonly dismissed = signal<Set<string>>(new Set(readStored<string[]>('norte.dismissed', [])));
  readonly selectedId = signal<string | null>(null);

  /** Opciones de filtro derivadas del propio índice: nada de listas escritas a mano. */
  readonly options = computed(() => {
    const jobs = this.data.openJobs();
    const count = (values: string[]) => {
      const m = new Map<string, number>();
      for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    };
    return {
      skills: count(jobs.flatMap((j) => j.skills.map((s) => s.id))).slice(0, 80).map(([id, n]) => ({ id, name: this.data.skillName(id), n })),
      cities: count(jobs.filter((j) => j.location.country === 'EC' && j.location.city).map((j) => j.location.city!)).map(([name, n]) => ({ name, n })),
      companies: count(jobs.map((j) => j.company.name)).slice(0, 60).map(([name, n]) => ({ name, n })),
    };
  });

  /** Todos los filtros salvo el grupo: así los cuatro conteos siempre están visibles y son coherentes. */
  private readonly filtered = computed<ResultItem[]>(() => {
    const f = this.filters();
    const textIds = this.data.searchIds(f.query);
    const scores = this.profiles.scores();
    const english = this.profiles.profile().englishLevel;
    const dismissed = this.dismissed();
    const now = Date.now();
    const city = f.city ? normalizeText(f.city) : null;
    return this.data.openJobs()
      .filter((j) => {
        if (dismissed.has(j.id)) return false;
        if (textIds && !textIds.has(j.id)) return false;
        if (f.skill && !j.skills.some((s) => s.id === f.skill)) return false;
        if (city && normalizeText(j.location.city ?? '') !== city) return false;
        if (f.modality && j.modality !== f.modality) return false;
        if (f.seniority && j.seniority !== f.seniority) return false;
        if (f.minSalary !== null && !((j.salary?.usdMonthlyMax ?? j.salary?.usdMonthlyMin ?? 0) >= f.minSalary)) return false;
        if (f.maxDays !== null && now - Date.parse(j.publishedAt) > f.maxDays * DAY) return false;
        if (f.company && j.company.name !== f.company) return false;
        if (j.group === 'remote' && !f.includeUnknownScope && j.remoteScope?.ecuadorEligible !== true) return false;
        const en = j.languages.find((l) => l.language === 'en');
        if (f.english === 'none' && en) return false;
        if (f.english === 'mine' && en && (!english || cefrRank(en.level ?? 'B1') > cefrRank(english))) return false;
        return true;
      })
      .map((job) => ({ job, score: scores.get(job.id) ?? null }));
  });

  readonly counts = computed(() => {
    const counts = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0])) as Record<JobGroup, number>;
    for (const r of this.filtered()) counts[r.job.group]++;
    return counts;
  });

  readonly unknownScopeCount = computed(() => this.data.openJobs().filter((j) => j.group === 'remote' && j.remoteScope?.ecuadorEligible === null).length);

  readonly results = computed<ResultItem[]>(() => {
    const f = this.filters();
    const list = this.filtered().filter((r) => r.job.group === f.group);
    const byDate = (a: ResultItem, b: ResultItem) => b.job.publishedAt.localeCompare(a.job.publishedAt);
    return f.sort === 'score' && list.some((r) => r.score) ? [...list].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0) || byDate(a, b)) : [...list].sort(byDate);
  });

  readonly selected = computed<ResultItem | null>(() => {
    const id = this.selectedId();
    const list = this.results();
    return list.find((r) => r.job.id === id) ?? list[0] ?? null;
  });

  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    return [f.skill, f.city, f.modality, f.seniority, f.minSalary, f.maxDays, f.company].filter((v) => v !== null).length + (f.english !== 'any' ? 1 : 0);
  });

  set<K extends keyof Filters>(key: K, value: Filters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
    const { query: _q, ...persisted } = this.filters();
    writeStored('norte.filters', persisted);
    if (key !== 'query') this.selectedId.set(null);
  }

  reset(): void {
    this.filters.update((f) => ({ ...DEFAULT_FILTERS, group: f.group, query: f.query }));
    writeStored('norte.filters', { group: this.filters().group });
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

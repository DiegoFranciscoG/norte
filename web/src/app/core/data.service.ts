import { Injectable, computed, signal } from '@angular/core';
import { createJobClassifier, createSkillMatcher, searchOptions, type ClassificationConfig, type Job, type SearchDocument } from '@norte/core';
import MiniSearch from 'minisearch';
import type { CareerPage, CompanyInfo, DeepLink, IndexFile, LearningFile, ScoringConfig, SkillsFile, SourcesFile } from './models';

export interface RuntimeConfig {
  /** URL de la API privada. Vacía: la app funciona sin cuenta (todo queda en este dispositivo). */
  apiBaseUrl: string;
}

const DATA = 'data/v1/';

/** Clasificación mínima que necesita el análisis del CV en el navegador (años e idioma). */
const CV_CLASSIFICATION: ClassificationConfig = {
  modality: { remote: [], hybrid: [], onsite: [] },
  employment: { freelance: [], internship: [], temporary: [], contract: [], 'part-time': [], 'full-time': [] },
  seniority: { intern: [], lead: [], senior: [], mid: [], junior: [] },
  years: { maxPlausible: 40, experienceWords: ['experien', 'trayectoria'], ignoreIfNear: ['edad', 'years old'] },
  languages: {
    english: ['ingles', 'english'],
    spanish: ['espanol', 'spanish'],
    portuguese: ['portugues', 'portuguese'],
    levelWords: {
      C2: ['native', 'nativo', 'bilingual', 'bilingue'],
      C1: ['advanced', 'avanzado', 'fluent', 'fluido', 'proficient'],
      B2: ['upper intermediate', 'intermedio alto', 'intermedio-alto'],
      B1: ['intermediate', 'intermedio', 'conversacional'],
      A2: ['basic', 'basico'],
      A1: ['principiante', 'beginner'],
    },
    postingInEnglishImplies: 'B2',
  },
  techTitle: { include: [], exclude: [] },
};

@Injectable({ providedIn: 'root' })
export class DataService {
  readonly config = signal<RuntimeConfig>({ apiBaseUrl: '' });
  readonly index = signal<IndexFile | null>(null);
  readonly jobs = signal<Job[]>([]);
  readonly skills = signal<SkillsFile | null>(null);
  readonly scoring = signal<ScoringConfig | null>(null);
  readonly learning = signal<LearningFile>({ resources: [] });
  readonly deepLinks = signal<DeepLink[]>([]);
  readonly careerPages = signal<CareerPage[]>([]);
  readonly companies = signal<CompanyInfo[]>([]);
  readonly sources = signal<SourcesFile | null>(null);
  readonly dependencies = signal<unknown>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly openJobs = computed(() => this.jobs().filter((j) => j.status === 'open'));
  readonly jobById = computed(() => new Map(this.jobs().map((j) => [j.id, j] as const)));
  readonly matcher = computed(() => {
    const s = this.skills();
    return s ? createSkillMatcher({ version: s.version, skills: s.skills }, s.extraction) : null;
  });
  readonly cvClassifier = createJobClassifier(CV_CLASSIFICATION);
  readonly homeCity = computed(() => this.index()?.home.city ?? 'Cuenca');

  private search: MiniSearch<SearchDocument> | null = null;

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const config = await this.get<RuntimeConfig>('config.json').catch(() => ({ apiBaseUrl: '' }));
      this.config.set({ apiBaseUrl: (config.apiBaseUrl ?? '').replace(/\/$/, '') });
      const [index, jobs, skills, scoring, learning, deep, careers, companies, sources, searchIndex, dependencies] = await Promise.all([
        this.get<IndexFile>(`${DATA}index.json`),
        this.get<{ jobs: Job[] }>(`${DATA}jobs.json`),
        this.get<SkillsFile>(`${DATA}skills.json`),
        this.get<ScoringConfig>(`${DATA}scoring.json`),
        this.get<LearningFile>(`${DATA}learning.json`).catch(() => ({ resources: [] })),
        this.get<{ links: DeepLink[] }>(`${DATA}deep-links.json`).catch(() => ({ links: [] })),
        this.get<{ pages: CareerPage[] }>(`${DATA}career-pages.json`).catch(() => ({ pages: [] })),
        this.get<{ companies: CompanyInfo[] }>(`${DATA}companies.json`).catch(() => ({ companies: [] })),
        this.get<SourcesFile>(`${DATA}sources.json`).catch(() => null),
        this.getText(`${DATA}search-index.json`),
        this.get<unknown>(`${DATA}dependencies.json`).catch(() => null),
      ]);
      this.search = MiniSearch.loadJSON<SearchDocument>(searchIndex, searchOptions);
      this.index.set(index);
      this.jobs.set(jobs.jobs);
      this.skills.set(skills);
      this.scoring.set(scoring);
      this.learning.set(learning);
      this.deepLinks.set(deep.links);
      this.careerPages.set(careers.pages);
      this.companies.set(companies.companies);
      this.sources.set(sources);
      this.dependencies.set(dependencies);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo cargar el índice de vacantes.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Búsqueda de texto instantánea sobre el índice construido en la ingesta. */
  searchIds(query: string): Set<string> | null {
    const q = query.trim();
    if (!q || !this.search) return null;
    return new Set(this.search.search(q).map((r) => String(r.id)));
  }

  skillName(id: string): string {
    return this.matcher()?.byId(id)?.name ?? id;
  }

  async getJson<T>(path: string): Promise<T> {
    return this.get<T>(path);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status}).`);
    return (await res.json()) as T;
  }

  private async getText(path: string): Promise<string> {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status}).`);
    return res.text();
  }
}

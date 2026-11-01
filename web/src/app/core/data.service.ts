import { Injectable, computed, signal } from '@angular/core';
import { createJobClassifier, createSkillMatcher, searchOptions, type ClassificationConfig, type Job, type SearchDocument } from '@norte/core';
import MiniSearch from 'minisearch';
import type { CareerPage, CitiesFile, CompanyInfo, DeepLink, GeoIndex, IndexFile, LearningFile, ScoringConfig, SkillsFile, SourcesFile } from './models';

export interface RuntimeConfig {
  /** URL de la API privada. Vacía: la app funciona sin cuenta (todo queda en este dispositivo). */
  apiBaseUrl: string;
  /** Cada cuántos minutos se revisa si la ingesta publicó un índice nuevo. */
  pollMinutes: number;
  /** Cuántas vacantes nuevas para la persona hacen aparecer el aviso «Recargar». */
  newJobsThreshold: number;
}

/** Índice nuevo ya descargado, a la espera de que la persona pulse «Recargar». */
export interface PendingIndex {
  index: IndexFile;
  jobs: Job[];
  searchIndex: string;
  newIds: string[];
}

const DATA = 'data/v1/';
const DEFAULT_CONFIG: RuntimeConfig = { apiBaseUrl: '', pollMinutes: 5, newJobsThreshold: 10 };

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
  readonly config = signal<RuntimeConfig>(DEFAULT_CONFIG);
  readonly index = signal<IndexFile | null>(null);
  readonly jobs = signal<Job[]>([]);
  readonly skills = signal<SkillsFile | null>(null);
  readonly scoring = signal<ScoringConfig | null>(null);
  readonly geo = signal<GeoIndex | null>(null);
  readonly learning = signal<LearningFile>({ resources: [] });
  readonly deepLinks = signal<DeepLink[]>([]);
  readonly careerPages = signal<CareerPage[]>([]);
  readonly companies = signal<CompanyInfo[]>([]);
  readonly sources = signal<SourcesFile | null>(null);
  readonly dependencies = signal<unknown>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly pending = signal<PendingIndex | null>(null);
  /** Vacantes que llegaron con la última recarga: la interfaz las marca como «Nueva». */
  readonly freshIds = signal<Set<string>>(new Set());

  readonly openJobs = computed(() => this.jobs().filter((j) => j.status === 'open'));
  readonly jobById = computed(() => new Map(this.jobs().map((j) => [j.id, j] as const)));
  readonly regions = computed(() => this.geo()?.regions ?? {});
  readonly matcher = computed(() => {
    const s = this.skills();
    return s ? createSkillMatcher({ version: s.version, skills: s.skills }, s.extraction) : null;
  });
  readonly cvClassifier = createJobClassifier(CV_CLASSIFICATION);

  private search: MiniSearch<SearchDocument> | null = null;
  private cities: Promise<CitiesFile> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const config = await this.get<Partial<RuntimeConfig>>('config.json').catch((): Partial<RuntimeConfig> => ({}));
      this.config.set({
        apiBaseUrl: (config.apiBaseUrl ?? '').replace(/\/$/, ''),
        pollMinutes: Math.max(1, config.pollMinutes ?? DEFAULT_CONFIG.pollMinutes),
        newJobsThreshold: Math.max(1, config.newJobsThreshold ?? DEFAULT_CONFIG.newJobsThreshold),
      });
      const [index, jobs, skills, scoring, geo, learning, deep, careers, companies, sources, searchIndex, dependencies] = await Promise.all([
        this.get<IndexFile>(`${DATA}index.json`),
        this.get<{ jobs: Job[] }>(`${DATA}jobs.json`),
        this.get<SkillsFile>(`${DATA}skills.json`),
        this.get<ScoringConfig>(`${DATA}scoring.json`),
        this.get<GeoIndex>(`${DATA}geo.json`).catch(() => null),
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
      this.geo.set(geo);
      this.learning.set(learning);
      this.deepLinks.set(deep.links);
      this.careerPages.set(careers.pages);
      this.companies.set(companies.companies);
      this.sources.set(sources);
      this.dependencies.set(dependencies);
      this.error.set(null);
      this.startLiveUpdates();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo cargar el índice de vacantes.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * La ingesta publica un índice nuevo cada 30 minutos. Aquí se revisa cada pocos minutos (y al volver a la pestaña)
   * y se descarga en segundo plano; la persona decide cuándo verlo con el aviso «Recargar».
   */
  private startLiveUpdates(): void {
    if (this.timer || typeof window === 'undefined') return;
    this.timer = setInterval(() => void this.checkForUpdates(), this.config().pollMinutes * 60_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.checkForUpdates();
    });
  }

  async checkForUpdates(): Promise<void> {
    try {
      const index = await this.get<IndexFile>(`${DATA}index.json`, true);
      const current = this.pending()?.index.build.version ?? this.index()?.build.version;
      if (!index.build?.version || index.build.version === current) return;
      const [jobs, searchIndex] = await Promise.all([this.get<{ jobs: Job[] }>(`${DATA}jobs.json`, true), this.getText(`${DATA}search-index.json`, true)]);
      const known = new Set(this.jobs().map((j) => j.id));
      const newIds = jobs.jobs.filter((j) => j.status === 'open' && !known.has(j.id)).map((j) => j.id);
      this.pending.set({ index, jobs: jobs.jobs, searchIndex, newIds });
    } catch {
      // Sin conexión o índice a medio publicar: se vuelve a intentar en la próxima revisión.
    }
  }

  /** Aplica el índice pendiente y marca como nuevas las vacantes que trajo. */
  applyPending(): void {
    const p = this.pending();
    if (!p) return;
    this.search = MiniSearch.loadJSON<SearchDocument>(p.searchIndex, searchOptions);
    this.index.set(p.index);
    this.jobs.set(p.jobs);
    this.freshIds.set(new Set(p.newIds));
    this.pending.set(null);
  }

  /** Ciudades de GeoNames con coordenadas: se descargan solo si la persona usa su ubicación o elige ciudad. */
  loadCities(): Promise<CitiesFile> {
    this.cities ??= this.get<CitiesFile>(`${DATA}cities.json`).catch((err: unknown) => {
      this.cities = null;
      throw err;
    });
    return this.cities;
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

  private async get<T>(path: string, fresh = false): Promise<T> {
    const res = await fetch(path, { headers: { Accept: 'application/json' }, cache: fresh ? 'no-store' : 'default' });
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status}).`);
    return (await res.json()) as T;
  }

  private async getText(path: string, fresh = false): Promise<string> {
    const res = await fetch(path, { cache: fresh ? 'no-store' : 'default' });
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status}).`);
    return res.text();
  }
}

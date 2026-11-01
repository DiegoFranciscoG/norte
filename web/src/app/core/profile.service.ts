import { Injectable, computed, inject, signal } from '@angular/core';
import { scoreJob, type Cefr, type Profile, type ScoreResult, type UserPlace, type Weights } from '@norte/core';
import { DataService } from './data.service';
import type { StoredProfile, WorkMode } from './models';
import { readStored, removeStored, writeStored } from './storage';

const STORAGE_ENTRY = 'norte.profile.v1';
export const ALL_MODES: WorkMode[] = ['onsite', 'hybrid', 'remote'];

export function emptyProfile(): StoredProfile {
  return {
    version: 2,
    declared: [],
    demonstrated: [],
    repos: [],
    githubUser: null,
    yearsOfExperience: null,
    yearsSource: null,
    englishLevel: null,
    homeCountry: null,
    homeCity: null,
    modalities: [...ALL_MODES],
    onboarded: false,
    acceptsRelocation: false,
    minSalaryUsd: null,
    weights: null,
    updatedAt: null,
  };
}

/** La versión 1 era solo para Ecuador: quien ya tenía perfil vivía allí y ya pasó por el ingreso. */
export function migrateProfile(stored: unknown): StoredProfile {
  const base = emptyProfile();
  if (!stored || typeof stored !== 'object') return base;
  const p = stored as Partial<StoredProfile> & { version?: number; homeCity?: string | null };
  if (p.version === 2) return { ...base, ...p, version: 2 };
  const had = (p.declared?.length ?? 0) > 0 || (p.demonstrated?.length ?? 0) > 0 || p.yearsOfExperience != null;
  return { ...base, ...p, version: 2, homeCountry: had ? 'EC' : null, homeCity: had ? (p.homeCity ?? null) : null, modalities: [...ALL_MODES], onboarded: had };
}

/**
 * Perfil local-first: vive en este dispositivo. El CV nunca se guarda; solo las habilidades detectadas
 * y lo que la persona decide declarar. Subirlo a la cuenta exige consentimiento explícito.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly data = inject(DataService);
  readonly profile = signal<StoredProfile>(migrateProfile(readStored<unknown>(STORAGE_ENTRY, null)));

  readonly hasProfile = computed(() => {
    const p = this.profile();
    return p.declared.length > 0 || p.demonstrated.length > 0 || p.yearsOfExperience !== null;
  });

  readonly place = computed<UserPlace>(() => ({ country: this.profile().homeCountry, city: this.profile().homeCity }));

  readonly coreProfile = computed<Profile>(() => {
    const p = this.profile();
    return {
      skills: [...p.demonstrated.map((d) => ({ id: d.id, origin: 'demonstrated' as const, repos: d.repos })), ...p.declared.map((id) => ({ id, origin: 'declared' as const }))],
      yearsOfExperience: p.yearsOfExperience,
      englishLevel: p.englishLevel,
      homeCountry: p.homeCountry,
      homeCity: p.homeCity,
      acceptsRelocation: p.acceptsRelocation,
      minSalaryUsd: p.minSalaryUsd,
      weights: p.weights,
    };
  });

  /** Puntaje de todas las vacantes abiertas, calculado en el navegador. */
  readonly scores = computed<Map<string, ScoreResult>>(() => {
    const matcher = this.data.matcher();
    const config = this.data.scoring();
    if (!matcher || !config || !this.hasProfile()) return new Map();
    const profile = this.coreProfile();
    const ctx = { matcher, config, now: new Date(), regions: this.data.regions() };
    return new Map(this.data.openJobs().map((j) => [j.id, scoreJob(j, profile, ctx)] as const));
  });

  update(patch: Partial<StoredProfile>): void {
    const next = { ...this.profile(), ...patch, updatedAt: new Date().toISOString() };
    this.profile.set(next);
    writeStored(STORAGE_ENTRY, next);
  }

  setDeclared(ids: string[]): void {
    this.update({ declared: [...new Set(ids)].sort() });
  }

  addDeclared(id: string): void {
    this.setDeclared([...this.profile().declared, id]);
  }

  removeSkill(id: string): void {
    const p = this.profile();
    this.update({ declared: p.declared.filter((d) => d !== id), demonstrated: p.demonstrated.filter((d) => d.id !== id) });
  }

  setYears(years: number | null, source: StoredProfile['yearsSource']): void {
    this.update({ yearsOfExperience: years === null || Number.isNaN(years) ? null : Math.max(0, Math.min(50, years)), yearsSource: source });
  }

  setEnglish(level: Cefr | null): void {
    this.update({ englishLevel: level });
  }

  setWeights(weights: Partial<Weights> | null): void {
    this.update({ weights });
  }

  setLocation(country: string | null, city: string | null): void {
    this.update({ homeCountry: country, homeCity: city?.trim() || null });
  }

  toggleMode(mode: WorkMode): void {
    const current = this.profile().modalities;
    const next = current.includes(mode) ? current.filter((m) => m !== mode) : [...current, mode];
    this.update({ modalities: ALL_MODES.filter((m) => next.includes(m)) });
  }

  completeOnboarding(): void {
    this.update({ onboarded: true });
  }

  /** Borra todo lo guardado en este dispositivo. */
  clear(): void {
    removeStored(STORAGE_ENTRY);
    this.profile.set(emptyProfile());
  }
}

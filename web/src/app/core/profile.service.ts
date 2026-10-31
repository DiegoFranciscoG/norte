import { Injectable, computed, inject, signal } from '@angular/core';
import { scoreJob, type Cefr, type Profile, type ScoreResult, type Weights } from '@norte/core';
import { DataService } from './data.service';
import type { StoredProfile } from './models';
import { readStored, removeStored, writeStored } from './storage';

const STORAGE_ENTRY = 'norte.profile.v1';

export function emptyProfile(homeCity: string): StoredProfile {
  return {
    version: 1,
    declared: [],
    demonstrated: [],
    repos: [],
    githubUser: null,
    yearsOfExperience: null,
    yearsSource: null,
    englishLevel: null,
    homeCity,
    acceptsRelocation: false,
    minSalaryUsd: null,
    weights: null,
    updatedAt: null,
  };
}

/**
 * Perfil local-first: vive en este dispositivo. El CV nunca se guarda; solo las habilidades detectadas
 * y lo que la persona decide declarar. Subirlo a la cuenta exige consentimiento explícito.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly data = inject(DataService);
  readonly profile = signal<StoredProfile>(readStored<StoredProfile>(STORAGE_ENTRY, emptyProfile('Cuenca')));

  readonly hasProfile = computed(() => {
    const p = this.profile();
    return p.declared.length > 0 || p.demonstrated.length > 0 || p.yearsOfExperience !== null;
  });

  readonly coreProfile = computed<Profile>(() => {
    const p = this.profile();
    return {
      skills: [...p.demonstrated.map((d) => ({ id: d.id, origin: 'demonstrated' as const, repos: d.repos })), ...p.declared.map((id) => ({ id, origin: 'declared' as const }))],
      yearsOfExperience: p.yearsOfExperience,
      englishLevel: p.englishLevel,
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
    const now = new Date();
    return new Map(this.data.openJobs().map((j) => [j.id, scoreJob(j, profile, { matcher, config, now })] as const));
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

  /** Borra todo lo guardado en este dispositivo. */
  clear(): void {
    removeStored(STORAGE_ENTRY);
    this.profile.set(emptyProfile(this.data.homeCity()));
  }
}

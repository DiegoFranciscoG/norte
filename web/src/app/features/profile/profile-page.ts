import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COMPONENT_ORDER, type Cefr, type CvAnalysis, type DemonstratedSkill, type RepoAnalysis, type Weights } from '@norte/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { CvService } from '../../core/cv.service';
import { DataService } from '../../core/data.service';
import { GithubService } from '../../core/github.service';
import { ProfileService } from '../../core/profile.service';
import { LocationPicker } from '../../shared/location-picker';
import type { WorkMode } from '../../core/models';

const WEIGHT_LABEL: Record<keyof Weights, string> = {
  demonstrated: 'Habilidades demostradas',
  declared: 'Habilidades declaradas',
  experience: 'Nivel y experiencia',
  location: 'Ubicación',
  language: 'Idioma',
  compensation: 'Compensación',
  freshness: 'Frescura',
};

@Component({
  selector: 'app-profile-page',
  imports: [RouterLink, LocationPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  protected readonly data = inject(DataService);
  protected readonly profiles = inject(ProfileService);
  protected readonly github = inject(GithubService);
  protected readonly auth = inject(AuthService);
  private readonly cv = inject(CvService);
  private readonly http = inject(HttpClient);

  protected readonly p = this.profiles.profile;
  protected readonly levels: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  protected readonly modeOptions: { id: WorkMode; label: string }[] = [
    { id: 'onsite', label: 'Presencial (en mi país)' },
    { id: 'hybrid', label: 'Híbrido (en mi país)' },
    { id: 'remote', label: 'Remoto (empresas de cualquier país que me admitan)' },
  ];
  protected readonly weightKeys = COMPONENT_ORDER;
  protected readonly weightLabel = WEIGHT_LABEL;
  protected readonly cvState = signal<'idle' | 'reading' | 'done' | 'error'>('idle');
  protected readonly cvError = signal<string | null>(null);
  protected readonly cvResult = signal<CvAnalysis | null>(null);
  protected readonly ghUser = signal(this.profiles.profile().githubUser ?? '');
  protected readonly ghError = signal<string | null>(null);
  protected readonly ghResult = signal<{ analyses: RepoAnalysis[]; demonstrated: DemonstratedSkill[] } | null>(null);
  protected readonly syncState = signal<string | null>(null);
  private ghToken = '';

  protected readonly catalogOptions = computed(() => (this.data.skills()?.skills ?? []).map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly weights = computed(() => ({ ...(this.data.scoring()?.weights ?? {}), ...(this.p().weights ?? {}) }) as Weights);
  protected readonly weightTotal = computed(() => COMPONENT_ORDER.reduce((s, k) => s + (this.weights()[k] ?? 0), 0));
  protected readonly demonstratedIds = computed(() => new Set(this.p().demonstrated.map((d) => d.id)));
  protected readonly declaredOnly = computed(() => this.p().declared.filter((id) => !this.demonstratedIds().has(id)));

  protected name(id: string): string {
    return this.data.skillName(id);
  }

  async onCv(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.cvState.set('reading');
    this.cvError.set(null);
    try {
      const text = await this.cv.readPdfText(file);
      this.cvResult.set(this.cv.analyze(text));
      this.cvState.set('done');
    } catch (err) {
      this.cvError.set(err instanceof Error ? err.message : 'No se pudo leer el PDF.');
      this.cvState.set('error');
    }
  }

  applyCv(): void {
    const r = this.cvResult();
    if (!r) return;
    this.profiles.setDeclared([...this.p().declared, ...r.skills.map((s) => s.id)]);
    if (r.yearsOfExperience !== null) this.profiles.setYears(r.yearsOfExperience, 'cv');
    if (r.englishLevel) this.profiles.setEnglish(r.englishLevel);
    this.cvResult.set(null);
    this.cvState.set('idle');
  }

  async analyzeGithub(): Promise<void> {
    this.ghError.set(null);
    this.ghResult.set(null);
    try {
      const res = await this.github.analyze(this.ghUser(), this.ghToken || null);
      this.ghResult.set(res);
    } catch (err) {
      this.ghError.set(err instanceof Error ? err.message : 'No se pudo analizar GitHub.');
    }
  }

  setToken(value: string): void {
    this.ghToken = value;
  }

  applyGithub(): void {
    const r = this.ghResult();
    if (!r) return;
    this.profiles.update({
      githubUser: this.ghUser().trim() || null,
      demonstrated: r.demonstrated.map((d) => ({ id: d.id, repos: d.repos, evidence: d.evidence.slice(0, 3).map((e) => ({ repo: e.repo, path: e.path, detail: e.detail })) })),
      repos: r.analyses.map((a) => ({ name: a.repo, url: a.url, pushedAt: a.pushedAt, skills: a.skills.map((s) => s.id) })),
    });
    this.ghResult.set(null);
  }

  addSkill(value: string): void {
    const match = this.catalogOptions().find((o) => o.name.toLowerCase() === value.trim().toLowerCase() || o.id === value.trim());
    if (match) this.profiles.addDeclared(match.id);
  }

  setNumber(field: 'yearsOfExperience' | 'minSalaryUsd', value: string): void {
    const n = value === '' ? null : Number(value);
    if (field === 'yearsOfExperience') this.profiles.setYears(n, 'manual');
    else this.profiles.update({ minSalaryUsd: n === null || Number.isNaN(n) ? null : Math.max(0, n) });
  }

  setWeight(key: keyof Weights, value: string): void {
    this.profiles.setWeights({ ...this.weights(), [key]: Number(value) });
  }

  clearAll(): void {
    if (confirm('¿Borrar tu perfil de este dispositivo? No afecta a tu cuenta.')) this.profiles.clear();
  }

  /** Sube solo identificadores de habilidades, su origen y años: nunca el CV ni su texto. */
  async syncToAccount(): Promise<void> {
    this.syncState.set('Guardando…');
    const p = this.p();
    const skills = [
      ...p.demonstrated.map((d) => ({ skillId: d.id, escoUri: this.data.matcher()?.byId(d.id)?.esco?.uri ?? null, origin: 'DEMONSTRATED', repos: d.repos })),
      ...this.declaredOnly().map((id) => ({ skillId: id, escoUri: this.data.matcher()?.byId(id)?.esco?.uri ?? null, origin: 'DECLARED', repos: [] })),
    ];
    try {
      await firstValueFrom(this.http.put(this.auth.api('/api/v1/me/profile'), {
        homeCountry: p.homeCountry,
        homeCity: p.homeCity,
        modalities: p.modalities,
        acceptsRelocation: p.acceptsRelocation,
        yearsOfExperience: p.yearsOfExperience,
        englishLevel: p.englishLevel,
        minSalaryUsd: p.minSalaryUsd,
        weights: p.weights,
        githubUser: p.githubUser,
      }));
      await firstValueFrom(this.http.put(this.auth.api('/api/v1/me/skills'), skills));
      await firstValueFrom(this.http.put(this.auth.api('/api/v1/me/repos'), p.repos.map((r) => ({ name: r.name, url: r.url, pushedAt: r.pushedAt, skills: r.skills }))));
      this.syncState.set('Perfil guardado en tu cuenta.');
    } catch {
      this.syncState.set('No se pudo guardar: revisa que aceptaste la finalidad «guardar mi perfil» en Cuenta.');
    }
  }
}

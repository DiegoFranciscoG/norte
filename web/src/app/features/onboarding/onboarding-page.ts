import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Cefr } from '@norte/core';
import { CvService } from '../../core/cv.service';
import { DataService } from '../../core/data.service';
import { countryName } from '../../core/format';
import type { WorkMode } from '../../core/models';
import { ProfileService } from '../../core/profile.service';
import { Icon } from '../../shared/icon';
import { LocationPicker } from '../../shared/location-picker';

type Step = 'cv' | 'data' | 'place' | 'modes';
const STEPS: Step[] = ['cv', 'data', 'place', 'modes'];

/**
 * Ingreso guiado: lo primero al entrar. El CV se lee en este navegador (pdf.js) y solo quedan las habilidades
 * detectadas; luego la persona revisa sus datos, indica dónde vive y cómo quiere trabajar.
 */
@Component({
  selector: 'app-onboarding-page',
  imports: [Icon, LocationPicker, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './onboarding-page.html',
  styleUrl: './onboarding-page.scss',
})
export class OnboardingPage {
  private readonly cv = inject(CvService);
  private readonly router = inject(Router);
  protected readonly data = inject(DataService);
  protected readonly profiles = inject(ProfileService);
  protected readonly p = this.profiles.profile;

  protected readonly step = signal<Step>('cv');
  protected readonly stepNumber = computed(() => STEPS.indexOf(this.step()) + 1);
  protected readonly total = STEPS.length;
  protected readonly cvState = signal<'idle' | 'reading' | 'done' | 'error'>('idle');
  protected readonly cvError = signal<string | null>(null);
  protected readonly found = signal<{ skills: number; years: number | null; english: Cefr | null } | null>(null);
  protected readonly levels: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  protected readonly catalog = computed(() => (this.data.skills()?.skills ?? []).map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly skills = computed(() => [...new Set([...this.p().demonstrated.map((d) => d.id), ...this.p().declared])].map((id) => ({ id, name: this.data.skillName(id) })));
  protected readonly country = computed(() => countryName(this.p().homeCountry) || 'tu país');
  protected readonly modes: { id: WorkMode; title: string; icon: string; detail: () => string }[] = [
    { id: 'onsite', title: 'Presencial', icon: 'building', detail: () => `En ${this.country()}, primero cerca de tu ciudad.` },
    { id: 'hybrid', title: 'Híbrido', icon: 'pin', detail: () => `En ${this.country()}: unos días en oficina.` },
    { id: 'remote', title: 'Remoto', icon: 'laptop', detail: () => `Desde ${this.country()}, para empresas de cualquier país que te admitan.` },
  ];

  async onCv(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.cvState.set('reading');
    this.cvError.set(null);
    try {
      const r = this.cv.analyze(await this.cv.readPdfText(file));
      this.profiles.setDeclared([...this.p().declared, ...r.skills.map((s) => s.id)]);
      if (r.yearsOfExperience !== null) this.profiles.setYears(r.yearsOfExperience, 'cv');
      if (r.englishLevel) this.profiles.setEnglish(r.englishLevel);
      this.found.set({ skills: r.skills.length, years: r.yearsOfExperience, english: r.englishLevel });
      this.cvState.set('done');
    } catch (err) {
      this.cvError.set(err instanceof Error ? err.message : 'No se pudo leer el PDF.');
      this.cvState.set('error');
    }
  }

  protected addSkill(value: string): void {
    const v = value.trim().toLowerCase();
    const match = this.catalog().find((o) => o.name.toLowerCase() === v || o.id === v);
    if (match) this.profiles.addDeclared(match.id);
  }

  protected setYears(value: string): void {
    this.profiles.setYears(value === '' ? null : Number(value), 'manual');
  }

  protected setSalary(value: string): void {
    const n = value === '' ? null : Number(value);
    this.profiles.update({ minSalaryUsd: n === null || Number.isNaN(n) ? null : Math.max(0, n) });
  }

  protected go(step: Step): void {
    this.step.set(step);
    queueMicrotask(() => document.getElementById('onb-title')?.focus());
  }

  protected next(): void {
    const i = STEPS.indexOf(this.step());
    if (i < STEPS.length - 1) this.go(STEPS[i + 1]!);
    else this.finish();
  }

  protected back(): void {
    const i = STEPS.indexOf(this.step());
    if (i > 0) this.go(STEPS[i - 1]!);
  }

  protected finish(): void {
    this.profiles.completeOnboarding();
    void this.router.navigateByUrl('/');
  }
}

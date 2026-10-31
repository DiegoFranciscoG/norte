import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { analyzeGap, profileSets, type Job, type ScoreResult } from '@norte/core';
import { ApplicationsService } from '../../core/applications.service';
import { DataService } from '../../core/data.service';
import { EMPLOYMENT_LABEL, MODALITY_LABEL, SENIORITY_LABEL, avatarColor, initials, locationLabel, salaryLabel, slug, timeAgo } from '../../core/format';
import { ProfileService } from '../../core/profile.service';
import { Icon } from '../../shared/icon';

const COMPONENT_LABEL: Record<string, string> = {
  demonstrated: 'Habilidades demostradas',
  declared: 'Habilidades declaradas',
  experience: 'Nivel y experiencia',
  location: 'Ubicación',
  language: 'Idioma',
  compensation: 'Compensación',
  freshness: 'Frescura',
};

@Component({
  selector: 'app-job-detail',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-detail.html',
  styleUrl: './job-detail.scss',
})
export class JobDetail {
  private readonly data = inject(DataService);
  private readonly profiles = inject(ProfileService);
  protected readonly apps = inject(ApplicationsService);

  readonly job = input.required<Job>();
  readonly score = input<ScoreResult | null>(null);
  protected readonly showBreakdown = signal(false);
  protected readonly labels = COMPONENT_LABEL;

  protected readonly initials = computed(() => initials(this.job().company.name));
  protected readonly color = computed(() => avatarColor(this.job().company.name));
  protected readonly location = computed(() => locationLabel(this.job()));
  protected readonly ago = computed(() => timeAgo(this.job().publishedAt));
  protected readonly salary = computed(() => salaryLabel(this.job()));
  protected readonly modality = computed(() => MODALITY_LABEL[this.job().modality]);
  protected readonly employment = computed(() => EMPLOYMENT_LABEL[this.job().employmentType]);
  protected readonly seniority = computed(() => SENIORITY_LABEL[this.job().seniority]);
  protected readonly applyUrl = computed(() => this.job().sources[0]?.applyUrl ?? this.job().sources[0]?.url ?? '#');
  protected readonly saved = computed(() => this.apps.byJob().get(this.job().id) ?? null);
  protected readonly hasProfile = this.profiles.hasProfile;

  protected readonly skills = computed(() => {
    const matcher = this.data.matcher();
    const sets = matcher ? profileSets(this.profiles.coreProfile(), matcher) : { demonstrated: new Set<string>(), declared: new Set<string>() };
    return this.job().skills.map((s) => ({
      id: s.id,
      name: this.data.skillName(s.id),
      optional: s.optional,
      state: sets.demonstrated.has(s.id) ? 'demonstrated' : sets.declared.has(s.id) ? 'declared' : 'missing',
    }));
  });

  protected readonly gap = computed(() => {
    const matcher = this.data.matcher();
    const config = this.data.scoring();
    if (!matcher || !config || !this.hasProfile()) return null;
    return analyzeGap(this.job(), this.profiles.coreProfile(), { matcher, config, now: new Date(), repos: this.profiles.profile().repos, resources: this.data.learning().resources });
  });

  protected readonly requirements = computed(() => {
    const j = this.job();
    const out: string[] = [];
    if (j.yearsRequired !== null) out.push(`${j.yearsRequired}+ años de experiencia`);
    for (const l of j.languages) {
      const name = l.language === 'en' ? 'Inglés' : l.language === 'pt' ? 'Portugués' : l.language;
      out.push(`${name} ${l.level ?? '(nivel no indicado)'}${l.inferred ? ' · inferido porque el aviso está en ese idioma' : ''}`);
    }
    return out;
  });

  protected readonly deepLinks = computed(() => {
    const j = this.job();
    const q = j.title.replace(/[([].*?[)\]]/g, '').trim();
    const loc = j.location.city ?? 'Ecuador';
    return this.data.deepLinks().map((d) => ({
      name: d.name,
      url: d.template.replace('{q}', d.slugify ? slug(q) : encodeURIComponent(q)).replace('{loc}', encodeURIComponent(loc)),
    }));
  });

  protected names(ids: string[]): string {
    return ids.map((id) => this.data.skillName(id)).join(', ');
  }

  protected pct(points: number, max: number): number {
    return max > 0 ? Math.round((points / max) * 100) : 0;
  }

  protected round(n: number): number {
    return Math.round(n);
  }

  protected save(): void {
    this.apps.save(this.job());
  }
}

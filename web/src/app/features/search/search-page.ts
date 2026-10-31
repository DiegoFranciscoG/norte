import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GROUP_ORDER, type JobGroup, type Modality, type Seniority } from '@norte/core';
import { DataService } from '../../core/data.service';
import { GROUP_LABEL, MODALITY_LABEL, SENIORITY_LABEL } from '../../core/format';
import { ProfileService } from '../../core/profile.service';
import { SearchService, type Filters } from '../../core/search.service';
import { Icon } from '../../shared/icon';
import { JobCard } from './job-card';
import { JobDetail } from './job-detail';

@Component({
  selector: 'app-search-page',
  imports: [JobCard, JobDetail, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  protected readonly data = inject(DataService);
  protected readonly search = inject(SearchService);
  protected readonly profiles = inject(ProfileService);
  private readonly router = inject(Router);

  protected readonly groups = GROUP_ORDER;
  protected readonly modalities: Modality[] = ['onsite', 'hybrid', 'remote'];
  protected readonly seniorities: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead'];
  protected readonly modalityLabel = MODALITY_LABEL;
  protected readonly seniorityLabel = SENIORITY_LABEL;
  protected readonly f = this.search.filters;

  protected readonly groupLabel = (g: JobGroup) => (g === 'home' ? `${this.data.homeCity()} presencial o híbrido` : GROUP_LABEL[g]);
  protected readonly total = computed(() => Object.values(this.search.counts()).reduce((a, b) => a + b, 0));

  protected setGroup(g: JobGroup): void {
    this.search.set('group', g);
  }

  protected setNullable<K extends keyof Filters>(key: K, value: string): void {
    const v = value === '' ? null : value;
    this.search.set(key, (key === 'minSalary' || key === 'maxDays' ? (v === null ? null : Number(v)) : v) as Filters[K]);
  }

  protected open(id: string): void {
    if (globalThis.matchMedia?.('(max-width: 900px)').matches) void this.router.navigate(['/vacante', id]);
    else this.search.selectedId.set(id);
  }
}

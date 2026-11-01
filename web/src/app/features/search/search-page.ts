import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Seniority } from '@norte/core';
import { DataService } from '../../core/data.service';
import { GROUP_LABEL, SENIORITY_LABEL, countryName, slug } from '../../core/format';
import { ProfileService } from '../../core/profile.service';
import { FEEDS, SearchService, type Feed } from '../../core/search.service';
import { Icon } from '../../shared/icon';
import { JobCard } from './job-card';

const PAGE = 24;

@Component({
  selector: 'app-search-page',
  imports: [JobCard, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  protected readonly data = inject(DataService);
  protected readonly search = inject(SearchService);
  protected readonly profiles = inject(ProfileService);
  protected readonly f = this.search.filters;
  protected readonly feeds = FEEDS;
  protected readonly seniorities: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead'];
  protected readonly seniorityLabel = SENIORITY_LABEL;
  protected readonly shown = signal(PAGE);

  protected readonly visible = computed(() => this.search.results().slice(0, this.shown()));
  protected readonly where = computed(() => {
    const p = this.profiles.profile();
    return p.homeCity ? `${p.homeCity}, ${countryName(p.homeCountry)}` : countryName(p.homeCountry);
  });

  /** Búsquedas en plataformas que prohíben la extracción automatizada: solo un enlace que abre la persona. */
  protected readonly deepLinks = computed(() => {
    const q = this.f().query.trim() || 'desarrollador';
    const p = this.profiles.profile();
    const loc = p.homeCity ?? countryName(p.homeCountry) ?? '';
    return this.data.deepLinks().map((d) => ({
      name: d.name,
      url: d.template.replace('{q}', d.slugify ? slug(q) : encodeURIComponent(q)).replace('{loc}', encodeURIComponent(loc)),
    }));
  });

  protected feedLabel(feed: Feed): string {
    if (feed === 'for-you') return 'Para ti';
    if (feed === 'near' && this.profiles.profile().homeCity) return `En ${this.profiles.profile().homeCity}`;
    const p = this.profiles.profile();
    if (feed === 'country' && p.homeCountry) return p.homeCity ? `Otras ciudades de ${countryName(p.homeCountry)}` : `En ${countryName(p.homeCountry)}`;
    return GROUP_LABEL[feed];
  }

  protected setFeed(feed: Feed): void {
    this.search.set('feed', feed);
    this.shown.set(PAGE);
  }

  protected setNumber(key: 'minSalary' | 'maxDays', value: string): void {
    this.search.set(key, value === '' ? null : Number(value));
    this.shown.set(PAGE);
  }

  protected more(): void {
    this.shown.update((n) => n + PAGE);
  }
}

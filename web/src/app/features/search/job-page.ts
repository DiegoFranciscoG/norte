import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ProfileService } from '../../core/profile.service';
import { SearchService } from '../../core/search.service';
import { Icon } from '../../shared/icon';
import { JobCard } from './job-card';
import { JobDetail } from './job-detail';

/** Ficha de vacante: el detalle a la izquierda y, al lado, más vacantes parecidas que le sirven a la persona. */
@Component({
  selector: 'app-job-page',
  imports: [JobDetail, JobCard, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout">
      <div class="main">
        <a routerLink="/" class="back"><app-icon name="arrowLeft" [size]="18" /> Volver</a>
        @if (job(); as j) {
          <app-job-detail [job]="j" [score]="score()" />
        } @else {
          <p class="notice warn">Esta vacante ya no está en el índice: pudo cerrarse o salir de la ventana de retención.</p>
        }
      </div>
      @if (related().length) {
        <aside class="side" aria-labelledby="related-title">
          <h2 id="related-title">Más para ti</h2>
          <div class="list">
            @for (r of related(); track r.job.id) {
              <app-job-card [item]="r" [fresh]="data.freshIds().has(r.job.id)" (dismiss)="search.dismiss($event)" />
            }
          </div>
        </aside>
      }
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 28px; max-width: 1280px; margin: 0 auto; padding: 12px 24px 48px; }
    .back { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 14px; color: var(--text-2); text-decoration: none; font-weight: 600; }
    .back:hover { color: var(--text); }
    .side h2 { font-size: 1rem; margin: 6px 0 10px; }
    .list { display: grid; gap: 6px; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; padding: 8px 12px 40px; } }
  `,
})
export class JobPage {
  readonly id = input.required<string>();
  protected readonly data = inject(DataService);
  protected readonly search = inject(SearchService);
  private readonly profiles = inject(ProfileService);
  protected readonly job = computed(() => this.data.jobById().get(this.id()) ?? null);
  protected readonly score = computed(() => this.profiles.scores().get(this.id()) ?? null);

  /** Parecidas: comparten habilidades con esta; a igualdad, la de mejor encaje o la más reciente. */
  protected readonly related = computed(() => {
    const job = this.job();
    if (!job) return [];
    const ids = new Set(job.skills.map((s) => s.id));
    return this.search
      .results()
      .filter((r) => r.job.id !== job.id)
      .map((r) => ({ r, shared: r.job.skills.filter((s) => ids.has(s.id)).length }))
      .filter((x) => x.shared > 0)
      .sort((a, b) => b.shared - a.shared || (b.r.score?.total ?? 0) - (a.r.score?.total ?? 0) || b.r.job.publishedAt.localeCompare(a.r.job.publishedAt))
      .slice(0, 8)
      .map((x) => x.r);
  });
}

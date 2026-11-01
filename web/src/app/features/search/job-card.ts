import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApplicationsService } from '../../core/applications.service';
import { MODALITY_LABEL, SENIORITY_LABEL, avatarColor, initials, locationLabel, salaryLabel, timeAgo } from '../../core/format';
import type { ResultItem } from '../../core/search.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-job-card',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="job" [class.fresh]="fresh()" [attr.aria-labelledby]="'t-' + job().id">
      <header class="top">
        <span class="avatar" [style.background]="color()" aria-hidden="true">{{ initials() }}</span>
        <span class="company">{{ job().company.name }}</span>
        <span class="ago">· {{ ago() }}</span>
        @if (fresh()) {
          <span class="tag new">Nueva</span>
        }
      </header>
      <h3 class="title" [id]="'t-' + job().id">
        <a class="stretched" [routerLink]="['/vacante', job().id]">{{ job().title }}</a>
      </h3>
      <p class="where"><app-icon [name]="job().modality === 'remote' ? 'laptop' : 'pin'" [size]="16" /> {{ where() }}</p>
      <ul class="chip-list tags" aria-label="Características">
        @if (job().modality !== 'remote') {
          <li class="tag">{{ modality() }}</li>
        }
        @if (seniority()) {
          <li class="tag">{{ seniority() }}</li>
        }
        @if (salary(); as s) {
          <li class="tag ok">{{ s }}</li>
        }
        @if (item().unknownScope) {
          <li class="tag warn">Confirma si admiten tu país</li>
        }
      </ul>
      <footer class="bottom">
        @if (item().score; as s) {
          <span class="ring" [class.good]="s.fit === 'good'" [style.--p]="s.total" aria-hidden="true"><span>{{ round(s.total) }}</span></span>
          <span class="fit">
            <strong>{{ s.fit === 'good' ? 'Buen encaje' : 'Encaje parcial' }}</strong>
            <span class="small muted">{{ matched() }}</span>
          </span>
          <span class="visually-hidden">Encaje {{ s.total }} de 100.</span>
        } @else {
          <span class="small muted fit">Sube tu CV para ver tu encaje</span>
        }
        <span class="actions">
          <button type="button" class="icon-btn" (click)="save()" [attr.aria-pressed]="saved()" [attr.aria-label]="saved() ? 'Guardada en postulaciones' : 'Guardar ' + job().title">
            <app-icon [name]="saved() ? 'check' : 'bookmark'" [size]="18" />
          </button>
          <button type="button" class="icon-btn" (click)="dismiss.emit(job().id)" [attr.aria-label]="'No me interesa: ' + job().title">
            <app-icon name="x" [size]="18" />
          </button>
        </span>
      </footer>
    </article>
  `,
  styles: `
    :host { display: block; }
    .job { position: relative; display: flex; flex-direction: column; gap: 6px; height: 100%; padding: 14px 14px 10px; border-radius: var(--radius); background: var(--surface); }
    .job:hover { background: var(--surface-2); }
    .job.fresh { box-shadow: inset 0 0 0 2px var(--accent-soft); }
    .top { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--text-2); font-size: 0.88rem; }
    .avatar { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; color: #fff; font-weight: 700; font-size: 0.8rem; flex: none; }
    .company { font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ago { white-space: nowrap; }
    .tag.new { margin-left: auto; }
    .title { margin: 4px 0 0; font-size: 1.02rem; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .stretched { color: var(--text); text-decoration: none; }
    .stretched::after { content: ''; position: absolute; inset: 0; border-radius: var(--radius); }
    .stretched:focus-visible { outline: none; }
    .stretched:focus-visible::after { outline: 2px solid var(--focus); outline-offset: 2px; }
    .where { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--text-2); font-size: 0.9rem; }
    .tags { margin-top: 2px; }
    .bottom { display: flex; align-items: center; gap: 10px; margin-top: auto; padding-top: 8px; }
    .ring { width: 40px; height: 40px; font-size: 0.85rem; }
    .fit { display: grid; line-height: 1.25; font-size: 0.9rem; min-width: 0; }
    .actions { display: flex; margin-left: auto; position: relative; z-index: 1; }
    .icon-btn { display: inline-grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: var(--text-2); cursor: pointer; }
    .icon-btn:hover { background: var(--surface-3); color: var(--text); }
    .icon-btn[aria-pressed='true'] { color: var(--brand); }
  `,
})
export class JobCard {
  private readonly apps = inject(ApplicationsService);
  readonly item = input.required<ResultItem>();
  readonly fresh = input(false);
  readonly dismiss = output<string>();

  protected readonly job = computed(() => this.item().job);
  protected readonly initials = computed(() => initials(this.job().company.name));
  protected readonly color = computed(() => avatarColor(this.job().company.name));
  protected readonly where = computed(() => locationLabel(this.job()));
  protected readonly ago = computed(() => timeAgo(this.job().publishedAt));
  protected readonly salary = computed(() => salaryLabel(this.job()));
  protected readonly modality = computed(() => MODALITY_LABEL[this.job().modality]);
  protected readonly seniority = computed(() => SENIORITY_LABEL[this.job().seniority]);
  protected readonly saved = computed(() => this.apps.byJob().has(this.job().id));
  protected readonly matched = computed(() => {
    const s = this.item().score?.skills;
    if (!s) return '';
    const have = s.demonstrated.length + s.declaredOnly.length;
    const total = have + s.missing.length + s.missingOptional.length;
    return total ? `${have} de ${total} habilidades` : 'Sin habilidades detectadas';
  });

  protected round(n: number): number {
    return Math.round(n);
  }

  protected save(): void {
    if (!this.saved()) this.apps.save(this.job());
  }
}

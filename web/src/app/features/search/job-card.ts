import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Job, ScoreResult } from '@norte/core';
import { avatarColor, initials, locationLabel, timeAgo } from '../../core/format';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-job-card',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card-item" [class.selected]="selected()">
      <div class="avatar" [style.background]="color()" aria-hidden="true">{{ initials() }}</div>
      <div class="body">
        <h3 class="title">
          <a [href]="href()" (click)="$event.preventDefault(); open.emit()" [attr.aria-current]="selected() ? 'true' : null">{{ job().title }}</a>
        </h3>
        <p class="company">{{ job().company.name }}</p>
        <p class="meta">{{ location() }}</p>
        <p class="meta small">
          {{ ago() }}
          @if (job().sources.length > 1) {
            · {{ job().sources.length }} fuentes
          }
          @if (job().salary?.convertible) {
            · <span class="salary">con salario</span>
          }
        </p>
      </div>
      @if (score(); as s) {
        <div class="score" [class.good]="s.fit === 'good'" [attr.aria-label]="'Encaje ' + s.total + ' de 100'">{{ round(s.total) }}</div>
      }
      <button type="button" class="dismiss" (click)="dismiss.emit()" [attr.aria-label]="'Ocultar ' + job().title"><app-icon name="x" [size]="18" /></button>
    </article>
  `,
  styles: `
    .card-item { position: relative; display: grid; grid-template-columns: 52px 1fr auto; gap: 12px; padding: 14px 40px 14px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
    .card-item.selected { background: var(--brand-soft); box-shadow: inset 3px 0 0 var(--brand); }
    .card-item:hover { background: var(--surface-hover); }
    .avatar { width: 52px; height: 52px; border-radius: 8px; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 18px; }
    .title { font-size: 16px; font-weight: 600; line-height: 1.3; }
    .title a { color: var(--brand); }
    .company { margin: 2px 0 0; color: var(--text); font-size: 14px; }
    .meta { margin: 2px 0 0; color: var(--text-2); font-size: 14px; }
    .meta.small { font-size: 13px; color: var(--text-3); }
    .salary { color: var(--accent); font-weight: 600; }
    .score { align-self: start; min-width: 40px; height: 40px; padding: 0 6px; border-radius: 999px; display: grid; place-items: center; font-weight: 700; font-size: 14px; border: 2px solid var(--border-strong); color: var(--text-2); }
    .score.good { border-color: var(--accent); color: var(--accent); }
    .dismiss { position: absolute; top: 10px; right: 8px; border: 0; background: none; color: var(--text-2); width: 30px; height: 30px; border-radius: 999px; cursor: pointer; display: grid; place-items: center; }
    .dismiss:hover { background: var(--surface-hover); color: var(--text); }
  `,
})
export class JobCard {
  readonly job = input.required<Job>();
  readonly score = input<ScoreResult | null>(null);
  readonly selected = input(false);
  readonly open = output<void>();
  readonly dismiss = output<void>();
  protected readonly initials = computed(() => initials(this.job().company.name));
  protected readonly color = computed(() => avatarColor(this.job().company.name));
  protected readonly location = computed(() => locationLabel(this.job()));
  protected readonly ago = computed(() => timeAgo(this.job().publishedAt));
  protected readonly href = computed(() => `vacante/${this.job().id}`);
  protected readonly round = Math.round;
}

import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApplicationsService } from '../../core/applications.service';
import { DataService } from '../../core/data.service';
import { MODALITY_LABEL, SENIORITY_LABEL, locationLabel, salaryLabel, timeAgo } from '../../core/format';
import type { ResultItem } from '../../core/search.service';
import { CompanyLogo } from '../../shared/company-logo';

/**
 * Tarjeta de vacante. Al pasar el cursor (o al enfocarla con el teclado) se despliega debajo una vista previa
 * con la descripción breve, lo que pide y qué tienes o te falta, sin mover el resto de la cuadrícula.
 */
@Component({
  selector: 'app-job-card',
  imports: [RouterLink, CompanyLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="job" [class.fresh]="fresh()" [attr.aria-labelledby]="'t-' + job().id">
      <header class="top">
        <app-company-logo [name]="job().company.name" [logo]="job().company.logo" [size]="36" />
        <div class="who">
          <span class="company">{{ job().company.name }}</span>
          <span class="ago">{{ ago() }}{{ fresh() ? ' · Nueva' : '' }}</span>
        </div>
      </header>
      <h3 class="title" [id]="'t-' + job().id">
        <a class="stretched" [routerLink]="['/vacante', job().id]" [attr.aria-describedby]="'d-' + job().id">{{ job().title }}</a>
      </h3>
      <p class="where">{{ where() }}</p>
      <p class="facts">
        @if (job().modality !== 'remote') {
          <span>{{ modality() }}</span>
        }
        @if (seniority()) {
          <span>{{ seniority() }}</span>
        }
        @if (salary(); as s) {
          <span class="salary">{{ s }}</span>
        }
        @if (item().unknownScope) {
          <span class="warn">Confirma si admiten tu país</span>
        }
      </p>
      <footer class="bottom">
        @if (item().score; as s) {
          <div class="fit" [class.good]="s.fit === 'good'">
            <span class="fit-label"><strong>{{ round(s.total) }}</strong>/100 · {{ s.fit === 'good' ? 'Buen encaje' : 'Encaje parcial' }}</span>
            <span class="meter" aria-hidden="true"><span [style.width.%]="s.total"></span></span>
          </div>
        } @else {
          <span class="fit small muted">Sube tu CV para ver tu encaje</span>
        }
        <span class="actions">
          <button type="button" class="act" (click)="save()" [attr.aria-pressed]="saved()" [attr.aria-label]="(saved() ? 'Guardada: ' : 'Guardar: ') + job().title">{{ saved() ? 'Guardada' : 'Guardar' }}</button>
          <button type="button" class="act" (click)="dismiss.emit(job().id)" [attr.aria-label]="'Ocultar: ' + job().title">Ocultar</button>
        </span>
      </footer>

      <div class="preview" [id]="'d-' + job().id">
        <p class="excerpt">{{ job().excerpt || 'La fuente no publicó una descripción.' }}</p>
        @if (asks().length) {
          <p class="line"><span class="k">Pide</span> {{ asks().join(' · ') }}</p>
        }
        @if (item().score; as s) {
          @if (have().length) {
            <p class="line"><span class="k">Tienes</span> {{ have().join(', ') }}</p>
          }
          @if (missing().length) {
            <p class="line"><span class="k">Te falta</span> {{ missing().join(', ') }}</p>
          }
        }
        <p class="line source">Publicada en {{ sourceName() }} · {{ ago() }}</p>
      </div>
    </article>
  `,
  styles: `
    :host { display: block; position: relative; }
    .job { position: relative; display: flex; flex-direction: column; gap: 6px; height: 100%; padding: 14px 16px 12px; border-radius: 12px; background: var(--surface); border: 1px solid transparent; }
    .job.fresh { border-color: var(--accent-soft); }
    .top { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .who { display: grid; min-width: 0; line-height: 1.25; }
    .company { font-weight: 600; font-size: 0.9rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ago { font-size: 0.8rem; color: var(--text-3); }
    .title { margin: 6px 0 0; font-size: 1.02rem; font-weight: 650; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .stretched { color: var(--text); text-decoration: none; }
    .stretched::after { content: ''; position: absolute; inset: 0; border-radius: 12px; }
    .stretched:focus-visible { outline: none; }
    .stretched:focus-visible::after { outline: 2px solid var(--focus); outline-offset: 2px; }
    .where { margin: 0; color: var(--text-2); font-size: 0.88rem; }
    .facts { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; font-size: 0.84rem; color: var(--text-2); }
    .facts .salary { color: var(--text); font-weight: 600; }
    .facts .warn { color: var(--warn); }
    .bottom { display: flex; align-items: center; gap: 12px; margin-top: auto; padding-top: 10px; }
    .fit { display: grid; gap: 4px; min-width: 0; flex: 1; font-size: 0.84rem; color: var(--text-2); }
    .fit strong { color: var(--text); font-size: 0.95rem; }
    .meter { display: block; height: 4px; max-width: 160px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
    .meter span { display: block; height: 100%; border-radius: 999px; background: var(--text-3); }
    .fit.good .meter span { background: var(--brand); }
    .actions { display: flex; gap: 2px; position: relative; z-index: 2; }
    .act { padding: 6px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text-2); font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
    .act:hover { background: var(--surface-3); color: var(--text); }
    .act[aria-pressed='true'] { color: var(--brand); }

    /* Vista previa: aparece bajo la tarjeta tras una breve pausa, sin desplazar la cuadrícula. */
    .preview { position: absolute; left: -1px; right: -1px; top: 100%; z-index: 3; display: grid; gap: 6px; padding: 4px 16px 14px; background: var(--surface); border-radius: 0 0 12px 12px; box-shadow: var(--shadow-pop); clip-path: inset(0 -40px -40px -40px); opacity: 0; visibility: hidden; transition: opacity 0.12s ease, visibility 0s linear 0.12s; }
    .excerpt { margin: 0; font-size: 0.86rem; line-height: 1.45; color: var(--text); display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    .line { margin: 0; font-size: 0.82rem; color: var(--text-2); }
    .k { display: inline-block; min-width: 58px; font-weight: 700; color: var(--text); }
    .source { color: var(--text-3); }
    @media (hover: hover) {
      .job:hover, .job:focus-within { z-index: 20; background: var(--surface); box-shadow: var(--shadow-pop); border-radius: 12px 12px 0 0; }
      .job:hover .preview, .job:focus-within .preview { opacity: 1; visibility: visible; transition: opacity 0.18s ease 0.35s, visibility 0s linear 0.35s; }
    }
    @media (hover: none) { .preview { display: none; } }
    @media (prefers-reduced-motion: reduce) { .preview, .job:hover .preview { transition: none; } }
  `,
})
export class JobCard {
  private readonly apps = inject(ApplicationsService);
  private readonly data = inject(DataService);
  readonly item = input.required<ResultItem>();
  readonly fresh = input(false);
  readonly dismiss = output<string>();

  protected readonly job = computed(() => this.item().job);
  protected readonly where = computed(() => locationLabel(this.job()));
  protected readonly ago = computed(() => timeAgo(this.job().publishedAt));
  protected readonly salary = computed(() => salaryLabel(this.job()));
  protected readonly modality = computed(() => MODALITY_LABEL[this.job().modality]);
  protected readonly seniority = computed(() => SENIORITY_LABEL[this.job().seniority]);
  protected readonly saved = computed(() => this.apps.byJob().has(this.job().id));
  protected readonly sourceName = computed(() => this.job().sources[0]?.sourceName ?? 'la fuente');
  protected readonly asks = computed(() => {
    const j = this.job();
    const out: string[] = [];
    if (j.yearsRequired !== null) out.push(`${j.yearsRequired}+ años`);
    const en = j.languages.find((l) => l.language === 'en');
    if (en) out.push(`inglés ${en.level ?? '(nivel no indicado)'}`);
    out.push(...j.skills.filter((s) => !s.optional).slice(0, 4).map((s) => this.data.skillName(s.id)));
    return out;
  });
  protected readonly have = computed(() => {
    const s = this.item().score?.skills;
    return s ? [...s.demonstrated, ...s.declaredOnly].slice(0, 5).map((id) => this.data.skillName(id)) : [];
  });
  protected readonly missing = computed(() => (this.item().score?.skills.missing ?? []).slice(0, 5).map((id) => this.data.skillName(id)));

  protected round(n: number): number {
    return Math.round(n);
  }

  protected save(): void {
    if (!this.saved()) this.apps.save(this.job());
  }
}

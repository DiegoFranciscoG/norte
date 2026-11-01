import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { stamp } from '../../core/format';
import { BarChart, fmt, type ChartRow } from '../../shared/charts';
import { Icon } from '../../shared/icon';
import { STATS, type Report, type SalaryStat } from './models';

/** Informe automático de un mes: frases redactadas desde las cifras, cada cifra con su fuente y fecha. */
@Component({
  selector: 'app-report-page',
  imports: [BarChart, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="report">
      <a routerLink="/observatorio" class="back"><app-icon name="arrowLeft" [size]="18" /> Observatorio</a>
      @if (error()) {
        <p class="notice warn">{{ error() }}</p>
      } @else if (report(); as r) {
        <header>
          <p class="kicker">Informe mensual{{ r.complete ? '' : ' · mes en curso' }}</p>
          <h1>El mercado tech accesible desde Ecuador en {{ r.label }}</h1>
          <p class="small muted">Generado {{ stamp(r.generatedAt) }} · {{ r.license }}</p>
        </header>
        @if (r.demo) {
          <p class="notice warn">Informe de demostración con datos ficticios.</p>
        }
        <section class="tiles" aria-label="Cifras del mes">
          <div class="tile"><span class="label">Vacantes nuevas</span><span class="value">{{ fmt(r.newJobs) }}</span>
            @if (r.changePct !== null && r.previous) {
              <span class="small muted">{{ r.changePct > 0 ? '+' : '' }}{{ fmt(r.changePct, 1) }} % vs. {{ r.previous.label }}</span>
            }
          </div>
          <div class="tile"><span class="label">Remotas</span><span class="value">{{ fmt(r.remoteShare, 1) }} %</span></div>
          <div class="tile"><span class="label">Ubicadas en Ecuador</span><span class="value">{{ fmt(r.ecuadorShare, 1) }} %</span></div>
          <div class="tile"><span class="label">Publican salario</span><span class="value">{{ fmt(r.withSalaryShare, 1) }} %</span></div>
        </section>
        <section class="panel" aria-labelledby="h-title">
          <h2 id="h-title">Lo más importante</h2>
          <ul class="highlights">
            @for (h of r.highlights; track h) {
              <li>{{ h }}</li>
            }
          </ul>
        </section>
        <section class="panel" aria-labelledby="s-title">
          <h2 id="s-title">Habilidades más pedidas en vacantes nuevas</h2>
          <app-bar-chart [rows]="skills()" caption="Habilidades más pedidas del mes, en porcentaje de vacantes nuevas" labelHeader="Habilidad" valueHeader="% de vacantes nuevas" />
        </section>
        <div class="cols">
          <section class="panel" aria-labelledby="c-title">
            <h2 id="c-title">Ciudades</h2>
            <table class="table">
              <thead><tr><th scope="col">Ciudad</th><th scope="col" class="num">Nuevas</th><th scope="col" class="num">Mes anterior</th></tr></thead>
              <tbody>
                @for (c of r.cities; track c.city) {
                  <tr><td>{{ c.city }}</td><td class="num">{{ c.newJobs }}</td><td class="num">{{ c.previous ?? '—' }}</td></tr>
                }
              </tbody>
            </table>
          </section>
          <section class="panel" aria-labelledby="e-title">
            <h2 id="e-title">Empresas y salarios</h2>
            <ul class="plain">
              @for (e of r.topCompanies; track e.name) {
                <li>{{ e.name }} · {{ e.count }}</li>
              }
            </ul>
            @for (m of r.salary; track m.market) {
              <p class="small"><strong>{{ m.label }}:</strong> {{ salary(m) }}</p>
            }
          </section>
        </div>
        <section class="panel" aria-labelledby="f-title">
          <h2 id="f-title">Fuentes y metodología</h2>
          <p class="small">@for (src of r.sources; track src.name; let last = $last) { {{ src.name }} ({{ src.count }}){{ last ? '.' : ',' }} }</p>
          <ul class="small muted">
            @for (m of r.methodology; track m) {
              <li>{{ m }}</li>
            }
          </ul>
        </section>
      } @else {
        <p class="muted" role="status">Cargando informe…</p>
      }
    </div>
  `,
  styles: `
    .report { max-width: 980px; margin: 0 auto; padding: 16px 24px 48px; }
    .back { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 12px; color: var(--text-2); text-decoration: none; font-weight: 600; }
    .kicker { margin: 0; color: var(--brand); font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; }
    h1 { font-size: 1.7rem; margin-top: 4px; }
    .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
    .tile { display: grid; gap: 2px; padding: 14px 16px; border-radius: var(--radius); background: var(--surface-2); }
    .tile .label { font-size: 0.86rem; color: var(--text-2); }
    .tile .value { font-size: 1.6rem; font-weight: 700; }
    .panel { margin-bottom: 14px; padding: 18px 20px; border-radius: var(--radius); border: 1px solid var(--border); }
    .panel h2 { font-size: 1.05rem; }
    .highlights { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 1.02rem; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .plain { margin: 0 0 10px; padding-left: 18px; }
    @media (max-width: 760px) { .tiles { grid-template-columns: 1fr 1fr; } .cols { grid-template-columns: 1fr; } .report { padding: 12px 12px 40px; } }
  `,
})
export class ReportPage {
  readonly month = input.required<string>();
  private readonly data = inject(DataService);
  protected readonly report = signal<Report | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly fmt = fmt;
  protected readonly stamp = stamp;

  constructor() {
    effect(() => {
      const month = this.month();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        this.error.set('Mes no válido.');
        return;
      }
      this.data
        .getJson<Report>(`${STATS}reports/${month}.json`)
        .then((r) => this.report.set(r))
        .catch(() => this.error.set('No hay informe para ese mes.'));
    });
  }

  protected readonly skills = computed<ChartRow[]>(() =>
    (this.report()?.topSkills ?? []).map((s) => ({
      label: s.name,
      value: s.share ?? 0,
      display: `${fmt(s.share, 1)} %`,
      note: s.deltaPp === null ? `${s.count} vacantes` : `${s.count} vacantes · ${s.deltaPp > 0 ? '+' : ''}${fmt(s.deltaPp, 1)} pts vs. mes anterior`,
    })),
  );

  protected salary(s: SalaryStat): string {
    if (s.n === 0) return 'sin datos';
    if (s.suppressed) return `muestra insuficiente (${s.n})`;
    return `mediana $${fmt(s.medianUsd)} (P25–P75: $${fmt(s.p25Usd)}–$${fmt(s.p75Usd)})`;
  }
}

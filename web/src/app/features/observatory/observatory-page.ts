import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { stamp } from '../../core/format';
import { BarChart, ColumnChart, DeltaBars, fmt, type ChartRow } from '../../shared/charts';
import { Icon } from '../../shared/icon';
import { STATS, type MonthlyFile, type ReportIndex, type SalaryStat, type Summary } from './models';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const CSV = [
  { file: 'skills.csv', label: 'Habilidades más pedidas' },
  { file: 'monthly.csv', label: 'Serie mensual' },
  { file: 'monthly-skills.csv', label: 'Habilidades por mes' },
  { file: 'cities.csv', label: 'Ciudades' },
  { file: 'salaries.csv', label: 'Salarios por rol y nivel' },
  { file: 'companies.csv', label: 'Empresas' },
];

/** Observatorio público del mercado tecnológico accesible desde Ecuador: todo sale de los JSON estáticos de la ingesta. */
@Component({
  selector: 'app-observatory-page',
  imports: [BarChart, ColumnChart, DeltaBars, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './observatory-page.html',
  styleUrl: './observatory-page.scss',
})
export class ObservatoryPage {
  private readonly data = inject(DataService);
  protected readonly summary = signal<Summary | null>(null);
  protected readonly monthly = signal<MonthlyFile | null>(null);
  protected readonly reports = signal<ReportIndex | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly csv = CSV.map((c) => ({ ...c, url: STATS + c.file }));
  protected readonly apiUrl = STATS + 'api.json';
  protected readonly fmt = fmt;
  protected readonly stamp = stamp;

  constructor() {
    Promise.all([
      this.data.getJson<Summary>(`${STATS}summary.json`),
      this.data.getJson<MonthlyFile>(`${STATS}monthly.json`).catch(() => null),
      this.data.getJson<ReportIndex>(`${STATS}reports/index.json`).catch(() => null),
    ])
      .then(([s, m, r]) => {
        this.summary.set(s);
        this.monthly.set(m);
        this.reports.set(r);
      })
      .catch(() => this.error.set('Las estadísticas todavía no están publicadas. Se generan con cada ingesta.'));
  }

  protected readonly skills = computed<ChartRow[]>(() =>
    (this.summary()?.topSkills ?? []).slice(0, 15).map((s) => ({ label: s.name, value: s.share ?? 0, display: `${fmt(s.share, 1)} %`, note: `${s.count} vacantes abiertas` })),
  );
  protected readonly companies = computed<ChartRow[]>(() => (this.summary()?.topCompanies ?? []).map((c) => ({ label: c.name, value: c.count, note: `${fmt(c.share, 1)} % de las abiertas` })));
  protected readonly cityRows = computed<ChartRow[]>(() =>
    (this.summary()?.cities ?? []).map((c) => ({ label: c.city, value: c.open, note: `${fmt(c.share, 1)} % de las ubicadas en Ecuador · ${c.modality.onsite} presenciales, ${c.modality.hybrid} híbridas` })),
  );
  protected readonly weeks = computed<ChartRow[]>(() => {
    const t = this.summary()?.trend;
    return t ? t.weekStarts.map((d, i) => ({ label: `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`, value: t.weeklyTotals[i] ?? 0, display: `${t.weeklyTotals[i] ?? 0}` })) : [];
  });
  protected readonly movers = computed<ChartRow[]>(() => {
    const t = this.summary()?.trend;
    if (!t || t.status !== 'ok') return [];
    return [...t.rising, ...t.falling].map((m) => ({ label: m.name, value: m.deltaPp, note: `${fmt(m.firstHalfShare, 1)} % → ${fmt(m.secondHalfShare, 1)} % de las vacantes` }));
  });
  protected readonly months = computed<ChartRow[]>(() =>
    (this.monthly()?.months ?? []).map((m) => ({ label: `${MONTHS[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(2, 4)}`, value: m.newJobs, display: `${m.newJobs}${m.frozen ? '' : ' (en curso)'}` })),
  );

  protected salary(s: SalaryStat): string {
    if (s.n === 0) return 'Sin datos';
    if (s.suppressed) return `Muestra insuficiente (${s.n})`;
    return `$${fmt(s.medianUsd)} · $${fmt(s.p25Usd)}–$${fmt(s.p75Usd)}`;
  }
}

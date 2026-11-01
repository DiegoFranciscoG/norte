import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

export interface ChartRow {
  label: string;
  value: number;
  /** Texto del valor (por ejemplo «12 · 30 %»); si falta, se usa el número. */
  display?: string;
  /** Detalle extra para el tooltip y la tabla. */
  note?: string;
}

/** Formato español: punto para miles, coma decimal. */
export function fmt(x: number | null | undefined, decimals = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  const [int, dec] = Math.abs(x).toFixed(decimals).split('.') as [string, string | undefined];
  return `${x < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? `,${dec}` : ''}`;
}

/** Tope «limpio» del eje: 1, 2 o 5 por potencia de diez. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/**
 * Barras horizontales de una sola serie (magnitud): un color, barras finas que crecen desde la misma base,
 * extremo redondeado de 4 px, valor en la punta con tinta de texto, tooltip al pasar o enfocar y tabla accesible.
 */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="chart">
      <figcaption class="visually-hidden">{{ caption() }}</figcaption>
      @if (!table()) {
        <div class="bars" role="list" [attr.aria-label]="caption()">
          @for (r of rows(); track r.label; let i = $index) {
            <div class="row" role="listitem" tabindex="0" [attr.aria-label]="r.label + ': ' + (r.display ?? r.value) + (r.note ? '. ' + r.note : '')"
                 (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)" (focus)="hover.set(i)" (blur)="hover.set(null)">
              <span class="label" [title]="r.label">{{ r.label }}</span>
              <span class="track">
                <span class="bar" [style.width.%]="pct(r.value)"></span>
                <span class="value">{{ r.display ?? fmtValue(r.value) }}</span>
                @if (hover() === i && r.note) {
                  <span class="tip" role="tooltip">{{ r.label }} · {{ r.display ?? fmtValue(r.value) }}<br />{{ r.note }}</span>
                }
              </span>
            </div>
          }
        </div>
      } @else {
        <table class="table">
          <caption class="visually-hidden">{{ caption() }}</caption>
          <thead><tr><th scope="col">{{ labelHeader() }}</th><th scope="col" class="num">{{ valueHeader() }}</th>@if (hasNotes()) {<th scope="col">Detalle</th>}</tr></thead>
          <tbody>
            @for (r of rows(); track r.label) {
              <tr><td>{{ r.label }}</td><td class="num">{{ r.display ?? fmtValue(r.value) }}</td>@if (hasNotes()) {<td>{{ r.note }}</td>}</tr>
            }
          </tbody>
        </table>
      }
      <button type="button" class="link" (click)="table.set(!table())">{{ table() ? 'Ver gráfico' : 'Ver como tabla' }}</button>
    </figure>
  `,
  styles: `
    .chart { margin: 0; }
    .bars { display: grid; gap: 6px; }
    .row { display: grid; grid-template-columns: minmax(90px, 32%) 1fr; align-items: center; gap: 12px; padding: 2px 4px; border-radius: 8px; outline-offset: 0; }
    .row:hover, .row:focus-visible { background: var(--surface-2); }
    .label { font-size: 0.9rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track { position: relative; display: flex; align-items: center; gap: 8px; min-height: 26px; border-left: 1px solid var(--axis); }
    .bar { height: 16px; min-width: 2px; border-radius: 0 4px 4px 0; background: var(--series-1); }
    .value { font-size: 0.84rem; color: var(--text-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .tip { position: absolute; left: 8px; bottom: calc(100% + 4px); z-index: 5; padding: 6px 10px; border-radius: 8px; background: var(--text); color: var(--bg); font-size: 0.8rem; white-space: nowrap; pointer-events: none; }
    .link { margin-top: 8px; padding: 0; border: 0; background: none; color: var(--brand); font: inherit; font-size: 0.86rem; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  `,
})
export class BarChart {
  readonly rows = input.required<ChartRow[]>();
  readonly caption = input.required<string>();
  readonly labelHeader = input('Elemento');
  readonly valueHeader = input('Valor');
  readonly decimals = input(0);
  protected readonly hover = signal<number | null>(null);
  protected readonly table = signal(false);
  private readonly max = computed(() => Math.max(1, ...this.rows().map((r) => r.value)));
  protected readonly hasNotes = computed(() => this.rows().some((r) => r.note));

  protected pct(v: number): number {
    return Math.max(0, (v / this.max()) * 100);
  }

  protected fmtValue(v: number): string {
    return fmt(v, this.decimals());
  }
}

/** Columnas para una serie en el tiempo (vacantes por semana o por mes): base única, etiqueta solo en la última. */
@Component({
  selector: 'app-column-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="chart">
      <figcaption class="visually-hidden">{{ caption() }}</figcaption>
      @if (!table()) {
        <div class="plot" role="list" [attr.aria-label]="caption()">
          <span class="tick top" aria-hidden="true">{{ fmtValue(top()) }}</span>
          <span class="tick mid" aria-hidden="true">{{ fmtValue(top() / 2) }}</span>
          <span class="grid g1" aria-hidden="true"></span>
          <span class="grid g2" aria-hidden="true"></span>
          <div class="cols" [style.grid-template-columns]="'repeat(' + points().length + ', 1fr)'">
            @for (p of points(); track p.label; let i = $index, last = $last) {
              <div class="col" role="listitem" tabindex="0" [attr.aria-label]="p.label + ': ' + (p.display ?? p.value)"
                   (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)" (focus)="hover.set(i)" (blur)="hover.set(null)">
                <span class="stack">
                  @if (last || hover() === i) {
                    <span class="cap">{{ p.display ?? fmtValue(p.value) }}</span>
                  }
                  <span class="bar" [style.height.%]="(p.value / top()) * 100"></span>
                </span>
                <span class="x" aria-hidden="true">{{ p.label }}</span>
              </div>
            }
          </div>
        </div>
      } @else {
        <table class="table">
          <caption class="visually-hidden">{{ caption() }}</caption>
          <thead><tr><th scope="col">Periodo</th><th scope="col" class="num">{{ valueHeader() }}</th></tr></thead>
          <tbody>
            @for (p of points(); track p.label) {
              <tr><td>{{ p.label }}</td><td class="num">{{ p.display ?? fmtValue(p.value) }}</td></tr>
            }
          </tbody>
        </table>
      }
      <button type="button" class="link" (click)="table.set(!table())">{{ table() ? 'Ver gráfico' : 'Ver como tabla' }}</button>
    </figure>
  `,
  styles: `
    .chart { margin: 0; }
    .plot { position: relative; height: 180px; padding: 0 0 22px 36px; }
    .tick { position: absolute; left: 0; width: 30px; text-align: right; font-size: 0.75rem; color: var(--text-3); font-variant-numeric: tabular-nums; transform: translateY(-50%); }
    .tick.top { top: 0; }
    .tick.mid { top: calc((100% - 22px) / 2); }
    .grid { position: absolute; left: 36px; right: 0; height: 1px; background: var(--grid); }
    .g1 { top: 0; }
    .g2 { top: calc((100% - 22px) / 2); }
    .cols { position: relative; display: grid; height: 100%; gap: 2px; border-bottom: 1px solid var(--axis); }
    .col { position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; border-radius: 6px; outline-offset: 2px; }
    .col:hover, .col:focus-visible { background: var(--surface-2); }
    .stack { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; width: 100%; }
    .bar { width: min(24px, 70%); min-height: 1px; border-radius: 4px 4px 0 0; background: var(--series-1); }
    .cap { font-size: 0.78rem; color: var(--text-2); font-variant-numeric: tabular-nums; margin-bottom: 2px; white-space: nowrap; }
    .x { position: absolute; bottom: -20px; font-size: 0.72rem; color: var(--text-3); white-space: nowrap; }
    .link { margin-top: 8px; padding: 0; border: 0; background: none; color: var(--brand); font: inherit; font-size: 0.86rem; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  `,
})
export class ColumnChart {
  readonly points = input.required<ChartRow[]>();
  readonly caption = input.required<string>();
  readonly valueHeader = input('Valor');
  protected readonly hover = signal<number | null>(null);
  protected readonly table = signal(false);
  protected readonly top = computed(() => niceMax(Math.max(0, ...this.points().map((p) => p.value))));

  protected fmtValue(v: number): string {
    return fmt(v, v < 10 && v % 1 !== 0 ? 1 : 0);
  }
}

/** Barras divergentes (polaridad): sube en azul a la derecha, baja en rojo a la izquierda, siempre con el signo escrito. */
@Component({
  selector: 'app-delta-bars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="deltas" [attr.aria-label]="caption()">
      @for (r of rows(); track r.label) {
        <li class="row" [attr.aria-label]="r.label + ': ' + sign(r.value) + ' puntos porcentuales' + (r.note ? '. ' + r.note : '')" tabindex="0" [title]="r.note ?? ''">
          <span class="label">{{ r.label }}</span>
          <span class="axis">
            <span class="half neg">@if (r.value < 0) {<span class="bar down" [style.width.%]="pct(r.value)"></span>}</span>
            <span class="half pos">@if (r.value > 0) {<span class="bar up" [style.width.%]="pct(r.value)"></span>}</span>
          </span>
          <span class="value">{{ sign(r.value) }} pts</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .deltas { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .row { display: grid; grid-template-columns: minmax(90px, 30%) 1fr 76px; align-items: center; gap: 10px; padding: 2px 4px; border-radius: 8px; }
    .row:hover, .row:focus-visible { background: var(--surface-2); }
    .label { font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .axis { display: grid; grid-template-columns: 1fr 1fr; align-items: center; min-height: 24px; }
    .half { display: flex; align-items: center; height: 100%; }
    .half.neg { justify-content: flex-end; border-right: 1px solid var(--axis); }
    .bar { height: 14px; min-width: 2px; }
    .bar.up { background: var(--series-1); border-radius: 0 4px 4px 0; }
    .bar.down { background: var(--series-neg); border-radius: 4px 0 0 4px; }
    .value { font-size: 0.84rem; color: var(--text-2); text-align: right; font-variant-numeric: tabular-nums; }
  `,
})
export class DeltaBars {
  readonly rows = input.required<ChartRow[]>();
  readonly caption = input.required<string>();
  private readonly max = computed(() => Math.max(1, ...this.rows().map((r) => Math.abs(r.value))));

  protected pct(v: number): number {
    return (Math.abs(v) / this.max()) * 100;
  }

  protected sign(v: number): string {
    return `${v > 0 ? '+' : ''}${fmt(v, 1)}`;
  }
}

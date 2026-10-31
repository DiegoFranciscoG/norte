import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DataService } from '../../core/data.service';

@Component({
  selector: 'app-sources-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <h1 class="page-title">Fuentes y licencias</h1>
      <p class="muted">Solo usamos fuentes que permiten reutilizar sus vacantes. Cada vacante muestra su origen, con enlace y la atribución que la fuente exige.</p>

      @if (data.index(); as idx) {
        <section class="card section">
          <h2>Estado de la última actualización</h2>
          <p class="small muted">Índice {{ idx.build.version }} · {{ idx.build.generatedAt.slice(0, 16) }} UTC · {{ idx.totals.postingsFetched }} publicaciones leídas · {{ idx.totals.duplicatesMerged }} duplicados unidos</p>
          <table>
            <thead><tr><th scope="col">Fuente</th><th scope="col">Estado</th><th scope="col">Leídas</th><th scope="col">Útiles</th></tr></thead>
            <tbody>
              @for (s of sources(); track s.sourceId) {
                <tr>
                  <td>{{ s.sourceName }}</td>
                  <td><span class="tag" [class.ok]="s.status === 'ok'" [class.warn]="s.status !== 'ok'">{{ s.status === 'ok' ? 'ok' : s.status === 'skipped' ? 'respetando su límite' : 'con error' }}</span></td>
                  <td>{{ s.fetched }}</td>
                  <td>{{ s.kept }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      @if (data.sources(); as src) {
        <section class="card section">
          <h2>Portales con API abierta</h2>
          <ul>
            @for (p of src.portals; track p.id) {
              <li><a [href]="p.attribution.url" target="_blank" rel="noopener">{{ p.name }}</a> — {{ p.termsNote }} <a [href]="p.termsUrl" target="_blank" rel="noopener" class="small">términos</a></li>
            }
          </ul>
        </section>
        <section class="card section">
          <h2>Tableros públicos de empresas</h2>
          <p class="small muted">{{ data.companies().length }} empresas verificadas el {{ src.verifiedAt }}. Leemos el tablero que cada empresa publica para que lo lean los agregadores.</p>
          <ul class="cols">
            @for (c of data.companies(); track c.id) {
              <li><a [href]="c.boardUrl" target="_blank" rel="noopener">{{ c.name }}</a> <span class="small muted">{{ c.cities.join(', ') || c.region }} · {{ c.openJobs }} abiertas</span></li>
            }
          </ul>
        </section>
        <section class="card section" id="paginas">
          <h2>Páginas de empleo propias</h2>
          <p class="small muted">Empresas sin tablero abierto: solo enlazamos, nunca extraemos su contenido. Revísalas directamente.</p>
          <ul class="cols">
            @for (p of data.careerPages(); track p.id) {
              <li><a [href]="p.url" target="_blank" rel="noopener">{{ p.name }}</a> <span class="small muted">{{ p.city }}</span></li>
            }
          </ul>
        </section>
        <section class="card section">
          <h2>Fuentes excluidas</h2>
          <ul>
            @for (e of src.excluded; track e.name) {
              <li><strong>{{ e.name }}:</strong> {{ e.reason }} Alternativa: {{ e.alternative.toLowerCase() }}.</li>
            }
          </ul>
        </section>
        <section class="card section" id="algoritmo">
          <h2>Cómo se calcula el encaje</h2>
          <p>Siete componentes con pesos públicos: habilidades demostradas en tu código (30), declaradas en tu CV (15), nivel y experiencia (15), ubicación (15), idioma (10), compensación (10) y frescura (5). El total es la suma exacta del desglose. Un remoto que excluye a Ecuador puntúa cero en ubicación, y una vacante sin salario declarado no te penaliza.</p>
          <p class="small muted">Los salarios en otras monedas se convierten con los tipos de referencia del {{ src.fx.source }}.</p>
        </section>
      }
      @if (data.index(); as idx) {
        <section class="card section">
          <h2>Licencia</h2>
          <p class="small">{{ idx.license.jobs }}</p>
          <p class="small">Estadísticas del observatorio: {{ idx.license.statistics }}</p>
          <p class="small">Habilidades vinculadas a ESCO — © Unión Europea, reutilización conforme a la Decisión 2011/833/EU.</p>
        </section>
      }
    </div>
  `,
  styles: `
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
    ul { padding-left: 20px; }
    .cols { columns: 2 300px; }
    .cols li { break-inside: avoid; margin-bottom: 4px; }
  `,
})
export class SourcesPage {
  protected readonly data = inject(DataService);
  protected readonly sources = computed(() => [...(this.data.index()?.sources ?? [])].sort((a, b) => b.kept - a.kept));
}

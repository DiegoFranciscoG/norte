import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApplicationsService } from '../../core/applications.service';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from '../../core/models';

@Component({
  selector: 'app-applications-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <h1 class="page-title">Postulaciones</h1>
      <p class="muted">Tu tablero de seguimiento. Funciona sin cuenta (se guarda en este dispositivo){{ auth.loggedIn() ? ' y se sincroniza con tu cuenta' : '' }}.</p>
      @if (apps.dueFollowUps().length) {
        <p class="notice warn" role="status">Tienes {{ apps.dueFollowUps().length }} seguimiento(s) para hoy o atrasados.</p>
      }
      @if (syncMsg()) {
        <p class="small" role="status">{{ syncMsg() }}</p>
      }
      @if (auth.loggedIn()) {
        <button type="button" class="btn ghost" (click)="sync()">Sincronizar con mi cuenta</button>
      }
      @if (apps.items().length === 0) {
        <div class="card section empty">
          <p><strong>Aún no guardas vacantes.</strong></p>
          <p class="muted">En la ficha de cualquier vacante usa «Guardar para postular».</p>
          <a class="btn primary" routerLink="/">Buscar vacantes</a>
        </div>
      } @else {
        <div class="board" role="list">
          @for (col of columns(); track col.id) {
            <section class="column card" role="listitem" [attr.aria-labelledby]="'col-' + col.id">
              <h2 [id]="'col-' + col.id">{{ col.label }} <span class="muted">{{ col.items.length }}</span></h2>
              @for (a of col.items; track a.id) {
                <article class="item" [class.due]="isDue(a)">
                  <h3>
                    @if (data.jobById().has(a.jobId)) {
                      <a [routerLink]="['/vacante', a.jobId]">{{ a.title }}</a>
                    } @else {
                      {{ a.title }} <span class="tag warn">cerrada o fuera del índice</span>
                    }
                  </h3>
                  <p class="small muted">{{ a.company }} · guardada {{ a.savedAt.slice(0, 10) }}{{ a.appliedAt ? ' · postulada ' + a.appliedAt : '' }}</p>
                  <div class="controls">
                    <label class="visually-hidden" [for]="'st-' + a.id">Estado</label>
                    <select [id]="'st-' + a.id" (change)="setStatus(a, $any($event.target).value)">
                      @for (s of statuses; track s.id) {
                        <option [value]="s.id" [selected]="a.status === s.id">{{ s.label }}</option>
                      }
                    </select>
                    <label class="visually-hidden" [for]="'fu-' + a.id">Recordatorio de seguimiento</label>
                    <input [id]="'fu-' + a.id" type="date" [value]="a.followUpAt ?? ''" (change)="apps.update(a.id, { followUpAt: $any($event.target).value || null })" title="Recordatorio de seguimiento" />
                  </div>
                  <label class="visually-hidden" [for]="'nt-' + a.id">Notas</label>
                  <textarea [id]="'nt-' + a.id" rows="2" placeholder="Notas (quién respondió, próximos pasos…)" [value]="a.notes" (change)="apps.update(a.id, { notes: $any($event.target).value })"></textarea>
                  <div class="links">
                    @if (a.url) {
                      <a [href]="a.url" target="_blank" rel="noopener">Ver en la fuente</a>
                    }
                    <button type="button" class="btn ghost small-btn" (click)="apps.remove(a.id)" [attr.aria-label]="'Eliminar ' + a.title">Eliminar</button>
                  </div>
                </article>
              }
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .board { display: grid; grid-template-columns: repeat(6, minmax(240px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 8px; margin-top: 12px; }
    .column { padding: 12px; min-height: 120px; background: var(--surface-2); }
    .column h2 { font-size: 15px; margin-bottom: 10px; }
    .item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; margin-bottom: 10px; display: grid; gap: 6px; }
    .item.due { border-color: var(--warn); box-shadow: inset 3px 0 0 var(--warn); }
    .item h3 { font-size: 15px; }
    .controls { display: flex; gap: 6px; flex-wrap: wrap; }
    .controls select, .controls input { flex: 1 1 110px; min-height: 34px; padding: 4px 8px; }
    textarea { width: 100%; min-height: 56px; }
    .links { display: flex; justify-content: space-between; align-items: center; }
    .small-btn { min-height: 30px; padding: 4px 8px; }
    .empty { margin-top: 16px; }
    @media (max-width: 900px) { .board { grid-template-columns: 1fr; } }
  `,
})
export class ApplicationsPage {
  protected readonly apps = inject(ApplicationsService);
  protected readonly auth = inject(AuthService);
  protected readonly data = inject(DataService);
  protected readonly statuses = APPLICATION_STATUSES;
  protected readonly syncMsg = signal<string | null>(null);
  private readonly today = new Date().toISOString().slice(0, 10);

  protected readonly columns = computed(() =>
    APPLICATION_STATUSES.map((s) => ({ ...s, items: this.apps.items().filter((a) => a.status === s.id) })),
  );

  protected isDue(a: Application): boolean {
    return !!a.followUpAt && a.followUpAt <= this.today && a.status !== 'rejected' && a.status !== 'offer';
  }

  protected setStatus(a: Application, status: ApplicationStatus): void {
    this.apps.update(a.id, { status });
  }

  protected async sync(): Promise<void> {
    this.syncMsg.set('Sincronizando…');
    try {
      await this.apps.syncFromServer();
      this.syncMsg.set('Postulaciones sincronizadas.');
    } catch {
      this.syncMsg.set('No se pudo sincronizar. El servidor puede estar despertando: intenta en un minuto.');
    }
  }
}

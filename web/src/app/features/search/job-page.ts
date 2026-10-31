import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ProfileService } from '../../core/profile.service';
import { Icon } from '../../shared/icon';
import { JobDetail } from './job-detail';

/** Ficha de vacante en su propia ruta: es la vista en móvil y el enlace que se puede compartir. */
@Component({
  selector: 'app-job-page',
  imports: [JobDetail, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <a routerLink="/" class="back"><app-icon name="arrowLeft" [size]="18" /> Volver a los resultados</a>
      @if (job(); as j) {
        <div class="card"><app-job-detail [job]="j" [score]="score()" /></div>
      } @else {
        <p class="notice warn">Esta vacante ya no está en el índice: pudo cerrarse o salir de la ventana de retención.</p>
      }
    </div>
  `,
  styles: `.back { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 12px; }`,
})
export class JobPage {
  readonly id = input.required<string>();
  private readonly data = inject(DataService);
  private readonly profiles = inject(ProfileService);
  protected readonly job = computed(() => this.data.jobById().get(this.id()) ?? null);
  protected readonly score = computed(() => this.profiles.scores().get(this.id()) ?? null);
}

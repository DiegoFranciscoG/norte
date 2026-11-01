import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * Logo real de la empresa cuando la fuente lo entrega (descargado y validado en la ingesta, servido desde el propio sitio).
 * Si no hay logo, o la imagen falla, se muestra la inicial sobre un fondo neutro.
 */
@Component({
  selector: 'app-company-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (logo() && !failed()) {
      <img [src]="'data/v1/' + logo()" alt="" [width]="size()" [height]="size()" loading="lazy" decoding="async" (error)="failed.set(true)" />
    } @else {
      <span class="mono" aria-hidden="true">{{ initial() }}</span>
    }
  `,
  styles: `
    :host { display: inline-grid; place-items: center; width: var(--logo-size); height: var(--logo-size); flex: none; border-radius: 8px; overflow: hidden; background: #ffffff; box-shadow: inset 0 0 0 1px var(--border); }
    img { width: 100%; height: 100%; object-fit: contain; padding: 3px; }
    .mono { display: grid; place-items: center; width: 100%; height: 100%; background: var(--surface-2); color: var(--text-2); font-weight: 700; font-size: calc(var(--logo-size) * 0.42); }
  `,
  host: { '[style.--logo-size.px]': 'size()' },
})
export class CompanyLogo {
  readonly name = input.required<string>();
  readonly logo = input<string | null | undefined>(null);
  readonly size = input(36);
  protected readonly failed = signal(false);
  protected readonly initial = computed(() => this.name().replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '·');
}

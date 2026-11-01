import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal } from '@angular/core';
import { countryName } from '../core/format';
import { LocationService } from '../core/location.service';
import { ProfileService } from '../core/profile.service';

/**
 * Elegir dónde vives: con el botón de ubicación (el navegador pide permiso y la ciudad más cercana se calcula aquí,
 * sin enviar nada) o a mano. Se usa en el ingreso guiado, en el perfil y desde el chip de ubicación de la barra.
 */
@Component({
  selector: 'app-location-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker">
      <button type="button" class="btn locate" (click)="useMyLocation()" [disabled]="location.state() === 'locating'">
        {{ location.state() === 'locating' ? 'Buscando tu ciudad…' : 'Usar mi ubicación' }}
      </button>
      <p class="small muted hint" aria-live="polite">
        @switch (location.state()) {
          @case ('done') { Listo: elegimos la ciudad más cercana. Puedes corregirla abajo. }
          @case ('denied') { No diste permiso de ubicación. Elige tu país y tu ciudad abajo. }
          @case ('unavailable') { Tu navegador no ofrece ubicación. Elígela abajo. }
          @case ('error') { No pudimos calcular tu ubicación. Elígela abajo. }
          @default { Tu ubicación exacta no sale de este dispositivo: solo guardamos el país y la ciudad. }
        }
      </p>
      <div class="row">
        <div class="field">
          <label [for]="id + '-country'">País</label>
          <select [id]="id + '-country'" (change)="setCountry($any($event.target).value)">
            <option value="" [selected]="!country()">Elige tu país</option>
            @for (c of location.countries(); track c.iso) {
              <option [value]="c.iso" [selected]="country() === c.iso">{{ c.name }}{{ c.open ? ' · ' + c.open + ' presenciales' : '' }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label [for]="id + '-city'">Ciudad</label>
          <input [id]="id + '-city'" type="text" [attr.list]="id + '-cities'" [value]="city() ?? ''" (change)="setCity($any($event.target).value)" placeholder="Opcional" autocomplete="address-level2" [disabled]="!country()" />
          <datalist [id]="id + '-cities'">
            @for (c of cities(); track c) {
              <option [value]="c"></option>
            }
          </datalist>
        </div>
      </div>
    </div>
  `,
  styles: `
    .picker { display: grid; gap: 8px; }
    .locate { justify-self: start; }
    .hint { margin: 0 0 6px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 560px) { .row { grid-template-columns: 1fr; } }
  `,
})
export class LocationPicker {
  protected readonly location = inject(LocationService);
  private readonly profiles = inject(ProfileService);
  readonly changed = output<void>();
  protected readonly id = `loc-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly country = computed(() => this.profiles.profile().homeCountry);
  protected readonly city = computed(() => this.profiles.profile().homeCity);
  protected readonly cities = signal<string[]>([]);

  constructor() {
    if (!this.profiles.profile().homeCountry) {
      const guess = this.location.guessCountry();
      if (guess) this.profiles.setLocation(guess, null);
    }
    effect(() => {
      const c = this.country();
      if (c) void this.location.citiesOf(c).then((list) => this.cities.set(list.slice(0, 300)));
      else this.cities.set([]);
    });
  }

  protected async useMyLocation(): Promise<void> {
    const place = await this.location.locate();
    if (place) {
      this.profiles.setLocation(place.country, place.city);
      this.changed.emit();
    }
  }

  protected setCountry(iso: string): void {
    this.profiles.setLocation(iso || null, null);
    this.changed.emit();
  }

  protected setCity(value: string): void {
    this.profiles.setLocation(this.country(), value);
    this.changed.emit();
  }

  static label(country: string | null, city: string | null): string {
    if (!country) return 'Elige tu ubicación';
    return city ? `${city}, ${countryName(country)}` : countryName(country);
  }
}

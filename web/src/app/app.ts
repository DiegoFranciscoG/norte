import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApplicationsService } from './core/applications.service';
import { DataService } from './core/data.service';
import { ProfileService } from './core/profile.service';
import { SearchService } from './core/search.service';
import { ThemeService } from './core/theme.service';
import { stamp } from './core/format';
import { Icon } from './shared/icon';
import { LocationPicker } from './shared/location-picker';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, LocationPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Saltar al contenido</a>
    <header class="topbar">
      <button type="button" class="icon-btn menu" (click)="railOpen.set(!railOpen())" [attr.aria-expanded]="railOpen()" aria-controls="rail" aria-label="Menú">
        <app-icon name="menu" />
      </button>
      <a class="brand" routerLink="/" aria-label="NORTE, inicio">
        <span class="logo" aria-hidden="true"><app-icon name="north" [size]="18" /></span>
        <span class="brand-name">NORTE</span>
      </a>
      <form class="search" role="search" (submit)="$event.preventDefault(); goSearch()">
        <label class="visually-hidden" for="q">Buscar cargo, habilidad o empresa</label>
        <app-icon name="search" [size]="18" />
        <input id="q" type="search" placeholder="Buscar cargo, habilidad o empresa" [value]="search.filters().query" (input)="onQuery($any($event.target).value)" autocomplete="off" />
      </form>
      <button type="button" class="place" (click)="openPlace()" [attr.aria-label]="'Tu ubicación: ' + placeLabel() + '. Cambiar'">
        <app-icon name="pin" [size]="18" /><span>{{ placeLabel() }}</span>
      </button>
      <button type="button" class="icon-btn" (click)="theme.cycle()" [attr.aria-label]="themeLabel()" [title]="themeLabel()">
        <app-icon [name]="theme.choice() === 'dark' ? 'moon' : theme.choice() === 'light' ? 'sun' : 'monitor'" />
      </button>
      <a class="icon-btn avatar" routerLink="/perfil" aria-label="Tu perfil"><app-icon name="user" /></a>
    </header>

    <nav id="rail" class="rail" [class.open]="railOpen()" aria-label="Principal">
      @for (item of nav; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!item.exact }" (click)="closeRailOnMobile()">
          <app-icon [name]="item.icon" />
          <span>{{ item.label }}</span>
          @if (item.path === '/postulaciones' && apps.dueFollowUps().length) {
            <b class="badge" [attr.aria-label]="apps.dueFollowUps().length + ' seguimientos pendientes'">{{ apps.dueFollowUps().length }}</b>
          }
        </a>
      }
      <hr />
      @for (item of secondary; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="active" (click)="closeRailOnMobile()"><app-icon [name]="item.icon" /><span>{{ item.label }}</span></a>
      }
      @if (data.index(); as idx) {
        <p class="rail-note">{{ idx.totals.open }} vacantes abiertas · actualizado {{ stamp(idx.build.generatedAt) }}</p>
      }
    </nav>
    @if (railOpen()) {
      <button type="button" class="scrim" aria-label="Cerrar menú" (click)="railOpen.set(false)"></button>
    }

    <div class="shell" [class.rail-collapsed]="!railOpen()">
      @if (data.index()?.demo) {
        <div class="demo-banner" role="status">Modo demostración: datos ficticios generados en local, no vacantes reales.</div>
      }
      @if (search.showReload()) {
        <button type="button" class="reload" (click)="reload()" aria-live="polite">
          <app-icon name="arrowUp" [size]="16" /> Aparecieron {{ search.pendingNew() }} empleos nuevos · Recargar
        </button>
      }
      <main id="main" tabindex="-1">
        @if (data.loading()) {
          <p class="container loading" role="status">Cargando vacantes…</p>
        } @else if (data.error()) {
          <div class="container page"><p class="notice danger" role="alert">{{ data.error() }} Si estás en local, genera el índice con <code>npm run ingest:demo</code>.</p></div>
        } @else {
          <router-outlet />
        }
      </main>
      <footer class="footer container">
        <p class="small muted">
          NORTE · empleos de fuentes que permiten su reutilización, siempre con su origen y enlace.
          <a routerLink="/fuentes">Fuentes y licencias</a> · <a routerLink="/privacidad">Privacidad</a>
        </p>
      </footer>
    </div>

    <nav class="bottom-nav" aria-label="Principal (móvil)">
      @for (item of nav; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!item.exact }"><app-icon [name]="item.icon" /><span>{{ item.short ?? item.label }}</span></a>
      }
    </nav>

    <dialog #placeDialog class="dialog" aria-labelledby="place-title" (close)="onPlaceClosed()">
      <form method="dialog">
        <h2 id="place-title">¿Dónde vives?</h2>
        <p class="small muted">Presencial e híbrido se buscan en tu país, primero en tu ciudad. Remoto, en cualquier empresa que admita tu país.</p>
        <app-location-picker />
        <div class="dialog-actions"><button class="btn primary" value="ok">Listo</button></div>
      </form>
    </dialog>
  `,
  styleUrl: './app.scss',
})
export class App {
  protected readonly data = inject(DataService);
  protected readonly search = inject(SearchService);
  protected readonly apps = inject(ApplicationsService);
  protected readonly theme = inject(ThemeService);
  private readonly profiles = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly placeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('placeDialog');

  protected readonly railOpen = signal(typeof window !== 'undefined' && window.matchMedia('(min-width: 1200px)').matches);
  protected readonly nav: (NavItem & { short?: string })[] = [
    { path: '/', label: 'Para ti', icon: 'home', exact: true },
    { path: '/postulaciones', label: 'Postulaciones', icon: 'clipboard', short: 'Postulaciones' },
    { path: '/observatorio', label: 'Observatorio', icon: 'chart' },
    { path: '/perfil', label: 'Tu perfil', icon: 'user', short: 'Perfil' },
  ];
  protected readonly secondary: NavItem[] = [
    { path: '/fuentes', label: 'Fuentes y licencias', icon: 'doc' },
    { path: '/privacidad', label: 'Privacidad', icon: 'shield' },
    { path: '/cuenta', label: 'Cuenta', icon: 'key' },
  ];
  protected readonly stamp = stamp;
  protected readonly placeLabel = computed(() => LocationPicker.label(this.profiles.profile().homeCountry, this.profiles.profile().homeCity));
  protected readonly themeLabel = computed(() => `Tema: ${{ system: 'del sistema', light: 'claro', dark: 'oscuro' }[this.theme.choice()]} (cambiar)`);

  onQuery(value: string): void {
    this.search.set('query', value);
    if (this.router.url !== '/' && !this.router.url.startsWith('/?')) void this.router.navigateByUrl('/');
  }

  goSearch(): void {
    void this.router.navigateByUrl('/');
  }

  openPlace(): void {
    this.placeDialog().nativeElement.showModal();
  }

  onPlaceClosed(): void {
    document.getElementById('main')?.focus();
  }

  reload(): void {
    this.data.applyPending();
    void this.router.navigateByUrl('/').then(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  closeRailOnMobile(): void {
    if (!window.matchMedia('(min-width: 1200px)').matches) this.railOpen.set(false);
  }
}

import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApplicationsService } from './core/applications.service';
import { DataService } from './core/data.service';
import { SearchService } from './core/search.service';
import { ThemeService } from './core/theme.service';
import { Icon } from './shared/icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, SlicePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Saltar al contenido</a>
    <header class="topbar">
      <div class="container bar">
        <a class="brand" routerLink="/" aria-label="NORTE, inicio">
          <span class="logo" aria-hidden="true"><app-icon name="north" [size]="22" /></span>
          <span class="brand-name">NORTE</span>
        </a>
        <form class="search" role="search" (submit)="$event.preventDefault(); goSearch()">
          <app-icon name="search" [size]="18" />
          <label class="visually-hidden" for="q">Buscar cargo, habilidad o empresa</label>
          <input id="q" type="search" placeholder="Cargo, habilidad o empresa" [value]="search.filters().query" (input)="onQuery($any($event.target).value)" autocomplete="off" />
        </form>
        <nav class="nav" aria-label="Principal">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><app-icon name="briefcase" /><span>Empleos</span></a>
          <a routerLink="/postulaciones" routerLinkActive="active">
            <app-icon name="clipboard" /><span>Postulaciones</span>
            @if (apps.dueFollowUps().length) {
              <b class="badge" [attr.aria-label]="apps.dueFollowUps().length + ' seguimientos pendientes'">{{ apps.dueFollowUps().length }}</b>
            }
          </a>
          <a routerLink="/perfil" routerLinkActive="active"><app-icon name="user" /><span>Perfil</span></a>
          <button type="button" class="theme" (click)="theme.cycle()" [attr.aria-label]="themeLabel()" [title]="themeLabel()">
            <app-icon [name]="theme.choice() === 'dark' ? 'moon' : theme.choice() === 'light' ? 'sun' : 'monitor'" />
          </button>
        </nav>
      </div>
    </header>
    @if (data.index()?.demo) {
      <div class="demo-banner" role="status">Modo demostración: estás viendo datos ficticios generados en local, no vacantes reales.</div>
    }
    <main id="main" tabindex="-1">
      @if (data.loading()) {
        <p class="container loading" role="status">Cargando el índice de vacantes…</p>
      } @else if (data.error()) {
        <div class="container"><p class="notice danger" role="alert">{{ data.error() }} Si estás en local, genera el índice con <code>npm run ingest:demo</code>.</p></div>
      } @else {
        <router-outlet />
      }
    </main>
    <footer class="footer">
      <div class="container">
        <p>
          NORTE · vacantes de fuentes que permiten su reutilización, con su origen y enlace.
          <a routerLink="/fuentes">Fuentes y licencias</a> · <a routerLink="/privacidad">Privacidad</a> · <a routerLink="/cuenta">Cuenta</a>
        </p>
        @if (data.index(); as idx) {
          <p class="small muted">Índice {{ idx.build.version }} · actualizado {{ idx.build.generatedAt | slice: 0 : 16 }} UTC · {{ idx.totals.open }} vacantes abiertas</p>
        }
      </div>
    </footer>
  `,
  styleUrl: './app.scss',
})
export class App {
  protected readonly data = inject(DataService);
  protected readonly search = inject(SearchService);
  protected readonly apps = inject(ApplicationsService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly themeLabel = computed(() => `Tema: ${{ system: 'del sistema', light: 'claro', dark: 'oscuro' }[this.theme.choice()]} (cambiar)`);

  onQuery(value: string): void {
    this.search.set('query', value);
    if (!this.router.url.startsWith('/?') && this.router.url !== '/') void this.router.navigateByUrl('/');
  }

  goSearch(): void {
    void this.router.navigateByUrl('/');
  }
}

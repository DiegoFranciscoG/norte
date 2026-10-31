import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApplicationsService } from '../../core/applications.service';
import { AuthService, type ConsentText } from '../../core/auth.service';
import { ProfileService } from '../../core/profile.service';

interface ConsentState {
  purpose: string;
  granted: boolean;
  textVersion: string;
  grantedAt: string | null;
}

interface AlertSettings {
  enabled: boolean;
  minScore: number;
}

const PURPOSE_LABEL: Record<string, string> = {
  PROFILE_STORAGE: 'Guardar mi perfil (habilidades, años e idioma) en mi cuenta',
  EMAIL_ALERTS: 'Recibir por correo las vacantes nuevas que superen mi umbral',
};

function problem(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No se pudo contactar con el servidor. Si estuvo inactivo, puede tardar un minuto en despertar.';
    const detail = (err.error as { detail?: string } | null)?.detail;
    if (detail) return detail;
  }
  return fallback;
}

@Component({
  selector: 'app-account-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-page.html',
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; }
    form { display: grid; gap: 12px; }
    .check { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; }
    .check input { margin-top: 4px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 12px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly profiles = inject(ProfileService);
  private readonly apps = inject(ApplicationsService);

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly texts = signal<ConsentText[]>([]);
  protected readonly accepted = signal<Record<string, boolean>>({});
  protected readonly consents = signal<ConsentState[]>([]);
  protected readonly alerts = signal<AlertSettings | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly labels = PURPOSE_LABEL;

  constructor() {
    effect(() => {
      if (this.auth.enabled()) void this.auth.consentTexts().then((t) => this.texts.set(t)).catch(() => undefined);
      if (this.auth.loggedIn()) void this.loadAccount();
    });
  }

  private async loadAccount(): Promise<void> {
    try {
      this.consents.set(await firstValueFrom(this.http.get<ConsentState[]>(this.auth.api('/api/v1/me/consents'))));
      this.alerts.set(await firstValueFrom(this.http.get<AlertSettings>(this.auth.api('/api/v1/me/alerts'))));
    } catch (err) {
      this.error.set(problem(err, 'No se pudo cargar tu cuenta.'));
    }
  }

  async submit(email: string, password: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'register') {
        const consents = this.texts().map((t) => ({ purpose: t.purpose, granted: this.accepted()[t.purpose] === true, textVersion: t.version }));
        await this.auth.register(email, password, consents);
      } else {
        await this.auth.login(email, password);
      }
      await this.apps.syncFromServer().catch(() => undefined);
      this.message.set('Sesión iniciada.');
    } catch (err) {
      this.error.set(problem(err, this.mode() === 'register' ? 'No se pudo crear la cuenta.' : 'Correo o contraseña incorrectos.'));
    } finally {
      this.busy.set(false);
    }
  }

  async setConsent(purpose: string, granted: boolean): Promise<void> {
    const text = this.texts().find((t) => t.purpose === purpose);
    try {
      await firstValueFrom(this.http.put(this.auth.api(`/api/v1/me/consents/${purpose}`), { granted, textVersion: text?.version ?? '1' }));
      await this.loadAccount();
    } catch (err) {
      this.error.set(problem(err, 'No se pudo actualizar el consentimiento.'));
    }
  }

  async saveAlerts(enabled: boolean, minScore: number): Promise<void> {
    try {
      this.alerts.set(await firstValueFrom(this.http.put<AlertSettings>(this.auth.api('/api/v1/me/alerts'), { enabled, minScore })));
      this.message.set('Alertas guardadas.');
    } catch (err) {
      this.error.set(problem(err, 'No se pudieron guardar las alertas.'));
    }
  }

  async exportData(): Promise<void> {
    try {
      const data = await firstValueFrom(this.http.get(this.auth.api('/api/v1/me/export')));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'norte-mis-datos.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      this.error.set(problem(err, 'No se pudo exportar.'));
    }
  }

  async deleteAccount(password: string): Promise<void> {
    if (!confirm('Se borrará tu cuenta y todos sus datos del servidor, sin posibilidad de recuperarlos. ¿Continuar?')) return;
    try {
      await firstValueFrom(this.http.delete(this.auth.api('/api/v1/me'), { body: { password } }));
      this.auth.clear();
      this.profiles.clear();
      this.message.set('Tu cuenta y todos sus datos fueron eliminados.');
    } catch (err) {
      this.error.set(problem(err, 'No se pudo borrar la cuenta. Revisa tu contraseña.'));
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.message.set('Sesión cerrada.');
  }

  protected toggleAccepted(purpose: string, value: boolean): void {
    this.accepted.update((a) => ({ ...a, [purpose]: value }));
  }
}

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';
import { readSession, writeSession } from './storage';

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  email: string;
}

export interface ConsentText {
  purpose: 'PROFILE_STORAGE' | 'EMAIL_ALERTS';
  version: string;
  text: string;
}

/**
 * Token de acceso corto solo en memoria; el de refresco (rotativo y revocable) en sessionStorage,
 * que se borra al cerrar la pestaña. La API vive en otro dominio, así que no se usan cookies de terceros.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly data = inject(DataService);
  private readonly access = signal<{ token: string; exp: number } | null>(null);
  readonly email = signal<string | null>(readSession('norte.email'));
  readonly enabled = computed(() => this.data.config().apiBaseUrl !== '');
  readonly loggedIn = computed(() => this.email() !== null);
  private refreshing: Promise<string | null> | null = null;

  api(path: string): string {
    return `${this.data.config().apiBaseUrl}${path}`;
  }

  async register(email: string, password: string, consents: { purpose: string; granted: boolean; textVersion: string }[]): Promise<void> {
    await firstValueFrom(this.http.post(this.api('/api/v1/auth/register'), { email, password, consents }));
    await this.login(email, password);
  }

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(this.http.post<TokenResponse>(this.api('/api/v1/auth/login'), { email, password }));
    this.store(res);
  }

  async logout(): Promise<void> {
    const refreshToken = readSession('norte.refresh');
    if (refreshToken) await firstValueFrom(this.http.post(this.api('/api/v1/auth/logout'), { refreshToken })).catch(() => undefined);
    this.clear();
  }

  clear(): void {
    this.access.set(null);
    this.email.set(null);
    writeSession('norte.refresh', null);
    writeSession('norte.email', null);
  }

  /** Devuelve un token de acceso válido, renovándolo si caducó. */
  async token(): Promise<string | null> {
    const current = this.access();
    if (current && current.exp - Date.now() > 15000) return current.token;
    if (!readSession('norte.refresh')) return null;
    this.refreshing ??= this.refresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async refresh(): Promise<string | null> {
    const refreshToken = readSession('norte.refresh');
    try {
      const res = await firstValueFrom(this.http.post<TokenResponse>(this.api('/api/v1/auth/refresh'), { refreshToken }));
      this.store(res);
      return res.accessToken;
    } catch (err) {
      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 400)) this.clear();
      return null;
    }
  }

  private store(res: TokenResponse): void {
    this.access.set({ token: res.accessToken, exp: Date.now() + res.expiresIn * 1000 });
    writeSession('norte.refresh', res.refreshToken);
    writeSession('norte.email', res.email);
    this.email.set(res.email);
  }

  consentTexts(): Promise<ConsentText[]> {
    return firstValueFrom(this.http.get<ConsentText[]>(this.api('/api/v1/consent-texts')));
  }
}

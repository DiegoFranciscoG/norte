import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { Job } from '@norte/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import type { Application, ApplicationStatus } from './models';
import { readStored, writeStored } from './storage';

const STORAGE_ENTRY = 'norte.applications.v1';

interface RemoteApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  status: string;
  appliedAt: string | null;
  followUpAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const toRemoteStatus = (s: ApplicationStatus) => s.toUpperCase();
const fromRemoteStatus = (s: string) => s.toLowerCase() as ApplicationStatus;

/** Seguimiento de postulaciones: funciona sin cuenta; con cuenta se sincroniza con la API. NORTE nunca postula por ti. */
@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly items = signal<Application[]>(readStored<Application[]>(STORAGE_ENTRY, []));
  readonly byJob = computed(() => new Map(this.items().map((a) => [a.jobId, a] as const)));
  readonly dueFollowUps = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.items().filter((a) => a.followUpAt && a.followUpAt <= today && a.status !== 'rejected' && a.status !== 'offer');
  });

  private persist(next: Application[]): void {
    this.items.set(next);
    writeStored(STORAGE_ENTRY, next);
  }

  save(job: Job): Application {
    const existing = this.byJob().get(job.id);
    if (existing) return existing;
    const now = new Date().toISOString();
    const app: Application = {
      id: crypto.randomUUID(),
      jobId: job.id,
      title: job.title,
      company: job.company.name,
      url: job.sources[0]?.applyUrl ?? job.sources[0]?.url ?? '',
      status: 'saved',
      savedAt: now,
      appliedAt: null,
      updatedAt: now,
      followUpAt: null,
      notes: '',
    };
    this.persist([app, ...this.items()]);
    void this.pushRemote(app);
    return app;
  }

  update(id: string, patch: Partial<Pick<Application, 'status' | 'notes' | 'followUpAt' | 'appliedAt'>>): void {
    const now = new Date().toISOString();
    const next = this.items().map((a) => {
      if (a.id !== id) return a;
      const updated = { ...a, ...patch, updatedAt: now };
      if (patch.status === 'applied' && !a.appliedAt) updated.appliedAt = now.slice(0, 10);
      return updated;
    });
    this.persist(next);
    const app = next.find((a) => a.id === id);
    if (app) void this.pushRemote(app);
  }

  remove(id: string): void {
    const app = this.items().find((a) => a.id === id);
    this.persist(this.items().filter((a) => a.id !== id));
    if (app?.remoteId && this.auth.loggedIn()) {
      void firstValueFrom(this.http.delete(this.auth.api(`/api/v1/me/applications/${app.remoteId}`))).catch(() => undefined);
    }
  }

  /** Trae lo guardado en la cuenta y lo une con lo local (gana la versión más reciente). */
  async syncFromServer(): Promise<void> {
    if (!this.auth.loggedIn()) return;
    const remote = await firstValueFrom(this.http.get<RemoteApplication[]>(this.auth.api('/api/v1/me/applications')));
    const local = new Map(this.items().map((a) => [a.jobId, a] as const));
    for (const r of remote) {
      const l = local.get(r.jobId);
      if (!l || r.updatedAt > l.updatedAt) {
        local.set(r.jobId, {
          id: l?.id ?? crypto.randomUUID(),
          remoteId: r.id,
          jobId: r.jobId,
          title: r.jobTitle,
          company: r.company,
          url: r.jobUrl,
          status: fromRemoteStatus(r.status),
          savedAt: r.createdAt,
          appliedAt: r.appliedAt,
          updatedAt: r.updatedAt,
          followUpAt: r.followUpAt,
          notes: r.notes ?? '',
        });
      } else if (!l.remoteId) {
        local.set(r.jobId, { ...l, remoteId: r.id });
      }
    }
    this.persist([...local.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    for (const a of this.items()) if (!a.remoteId) await this.pushRemote(a);
  }

  private async pushRemote(app: Application): Promise<void> {
    if (!this.auth.loggedIn()) return;
    const body = { jobId: app.jobId, jobTitle: app.title, company: app.company, jobUrl: app.url, status: toRemoteStatus(app.status), appliedAt: app.appliedAt, followUpAt: app.followUpAt, notes: app.notes };
    try {
      if (app.remoteId) {
        await firstValueFrom(this.http.put(this.auth.api(`/api/v1/me/applications/${app.remoteId}`), body));
      } else {
        const created = await firstValueFrom(this.http.post<RemoteApplication>(this.auth.api('/api/v1/me/applications'), body));
        this.persist(this.items().map((a) => (a.id === app.id ? { ...a, remoteId: created.id } : a)));
      }
    } catch {
      /* sin conexión o API dormida: queda local y se reintenta en la próxima sincronización */
    }
  }
}

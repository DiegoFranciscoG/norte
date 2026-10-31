import { Injectable, inject, signal } from '@angular/core';
import { aggregateDemonstrated, createRepoAnalyzer, type DemonstratedSkill, type DependencyRules, type RepoAnalysis } from '@norte/core';
import { DataService } from './data.service';

export interface GithubProgress {
  phase: 'idle' | 'listing' | 'repos' | 'done' | 'error';
  done: number;
  total: number;
  remaining: number | null;
  message: string;
}

interface RepoListItem {
  name: string;
  full_name: string;
  html_url: string;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
  default_branch: string;
  size: number;
}

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/**
 * Lee repositorios públicos desde el navegador del usuario. Respeta el límite de 60 peticiones por hora
 * sin autenticar (o usa el token del propio usuario, que nunca sale de esta pestaña ni llega a NORTE).
 * Los manifiestos se leen de raw.githubusercontent.com, que no consume cupo de la API.
 */
@Injectable({ providedIn: 'root' })
export class GithubService {
  private readonly data = inject(DataService);
  readonly progress = signal<GithubProgress>({ phase: 'idle', done: 0, total: 0, remaining: null, message: '' });

  async analyze(user: string, token: string | null, maxRepos = 20): Promise<{ analyses: RepoAnalysis[]; demonstrated: DemonstratedSkill[] }> {
    const login = user.trim().replace(/^@/, '');
    if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login)) throw new Error('Nombre de usuario de GitHub no válido.');
    const matcher = this.data.matcher();
    const rules = this.data.dependencies() as DependencyRules | null;
    if (!matcher || !rules) throw new Error('El catálogo aún no se carga.');
    const analyzer = createRepoAnalyzer(rules, matcher);
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers['Authorization'] = `Bearer ${token.trim()}`;

    this.progress.set({ phase: 'listing', done: 0, total: 0, remaining: null, message: 'Leyendo tus repositorios públicos…' });
    const listRes = await fetch(`${API}/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed&type=owner`, { headers });
    let remaining = Number(listRes.headers.get('x-ratelimit-remaining') ?? NaN);
    if (listRes.status === 404) throw new Error('No existe ese usuario de GitHub.');
    if (listRes.status === 403 || listRes.status === 429) throw new Error('GitHub limitó las consultas (60 por hora sin token). Intenta más tarde o usa tu token personal.');
    if (!listRes.ok) throw new Error(`GitHub respondió ${listRes.status}.`);
    const repos = ((await listRes.json()) as RepoListItem[]).filter((r) => !r.fork && !r.archived && r.size > 0).slice(0, maxRepos);

    const analyses: RepoAnalysis[] = [];
    for (const repo of repos) {
      if (Number.isFinite(remaining) && remaining <= 1) {
        this.progress.update((p) => ({ ...p, message: `Cupo de GitHub agotado: se analizaron ${analyses.length} repos.` }));
        break;
      }
      this.progress.set({ phase: 'repos', done: analyses.length, total: repos.length, remaining: Number.isFinite(remaining) ? remaining : null, message: `Analizando ${repo.name}…` });
      const treeRes = await fetch(`${API}/repos/${repo.full_name}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`, { headers });
      remaining = Number(treeRes.headers.get('x-ratelimit-remaining') ?? remaining);
      if (!treeRes.ok) continue;
      const tree = ((await treeRes.json()) as { tree: { path: string; type: string }[] }).tree.filter((t) => t.type === 'blob').map((t) => t.path);
      const manifests: Record<string, string> = {};
      for (const path of analyzer.manifestPaths(tree)) {
        const raw = await fetch(`${RAW}/${repo.full_name}/${encodeURIComponent(repo.default_branch)}/${path.split('/').map(encodeURIComponent).join('/')}`);
        if (raw.ok) manifests[path] = (await raw.text()).slice(0, 200_000);
      }
      analyses.push(analyzer.analyze({ name: repo.name, url: repo.html_url, pushedAt: repo.pushed_at, tree, manifests }));
    }
    this.progress.set({ phase: 'done', done: analyses.length, total: repos.length, remaining: Number.isFinite(remaining) ? remaining : null, message: `Listo: ${analyses.length} repositorios analizados.` });
    return { analyses, demonstrated: aggregateDemonstrated(analyses, matcher) };
  }
}

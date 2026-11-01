import type { Job, JobGroup, RegionCode, RemoteScope } from '@norte/core';

const DAY = 86400000;

/** Fecha y hora UTC legibles a partir de un ISO 8601 («2026-11-01 14:49 UTC»). */
export function stamp(iso: string | null | undefined): string {
  return iso ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : '';
}

export function timeAgo(iso: string, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
  if (days === 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}

export function money(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export function salaryLabel(job: Job): string | null {
  const s = job.salary;
  if (!s) return null;
  if (s.convertible && (s.usdMonthlyMin !== null || s.usdMonthlyMax !== null)) {
    const a = s.usdMonthlyMin;
    const b = s.usdMonthlyMax;
    return a !== null && b !== null && a !== b ? `${money(a)} – ${money(b)} /mes` : `${money(b ?? a)} /mes`;
  }
  return `${s.min ?? ''}${s.max && s.max !== s.min ? `–${s.max}` : ''} ${s.currency} (moneda no convertible)`;
}

export const MODALITY_LABEL: Record<Job['modality'], string> = { onsite: 'Presencial', hybrid: 'Híbrido', remote: 'Remoto', unknown: 'Modalidad no indicada' };
export const EMPLOYMENT_LABEL: Record<Job['employmentType'], string> = {
  'full-time': 'Tiempo completo',
  'part-time': 'Medio tiempo',
  contract: 'Contrato',
  freelance: 'Freelance',
  internship: 'Pasantía',
  temporary: 'Temporal',
  unknown: '',
};
export const SENIORITY_LABEL: Record<Job['seniority'], string> = { intern: 'Pasante', junior: 'Junior', mid: 'Semi senior', senior: 'Senior', lead: 'Líder', unknown: '' };
export const GROUP_LABEL: Record<JobGroup, string> = { near: 'Cerca de ti', country: 'En tu país', remote: 'Remoto para ti', freelance: 'Freelance' };

const REGION_LABEL: Record<RegionCode, string> = {
  latam: 'Latinoamérica',
  americas: 'las Américas',
  'north-america': 'Norteamérica',
  europe: 'Europa',
  'middle-east': 'Oriente Medio',
  africa: 'África',
  emea: 'Europa, Oriente Medio y África',
  apac: 'Asia-Pacífico',
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** Nombre del país en español a partir de su código ISO alfa-2 (CLDR del navegador). */
export function countryName(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return regionNames?.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

export function remoteScopeLabel(scope: RemoteScope | null): string {
  if (!scope || scope.type === 'unknown') return 'alcance no declarado';
  if (scope.type === 'worldwide') return 'todo el mundo';
  const parts = [...scope.regions.map((r) => REGION_LABEL[r]), ...scope.countries.map(countryName)];
  return parts.length > 3 ? `${parts.slice(0, 3).join(', ')} y ${parts.length - 3} más` : parts.join(', ');
}

export function locationLabel(job: Job): string {
  if (job.modality === 'remote') return job.remoteScope && job.remoteScope.type !== 'unknown' ? `Remoto · ${remoteScopeLabel(job.remoteScope)}` : 'Remoto (alcance no declarado)';
  const place = [job.location.city, job.location.province && job.location.province !== job.location.city ? job.location.province : null, countryName(job.location.country)]
    .filter(Boolean)
    .join(', ');
  return `${place || 'Ubicación no indicada'} (${MODALITY_LABEL[job.modality].toLowerCase()})`;
}

export function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Color estable por empresa para el avatar (paleta con contraste AA para texto blanco). */
const AVATAR_COLORS = ['#0b5cad', '#0f7b5f', '#7a3fb0', '#b3261e', '#8a5a00', '#1f6f8b', '#5b4b8a', '#2e6b30'];
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

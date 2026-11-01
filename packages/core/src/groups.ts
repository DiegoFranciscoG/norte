import { placeKey, remoteEligibility } from './geo.js';
import type { EmploymentType, JobGroup, JobLocation, Modality, RegionCode, RemoteScope, UserPlace } from './types.js';

export interface GroupInput {
  modality: Modality;
  location: JobLocation;
  remoteScope: RemoteScope | null;
  employmentType: EmploymentType;
}

/** El índice guarda una vacante solo si se puede ubicar: remota (con o sin alcance declarado) o con país conocido. */
export function isPlaceable(job: Pick<GroupInput, 'modality' | 'location'>): boolean {
  return job.modality === 'remote' || job.location.country !== null;
}

/**
 * Grupo de una vacante para una persona concreta:
 * - near: presencial o híbrido en su ciudad;
 * - country: presencial o híbrido en otra ciudad de su país;
 * - remote: remoto que admite su país (o que no declara alcance: la interfaz lo advierte);
 * - freelance: por proyecto, remoto que la admite o en su país.
 * Devuelve null si no le sirve (presencial en otro país o remoto que excluye su país).
 * Sin país conocido, todo lo presencial cae en «country» para que nadie vea una lista vacía.
 */
export function groupFor(job: GroupInput, place: UserPlace, regions: Partial<Record<RegionCode, string[]>>): JobGroup | null {
  const remoteOk = job.modality === 'remote' && remoteEligibility(job.remoteScope, place.country, regions) !== false;
  const sameCountry = place.country === null || job.location.country === place.country;
  if (job.employmentType === 'freelance') return (job.modality === 'remote' ? remoteOk : sameCountry) ? 'freelance' : null;
  if (job.modality === 'remote') return remoteOk ? 'remote' : null;
  if (!sameCountry) return null;
  if (place.country === null) return 'country';
  const sameCity = place.city !== null && job.location.city !== null && placeKey(job.location.city) === placeKey(place.city);
  return sameCity ? 'near' : 'country';
}

export const GROUP_ORDER: JobGroup[] = ['near', 'country', 'remote', 'freelance'];

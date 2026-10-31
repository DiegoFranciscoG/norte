import { normalizeText } from './text.js';
import type { EmploymentType, JobGroup, JobLocation, Modality, RemoteScope } from './types.js';

export interface HomeConfig {
  city: string;
  country: string;
}

export interface GroupInput {
  modality: Modality;
  location: JobLocation;
  remoteScope: RemoteScope | null;
  employmentType: EmploymentType;
}

/**
 * Asigna una vacante a uno de los cuatro grupos o la descarta (null).
 * Freelance primero; luego presencial/híbrido en la ciudad de origen, resto de Ecuador y remoto abierto a Ecuador.
 * Un remoto que excluye a Ecuador se descarta del índice: no le sirve a nadie que busque desde Ecuador.
 */
export function classifyGroup(job: GroupInput, home: HomeConfig): JobGroup | null {
  const eligible = job.modality !== 'remote' || job.remoteScope?.ecuadorEligible !== false;
  const inEcuador = job.location.country === home.country;
  if (job.employmentType === 'freelance') {
    return eligible && (job.modality === 'remote' || inEcuador) ? 'freelance' : null;
  }
  if (job.modality === 'remote') {
    return job.remoteScope?.ecuadorEligible === false ? null : 'remote';
  }
  if (!inEcuador) return null;
  const isHome = job.location.city !== null && normalizeText(job.location.city) === normalizeText(home.city);
  return isHome ? 'home' : 'ecuador';
}

export const GROUP_ORDER: JobGroup[] = ['home', 'ecuador', 'remote', 'freelance'];

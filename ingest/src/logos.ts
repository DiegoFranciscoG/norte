import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Job } from '@norte/core';
import type { HttpClient } from './http/client.js';

export type ImageType = 'png' | 'jpg' | 'gif' | 'webp';
const TYPES: ImageType[] = ['png', 'jpg', 'gif', 'webp'];

/** Tipo real de la imagen por su firma de bytes. SVG queda fuera a propósito: puede llevar código. */
export function sniffImage(b: Uint8Array): ImageType | null {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (starts(0xff, 0xd8, 0xff)) return 'jpg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

export interface LogoOptions {
  cacheDir: string;
  maxBytes: number;
  maxNewPerRun: number;
  log: (message: string) => void;
}

/**
 * Cambia la URL externa del logo de cada vacante por una ruta del propio índice («logos/<hash>.<tipo>»), así el navegador
 * nunca pide nada a terceros. Cada imagen se descarga una sola vez (la caché persiste entre ejecuciones), se valida
 * por tamaño y firma, y las que fallan simplemente no se muestran. Devuelve los archivos a publicar.
 */
export async function attachLogos(jobs: Job[], http: Pick<HttpClient, 'getBytes'>, opts: LogoOptions): Promise<Map<string, string>> {
  await mkdir(opts.cacheDir, { recursive: true });
  const cachedFor = (id: string) => TYPES.map((t) => `${id}.${t}`).find((f) => existsSync(join(opts.cacheDir, f))) ?? null;
  const idOf = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 20);

  const resolved = new Map<string, string | null>();
  const pending = [...new Set(jobs.map((j) => j.company.logo).filter((l): l is string => !!l && l.startsWith('https://')))];
  const toDownload: string[] = [];
  for (const url of pending) {
    const hit = cachedFor(idOf(url));
    if (hit) resolved.set(url, `logos/${hit}`);
    else toDownload.push(url);
  }
  const batch = toDownload.slice(0, opts.maxNewPerRun);
  // Las descargas van en paralelo entre hosts; el cliente HTTP las ordena y espacia dentro de cada host.
  await Promise.all(
    batch.map(async (url) => {
      const bytes = await http.getBytes(url, opts.maxBytes);
      const type = bytes ? sniffImage(bytes) : null;
      if (!bytes || !type) {
        resolved.set(url, null);
        return;
      }
      const name = `${idOf(url)}.${type}`;
      await writeFile(join(opts.cacheDir, name), bytes);
      resolved.set(url, `logos/${name}`);
    }),
  );
  if (toDownload.length) opts.log(`Logos: ${batch.length} descargados o intentados, ${toDownload.length - batch.length} quedan para la próxima ejecución.`);

  const files = new Map<string, string>();
  for (const job of jobs) {
    const logo = job.company.logo ?? null;
    let path: string | null = null;
    if (logo?.startsWith('https://')) path = resolved.get(logo) ?? null;
    else if (logo?.startsWith('logos/') && /^logos\/[0-9a-f]{20}\.(png|jpg|gif|webp)$/.test(logo) && existsSync(join(opts.cacheDir, logo.slice(6)))) path = logo;
    job.company = { ...job.company, logo: path };
    if (path) files.set(path, join(opts.cacheDir, path.slice(6)));
  }
  return files;
}

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CacheEntry, HttpCache } from './client.js';

/** Caché de respuestas con ETag/Last-Modified en disco; GitHub Actions la conserva entre ejecuciones. */
export class FileHttpCache implements HttpCache {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private path(url: string): string {
    return join(this.dir, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.json`);
  }

  get(url: string): CacheEntry | undefined {
    try {
      return JSON.parse(readFileSync(this.path(url), 'utf8')) as CacheEntry;
    } catch {
      return undefined;
    }
  }

  set(url: string, entry: CacheEntry): void {
    writeFileSync(this.path(url), JSON.stringify(entry));
  }
}

export class MemoryHttpCache implements HttpCache {
  private readonly map = new Map<string, CacheEntry>();
  get(url: string): CacheEntry | undefined {
    return this.map.get(url);
  }
  set(url: string, entry: CacheEntry): void {
    this.map.set(url, entry);
  }
}

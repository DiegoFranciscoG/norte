import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachLogos, sniffImage } from '../src/logos.js';
import { job } from './observatory-fixtures.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe('validación de imágenes', () => {
  it('reconoce PNG, JPEG, GIF y WebP por su firma y rechaza SVG y HTML', () => {
    expect(sniffImage(PNG)).toBe('png');
    expect(sniffImage(JPG)).toBe('jpg');
    expect(sniffImage(GIF)).toBe('gif');
    expect(sniffImage(WEBP)).toBe('webp');
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(new TextEncoder().encode('<!doctype html><title>404</title>'))).toBeNull();
  });
});

describe('logos de empresas', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'norte-logos-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const fakeHttp = (responses: Record<string, Uint8Array | null>) => {
    const calls: string[] = [];
    return {
      calls,
      getBytes: async (url: string) => {
        calls.push(url);
        return responses[url] ?? null;
      },
    };
  };
  const withLogo = (id: string, logo: string | null) => job({ id, company: { name: `Empresa ${id}`, slug: `empresa-${id}`, logo } });
  const opts = (maxNewPerRun = 10) => ({ cacheDir: dir, maxBytes: 150_000, maxNewPerRun, log: () => undefined });

  it('descarga cada URL una vez, publica solo rutas propias y descarta lo que no es imagen', async () => {
    const http = fakeHttp({ 'https://cdn.example/a.png': PNG, 'https://cdn.example/b.svg': SVG, 'https://cdn.example/c.jpg': null });
    const jobs = [
      withLogo('1', 'https://cdn.example/a.png'),
      withLogo('2', 'https://cdn.example/a.png'),
      withLogo('3', 'https://cdn.example/b.svg'),
      withLogo('4', 'https://cdn.example/c.jpg'),
      withLogo('5', 'http://inseguro.example/x.png'),
      withLogo('6', null),
    ];
    const files = await attachLogos(jobs, http, opts());
    expect(http.calls.filter((u) => u.endsWith('a.png'))).toHaveLength(1);
    const path = jobs[0]!.company.logo;
    expect(path).toMatch(/^logos\/[0-9a-f]{20}\.png$/);
    expect(jobs[1]!.company.logo).toBe(path);
    expect(jobs.slice(2).map((j) => j.company.logo)).toEqual([null, null, null, null]);
    expect([...files.keys()]).toEqual([path]);
    expect(existsSync(files.get(path!)!)).toBe(true);
    expect(jobs.every((j) => !j.company.logo?.startsWith('http'))).toBe(true);
  });

  it('reutiliza la caché entre ejecuciones y conserva rutas del estado anterior solo si el archivo existe', async () => {
    const first = [withLogo('1', 'https://cdn.example/a.png')];
    await attachLogos(first, fakeHttp({ 'https://cdn.example/a.png': PNG }), opts());
    const kept = first[0]!.company.logo!;

    const http = fakeHttp({});
    const next = [withLogo('1', 'https://cdn.example/a.png'), withLogo('2', kept), withLogo('3', 'logos/0123456789abcdef0123.png'), withLogo('4', 'logos/../../secreto.png')];
    await attachLogos(next, http, opts());
    expect(http.calls).toEqual([]);
    expect(next.map((j) => j.company.logo)).toEqual([kept, kept, null, null]);
  });

  it('respeta el tope de descargas nuevas por ejecución', async () => {
    await writeFile(join(dir, 'marca.txt'), 'x');
    const http = fakeHttp({ 'https://cdn.example/1.png': PNG, 'https://cdn.example/2.png': PNG });
    const jobs = [withLogo('1', 'https://cdn.example/1.png'), withLogo('2', 'https://cdn.example/2.png')];
    await attachLogos(jobs, http, opts(1));
    expect(http.calls).toHaveLength(1);
    expect(jobs.filter((j) => j.company.logo).length).toBe(1);
  });
});

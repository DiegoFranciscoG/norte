import { describe, expect, it } from 'vitest';
import { MemoryHttpCache } from '../src/http/cache.js';
import { BudgetExceededError, HttpClient, HttpError, parseRetryAfter } from '../src/http/client.js';
import { FakeClock, fakeFetch, json } from './helpers.js';

function client(handler: Parameters<typeof fakeFetch>[0], policies = {}, clock = new FakeClock()) {
  const f = fakeFetch(handler);
  const http = new HttpClient({
    policies: { default: { minIntervalMs: 1000, maxRequestsPerRun: 5, timeoutMs: 5000, maxRetries: 3, backoffBaseMs: 500, backoffMaxMs: 8000 }, ...policies },
    userAgent: 'test',
    fetchImpl: f,
    sleep: clock.sleep,
    now: clock.now,
    random: () => 0,
    cache: new MemoryHttpCache(),
  });
  return { http, f, clock };
}

describe('T-06 límites respetados', () => {
  it('nunca supera el ritmo de un host: espera el intervalo mínimo entre peticiones', async () => {
    const stamps: number[] = [];
    const clock = new FakeClock();
    const { http } = client(() => {
      stamps.push(clock.now());
      return json({ ok: true });
    }, { 'api.example.org': { minIntervalMs: 2000 } }, clock);
    for (let i = 0; i < 4; i++) await http.get(`https://api.example.org/jobs?page=${i}`);
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]!);
    expect(gaps.every((g) => g >= 2000)).toBe(true);
  });

  it('serializa peticiones concurrentes al mismo host', async () => {
    const clock = new FakeClock();
    const stamps: number[] = [];
    const { http } = client(() => {
      stamps.push(clock.now());
      return json({});
    }, {}, clock);
    await Promise.all([1, 2, 3].map((i) => http.get(`https://a.example.org/${i}`)));
    expect(stamps[1]! - stamps[0]!).toBeGreaterThanOrEqual(1000);
    expect(stamps[2]! - stamps[1]!).toBeGreaterThanOrEqual(1000);
  });

  it('respeta el presupuesto de peticiones por ejecución', async () => {
    const { http, f } = client(() => json({}), { 'b.example.org': { maxRequestsPerRun: 3 } });
    for (let i = 0; i < 3; i++) await http.get(`https://b.example.org/${i}`);
    await expect(http.get('https://b.example.org/4')).rejects.toBeInstanceOf(BudgetExceededError);
    expect(f.calls).toHaveLength(3);
    expect(http.stats()['b.example.org']?.requests).toBe(3);
  });

  it('comparte ritmo y presupuesto entre subdominios de un host comodín', async () => {
    const { http, f } = client(() => json({}), { '*.recruitee.com': { maxRequestsPerRun: 2 } });
    await http.get('https://uno.recruitee.com/api/offers/');
    await http.get('https://dos.recruitee.com/api/offers/');
    await expect(http.get('https://tres.recruitee.com/api/offers/')).rejects.toBeInstanceOf(BudgetExceededError);
    expect(f.calls).toHaveLength(2);
  });

  it('obedece Retry-After ante un 429 y luego reintenta', async () => {
    const clock = new FakeClock();
    const stamps: number[] = [];
    const { http } = client((_u, _i, call) => {
      stamps.push(clock.now());
      return call === 1 ? new Response('slow down', { status: 429, headers: { 'Retry-After': '7' } }) : json({ ok: true });
    }, {}, clock);
    const res = await http.get('https://c.example.org/x');
    expect(res.status).toBe(200);
    expect(stamps[1]! - stamps[0]!).toBeGreaterThanOrEqual(7000);
  });

  it('aplica espera progresiva (exponencial) ante errores 5xx y se rinde tras los reintentos', async () => {
    const clock = new FakeClock();
    const stamps: number[] = [];
    const { http, f } = client(() => {
      stamps.push(clock.now());
      return new Response('down', { status: 503 });
    }, { 'd.example.org': { minIntervalMs: 0 } }, clock);
    await expect(http.get('https://d.example.org/x')).rejects.toBeInstanceOf(HttpError);
    expect(f.calls).toHaveLength(4);
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]!);
    expect(gaps).toEqual([500, 1000, 2000]);
  });

  it('trata el bloqueo 1015 de Cloudflare como límite de ritmo', async () => {
    const { http, f } = client((_u, _i, call) => (call === 1 ? new Response('error code: 1015', { status: 200 }) : json({ jobs: [] })));
    const res = await http.get('https://apply.workable.com/api/v1/widget/accounts/x');
    expect(JSON.parse(res.body)).toEqual({ jobs: [] });
    expect(f.calls).toHaveLength(2);
    expect(http.stats()['apply.workable.com']?.retries).toBe(1);
  });

  it('espera al reinicio cuando la fuente anuncia X-RateLimit-Remaining: 0', async () => {
    const clock = new FakeClock();
    const stamps: number[] = [];
    const { http } = client(() => {
      stamps.push(clock.now());
      return json({}, 200, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '30' });
    }, { 'e.example.org': { minIntervalMs: 0 } }, clock);
    await http.get('https://e.example.org/1');
    await http.get('https://e.example.org/2');
    expect(stamps[1]! - stamps[0]!).toBeGreaterThanOrEqual(30000);
  });

  it('abandona la fuente si Retry-After pide una espera excesiva en vez de bloquear la ejecución', async () => {
    const { http } = client(() => new Response('', { status: 429, headers: { 'Retry-After': '3600' } }));
    await expect(http.get('https://f.example.org/x')).rejects.toThrow(/pide esperar 3600 s/);
  });

  it('no reintenta errores definitivos como 404', async () => {
    const { http, f } = client(() => new Response('nope', { status: 404 }));
    await expect(http.get('https://g.example.org/x')).rejects.toMatchObject({ status: 404 });
    expect(f.calls).toHaveLength(1);
  });

  it('usa la caché por ETag: un 304 devuelve el cuerpo guardado', async () => {
    const { http, f } = client((_u, init, call) => {
      if (call === 1) return json({ v: 1 }, 200, { ETag: '"abc"' });
      expect((init?.headers as Record<string, string>)['If-None-Match']).toBe('"abc"');
      return new Response(null, { status: 304 });
    });
    await http.get('https://h.example.org/feed');
    const second = await http.get('https://h.example.org/feed');
    expect(second).toEqual({ status: 200, body: JSON.stringify({ v: 1 }), fromCache: true });
    expect(f.calls).toHaveLength(2);
  });

  it('interpreta Retry-After en segundos o como fecha HTTP', () => {
    expect(parseRetryAfter('5', 0)).toBe(5000);
    expect(parseRetryAfter(new Date(10000).toUTCString(), 0)).toBe(10000);
    expect(parseRetryAfter('mañana', 0)).toBeNull();
    expect(parseRetryAfter(null, 0)).toBeNull();
  });
});

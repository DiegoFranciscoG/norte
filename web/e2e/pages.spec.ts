import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { makePdf } from './fixtures/make-pdf';

const CV = ['Persona Ficticia', 'Desarrolladora backend', 'Experiencia: Ene 2021 - Actualidad', 'Java, Spring Boot y PostgreSQL'];

/** Solo corre con playwright.pages.config.ts: comprueba lo propio de la publicación en GitHub Pages. */
test.describe('Publicación en GitHub Pages', () => {
  test('todo carga desde la subruta y la CSP no bloquea nada, ni siquiera al leer el CV', async ({ page, baseURL }) => {
    const failed: string[] = [];
    const outside: string[] = [];
    const base = new URL(baseURL ?? '');
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.origin === base.origin && !url.pathname.startsWith(base.pathname)) outside.push(r.url());
    });
    await page.addInitScript(() => {
      const seen: string[] = [];
      (globalThis as unknown as { cspViolations: string[] }).cspViolations = seen;
      document.addEventListener('securitypolicyviolation', (e) => seen.push(`${e.violatedDirective} ${e.blockedURI}`));
    });

    await page.goto('./');
    await expect(page).toHaveURL(/\/norte\/bienvenida$/);
    await page.setInputFiles('#onb-cv', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: makePdf(CV) });
    await expect(page.getByText(/Detectamos \d+ habilidades/)).toBeVisible({ timeout: 20000 });

    expect(failed).toEqual([]);
    expect(outside).toEqual([]);
    expect(await page.evaluate(() => (globalThis as unknown as { cspViolations: string[] }).cspViolations)).toEqual([]);
  });

  test('la CSP viaja en el HTML y de verdad bloquea scripts en línea', async ({ page }) => {
    await page.goto('./');
    const meta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(meta).toHaveAttribute('content', /script-src 'self';/);
    await expect(meta).not.toHaveAttribute('content', /frame-ancestors/);
    const executed = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'globalThis.inlineRan = true';
      document.head.append(script);
      return (globalThis as unknown as { inlineRan?: boolean }).inlineRan === true;
    });
    expect(executed).toBe(false);
  });

  test('un enlace directo a una página interna funciona', async ({ page }) => {
    const response = await page.goto('observatorio');
    expect(response?.status()).toBe(404); // Así responde Pages: 404.html lleva la aplicación, que abre la ruta pedida.
    await expect(page).toHaveURL(/\/norte\/observatorio$/);
    await expect(page.getByRole('heading', { name: 'Observatorio del mercado tech' })).toBeVisible();
  });

  test('la configuración de ejecución se sirve desde la subruta', async ({ request }) => {
    const config = await (await request.get('config.json')).json();
    expect(config).toEqual({ apiBaseUrl: '', pollMinutes: 5, newJobsThreshold: 10 });
  });

  test.describe('service worker', () => {
    test.use({ serviceWorkers: 'allow' });

    test('su manifiesto es íntegro, se instala y la web abre sin conexión', async ({ page, context, request, baseURL }) => {
      const manifest = await (await request.get('ngsw.json')).json();
      expect(manifest.index).toBe('/norte/index.html');
      const origin = new URL(baseURL ?? '').origin;
      for (const [path, hash] of Object.entries(manifest.hashTable)) {
        const body = await (await request.get(origin + path)).body();
        expect(createHash('sha1').update(body).digest('hex'), path).toBe(hash);
      }

      await page.goto('./');
      await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, { timeout: 45_000 });
      const state = await page.evaluate(async () => (await fetch('ngsw/state')).text());
      expect(state).toContain('Driver state: NORMAL');

      // Con el service worker ya al mando, abrir el observatorio deja sus datos guardados para usarlos sin conexión.
      const heading = page.getByRole('heading', { name: 'Observatorio del mercado tech' });
      const figures = page.getByText('Vacantes abiertas', { exact: true });
      await page.goto('observatorio');
      await expect(heading).toBeVisible();
      await expect(figures).toBeVisible();

      await context.setOffline(true);
      await page.reload();
      await expect(heading).toBeVisible();
      await expect(figures).toBeVisible();
    });
  });
});

import { defineConfig, devices } from '@playwright/test';

const PORT = 4301;

/**
 * Las mismas pruebas contra lo que se publica: build de producción bajo /norte/, con CSP y como lo sirve GitHub Pages.
 * Antes hay que armar el sitio: npm run ingest:demo y npm run pages:build -- /norte/ site.
 * El service worker se bloquea salvo donde se prueba, porque sus peticiones escapan de page.route.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/norte/`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/serve-pages.mjs ../site ${PORT} /norte/`,
    url: `http://127.0.0.1:${PORT}/norte/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 15_000,
  },
});

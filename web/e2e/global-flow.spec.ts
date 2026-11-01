import { expect, test, type Page } from '@playwright/test';
import { makePdf } from './fixtures/make-pdf';

const CV = ['Persona Ficticia', 'Desarrolladora backend', 'Experiencia: Ene 2021 - Actualidad', 'Java, Spring Boot, Docker, Kubernetes y PostgreSQL', 'Ingles avanzado (C1)'];
const SHOTS = process.env['NORTE_SHOTS'];

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** Recorre el ingreso guiado como alguien que vive en Madrid y busca de todo. */
async function onboardInMadrid(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page).toHaveURL(/bienvenida/);
  await expect(page.getByRole('heading', { name: 'Empecemos por tu CV' })).toBeVisible();
  await shot(page, '01-bienvenida');
  await page.setInputFiles('#onb-cv', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: makePdf(CV) });
  await expect(page.getByText(/Detectamos \d+ habilidades/)).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tus datos' })).toBeVisible();
  await expect(page.locator('#onb-english')).toHaveValue('C1');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: '¿Dónde vives?' })).toBeVisible();
  const main = page.locator('main');
  await main.getByLabel('País').selectOption('ES');
  await main.getByLabel('Ciudad').fill('Madrid');
  await main.getByLabel('Ciudad').press('Tab');
  await shot(page, '02-ubicacion');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: '¿Cómo quieres trabajar?' })).toBeVisible();
  await shot(page, '03-modalidades');
  await page.getByRole('button', { name: 'Ver mis empleos' }).click();
  await expect(page).toHaveURL(/\/$/);
}

const companies = (page: Page) => page.locator('app-job-card .company').allInnerTexts();

test.describe('NORTE global: ubicación, modalidades y recomendaciones', () => {
  test('alguien en Madrid ve lo de su ciudad y los remotos que admiten España, no lo presencial de otros países', async ({ page }) => {
    await onboardInMadrid(page);
    await expect(page.getByRole('button', { name: /Para ti/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('app-job-card').first()).toBeVisible();
    await shot(page, '04-para-ti-madrid');
    const seen = await companies(page);
    expect(seen).toContain('Ibérica Cloud Demo');
    expect(seen).toContain('Global Remote Demo');
    expect(seen).not.toContain('Andina Software Demo');
    expect(seen).not.toContain('Remoto Latam Demo');

    await page.getByRole('button', { name: /En Madrid/ }).click();
    expect(new Set(await companies(page))).toEqual(new Set(['Ibérica Cloud Demo']));
  });

  test('cambiar la ubicación desde la barra cambia las recomendaciones', async ({ page }) => {
    await onboardInMadrid(page);
    await page.getByRole('button', { name: /Tu ubicación: Madrid, España/ }).click();
    const dialog = page.getByRole('dialog', { name: '¿Dónde vives?' });
    await dialog.getByLabel('País').selectOption('EC');
    await dialog.getByLabel('Ciudad').fill('Cuenca');
    await dialog.getByLabel('Ciudad').press('Tab');
    await dialog.getByRole('button', { name: 'Listo' }).click();
    await page.getByRole('button', { name: /En Cuenca/ }).click();
    expect(new Set(await companies(page))).toEqual(new Set(['Andina Software Demo']));
    await page.getByRole('button', { name: /Remoto para ti/ }).click();
    const remote = await companies(page);
    expect(remote).toContain('Remoto Latam Demo');
    expect(remote).not.toContain('Ibérica Cloud Demo');
  });

  test('la ficha muestra el encaje y más vacantes para ti', async ({ page }) => {
    await onboardInMadrid(page);
    await page.locator('app-job-card h3 a').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/Tu encaje:/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Más para ti' })).toBeVisible();
    await shot(page, '05-vacante');
  });

  test('con 10 empleos nuevos aparece «Recargar» y al pulsarlo se marcan como nuevos', async ({ page }) => {
    await onboardInMadrid(page);
    const index = await (await page.request.get('data/v1/index.json')).json();
    const jobs = await (await page.request.get('data/v1/jobs.json')).json();
    const worldwide = jobs.jobs.find((j: { remoteScope: { type: string } | null }) => j.remoteScope?.type === 'worldwide');
    const fresh = Array.from({ length: 10 }, (_, i) => ({ ...worldwide, id: `j_nuevo_${i}`, title: `Vacante nueva ${i + 1}`, fingerprint: `nuevo-${i}` }));
    await page.route('**/data/v1/index.json', (r) => r.fulfill({ json: { ...index, build: { ...index.build, version: 'nueva-version' } } }));
    await page.route('**/data/v1/jobs.json', (r) => r.fulfill({ json: { ...jobs, jobs: [...fresh, ...jobs.jobs] } }));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const reload = page.getByRole('button', { name: /Aparecieron 10 empleos nuevos · Recargar/ });
    await expect(reload).toBeVisible({ timeout: 15000 });
    await shot(page, '06-recargar');
    await reload.click();
    await expect(reload).toBeHidden();
    await page.getByRole('button', { name: 'Más recientes' }).click();
    await expect(page.locator('app-job-card .tag.new').first()).toBeVisible();
  });

  test('el observatorio publica cifras, gráficos e informes', async ({ page }) => {
    await onboardInMadrid(page);
    await page.goto('observatorio');
    await expect(page.getByRole('heading', { name: 'Observatorio del mercado tech' })).toBeVisible();
    await expect(page.getByText('Vacantes abiertas', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Habilidades más pedidas' })).toBeVisible();
    await shot(page, '07-observatorio');
    await page.locator('.reports a').first().click();
    await expect(page.getByRole('heading', { name: /El mercado tech accesible desde Ecuador en/ })).toBeVisible();
    await expect(page.getByText(/NORTE registró \d+ vacantes/)).toBeVisible();
    await shot(page, '08-informe');
  });
});

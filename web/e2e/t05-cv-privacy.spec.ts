import { expect, test, type Request } from '@playwright/test';
import { makePdf } from './fixtures/make-pdf';

const MARKER = 'ZORRO-CV-7781';
const CV_LINES = [
  `Ana Ficticia ${MARKER}`,
  'Desarrolladora de software en Cuenca',
  'Experiencia: Ene 2022 - Actualidad, Empresa Ficticia',
  'Java, Spring Boot, Angular, Docker y PostgreSQL',
  'Ingles intermedio (B1)',
];

test.describe('T-05 el CV no sale del navegador', () => {
  test('ninguna petición lleva el archivo ni su texto, y no se envía nada con POST/PUT', async ({ page }) => {
    const requests: Request[] = [];
    await page.goto('perfil');
    await expect(page.getByRole('heading', { name: 'Tu perfil' })).toBeVisible();
    page.on('request', (r) => requests.push(r));

    const pdf = makePdf(CV_LINES);
    await page.setInputFiles('#cv-file', { name: 'cv-ficticio.pdf', mimeType: 'application/pdf', buffer: pdf });
    await expect(page.getByText(/habilidades detectadas/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Spring Boot').first()).toBeVisible();

    const origin = new URL(page.url()).origin;
    const pdfText = pdf.toString('latin1');
    for (const r of requests) {
      const body = r.postData() ?? '';
      expect(r.method(), `${r.method()} ${r.url()}`).toBe('GET');
      expect(r.url().startsWith(origin) || r.url().startsWith('blob:') || r.url().startsWith('data:'), `petición externa: ${r.url()}`).toBe(true);
      expect(decodeURIComponent(r.url())).not.toContain(MARKER);
      expect(body).not.toContain(MARKER);
      expect(body).not.toContain(pdfText.slice(0, 200));
    }
    // Lo único que se descarga es el worker de pdf.js, desde el propio sitio.
    const fetched = requests.map((r) => new URL(r.url()).pathname).filter((p) => !p.endsWith('.js') && !p.endsWith('.mjs') && !p.endsWith('.map'));
    expect(fetched).toEqual([]);
  });

  test('los datos detectados se pueden aplicar al perfil y borrar del dispositivo', async ({ page }) => {
    await page.goto('perfil');
    await page.setInputFiles('#cv-file', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: makePdf(CV_LINES) });
    await page.getByRole('button', { name: 'Usar estos datos' }).click();
    await expect(page.locator('#english')).toHaveValue('B1');
    const stored = await page.evaluate(() => localStorage.getItem('norte.profile.v1') ?? '');
    expect(stored).toContain('spring-boot');
    expect(stored).not.toContain(MARKER);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Borrar todo de este dispositivo/ }).click();
    await expect(page.locator('#english')).toHaveValue('');
  });
});

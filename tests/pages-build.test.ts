import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkApiUrl, checkBasePath, cspFromTemplate, injectCsp } from '../web/scripts/build-pages.mjs';

const template = readFileSync('web/nginx/default.conf.template', 'utf8');

describe('build para GitHub Pages', () => {
  it('acepta la ruta base de un repositorio o de un sitio de usuario, y nada más', () => {
    expect(checkBasePath('/norte/')).toBe('/norte/');
    expect(checkBasePath('/')).toBe('/');
    for (const bad of ['norte', '/norte', '', '/a b/', '/"><script>/', undefined]) {
      expect(() => checkBasePath(bad as string)).toThrow(/Ruta base no válida/);
    }
  });

  it('solo admite un origen https como API: el valor termina dentro de la CSP', () => {
    expect(checkApiUrl(undefined)).toBe('');
    expect(checkApiUrl('  ')).toBe('');
    expect(checkApiUrl('https://norte-api.onrender.com/')).toBe('https://norte-api.onrender.com');
    for (const bad of ['http://norte-api.onrender.com', 'https://norte-api.onrender.com/api', 'https://x.test/?a=1', 'https://user:clave@x.test', "https://x.test; script-src 'unsafe-inline'", 'nada']) {
      expect(() => checkApiUrl(bad)).toThrow(/NORTE_API_URL/);
    }
  });

  it('reutiliza la CSP de nginx, sin frame-ancestors y con la API en connect-src', () => {
    const withoutApi = cspFromTemplate(template, '');
    expect(withoutApi).toContain("script-src 'self';");
    expect(withoutApi).toContain("connect-src 'self' https://api.github.com;");
    expect(withoutApi).not.toContain('frame-ancestors');
    expect(withoutApi).not.toContain('${');
    expect(cspFromTemplate(template, 'https://api.test')).toContain("connect-src 'self' https://api.github.com https://api.test;");
    expect(() => cspFromTemplate('server {}', '')).toThrow(/No se encontró la CSP/);
  });

  it('pone la CSP justo después del charset, antes de cualquier otra cosa', () => {
    const html = injectCsp('<head>\n  <meta charset="utf-8">\n  <title>x</title></head>', "default-src 'self'");
    expect(html).toContain('<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="default-src \'self\'">\n  <title>');
    expect(() => injectCsp('<head></head>', 'x')).toThrow(/charset/);
  });

  it('la publicación y CI usan este mismo script, que pasa la ruta base hasta ng build', () => {
    expect(readFileSync('.github/workflows/ingest.yml', 'utf8')).toContain('npm run pages:build -- "${BASE_PATH}/" site');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('npm run pages:build -- /norte/ site');
  });
});

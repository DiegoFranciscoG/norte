import type { SourceTask, RawPosting } from './sources/types.js';

/**
 * Datos FICTICIOS para levantar NORTE en local sin red (docker compose).
 * El índice resultante lleva demo: true y la interfaz muestra un aviso; nunca se publica en GitHub Pages.
 */
const COMPANIES = [
  { name: 'Andina Software Demo', region: 'EC' as const, city: 'Cuenca' },
  { name: 'Pacífico Datos Demo', region: 'EC' as const, city: 'Guayaquil' },
  { name: 'Volcán Fintech Demo', region: 'EC' as const, city: 'Quito' },
  { name: 'Remoto Latam Demo', region: 'LATAM' as const, city: null },
];

const TITLES = [
  { title: 'Desarrollador Backend Java', skills: 'Java, Spring Boot, PostgreSQL, Docker, pruebas con JUnit y Testcontainers', years: '3 años de experiencia' },
  { title: 'Senior Full Stack Engineer (Angular + Spring)', skills: 'Angular, TypeScript, Spring Boot, Kubernetes, CI/CD con GitHub Actions. Nice to have: Kafka', years: '5+ years of experience. Advanced English (C1)' },
  { title: 'Junior Frontend Developer', skills: 'HTML, CSS, JavaScript, React', years: '1 año de experiencia' },
  { title: 'Data Engineer', skills: 'Python, SQL, Airflow, dbt, AWS', years: '4 years of experience with data pipelines, English B2' },
  { title: 'Ingeniero DevOps', skills: 'Linux, Docker, Kubernetes, Terraform, AWS. Deseable: Azure', years: '3 años de experiencia' },
  { title: 'QA Automation Engineer', skills: 'Playwright, Cypress, Java, Selenium', years: '2+ years of experience' },
  { title: 'Desarrollador Móvil Flutter', skills: 'Flutter, Dart, Firebase, Git', years: '2 años de experiencia' },
  { title: 'Analista de Datos', skills: 'SQL, Power BI, Excel, Python', years: 'experiencia mínima de 2 años' },
];

function demoPostings(now: Date): RawPosting[] {
  const out: RawPosting[] = [];
  let n = 0;
  for (const c of COMPANIES) {
    for (const t of TITLES) {
      n++;
      if (n % 3 === 0) continue;
      const remote = c.city === null || n % 4 === 0;
      const published = new Date(now.getTime() - (n % 20) * 86400000).toISOString();
      out.push({
        sourceId: 'demo',
        externalId: `demo-${n}`,
        title: t.title,
        company: c.name,
        companyRegion: c.region,
        sector: 'software',
        locationTexts: remote ? ['Remote - LATAM'] : [`${c.city}, Ecuador`],
        countryIso: remote ? null : 'EC',
        city: remote ? null : c.city,
        modality: remote ? 'remote' : n % 2 === 0 ? 'hybrid' : 'onsite',
        employmentText: n % 7 === 0 ? 'Freelance' : 'Full-time',
        descriptionText: `DATO FICTICIO DE DEMOSTRACIÓN.\nRequisitos:\n${t.skills}.\n${t.years}.`,
        salary: n % 2 === 0 ? { min: 900 + n * 40, max: 1400 + n * 60, currency: 'USD', period: 'month' } : null,
        publishedAt: published,
        url: `https://example.org/norte-demo/${n}`,
        applyUrl: `https://example.org/norte-demo/${n}`,
      });
    }
  }
  return out;
}

export function demoTask(): SourceTask {
  return {
    sourceId: 'demo',
    sourceName: 'Datos ficticios de demostración',
    kind: 'portal',
    attribution: { text: 'Dato ficticio de demostración', url: 'https://example.org/norte-demo', follow: false },
    allowInAlerts: false,
    minHoursBetweenFetches: 0,
    run: async (ctx) => demoPostings(ctx.now),
  };
}

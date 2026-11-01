# Investigación y fuentes

Fuentes oficiales o primarias consultadas para decidir qué datos entran, con qué reglas y con qué versiones. El detalle de cada fuente de vacantes está en [fuentes.md](fuentes.md).

| # | Fuente (oficial / confiable) | URL | Consultada | Qué se tomó de aquí |
|---|---|---|---|---|
| 1 | Greenhouse — Job Board API | https://developers.greenhouse.io/job-board.html | 2026-10-31 | Endpoint público sin autenticación para GET; campos de vacante |
| 2 | Lever — Postings API | https://github.com/lever/postings-api | 2026-10-31 | Vacantes publicadas son públicas; filtros `location`, `commitment`; dominio UE |
| 3 | Ashby — Job Postings API | https://developers.ashbyhq.com/docs/public-job-posting-api | 2026-10-31 | Endpoint público y `includeCompensation` |
| 4 | Workable — API para página de empleo | https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-for-your-careers-page | 2026-10-31 | Endpoint público de vacantes publicadas; límite observado (error 1015) |
| 5 | Recruitee — Careers Site API | https://docs.recruitee.com/reference/intro-to-careers-site-api | 2026-10-31 | `/api/offers/` público para mostrar ofertas |
| 6 | SmartRecruiters — Posting API | https://developers.smartrecruiters.com/docs/posting-api | 2026-10-31 | Listado y detalle de vacantes públicas; filtro por país |
| 7 | Remotive — Remote Jobs API | https://github.com/remotive-com/remote-jobs-api | 2026-10-31 | Atribución, máximo 4 consultas/día, sin reenvío a Google Jobs, exclusión de alertas |
| 8 | Remote OK — aviso legal dentro de la API | https://remoteok.com/api | 2026-10-31 | Enlace sin `nofollow`, mención como fuente, sin logo |
| 9 | Himalayas — Remote Jobs API | https://himalayas.app/api | 2026-10-31 | Búsqueda por país (`country=EC`), 20 por página, `applicationLink` sin modificar, enlace visible |
| 10 | We Work Remotely — RSS público | https://weworkremotely.com/remote-job-rss-feed | 2026-10-31 | Uso libre con atribución de enlaces |
| 11 | Arbeitnow — Job Board API | https://www.arbeitnow.com/blog/job-board-api | 2026-10-31 | Uso gratuito sin abuso; agradecen enlace |
| 12 | Jobicy — API y RSS | https://jobicy.com/jobs-rss-feed | 2026-10-31 | Crédito con enlace; máximo una consulta por hora; filtro `geo=latam` |
| 13 | Get on Board — ayuda de la API | https://www.getonbrd.com/help/que-puedo-hacer-con-la-api-de-get-on-board?lang=en | 2026-10-31 | La API pública permite construir una búsqueda con vacantes publicadas |
| 14 | LinkedIn — robots.txt | https://www.linkedin.com/robots.txt | 2026-10-31 | Prohibición del acceso automatizado → solo enlace profundo |
| 15 | Multitrabajos — robots.txt | https://www.multitrabajos.com/robots.txt | 2026-10-31 | Búsquedas parametrizadas bloqueadas → solo enlace profundo |
| 16 | Computrabajo Ecuador — robots.txt | https://ec.computrabajo.com/robots.txt | 2026-10-31 | Búsquedas parametrizadas bloqueadas → solo enlace profundo |
| 17 | Upwork — solicitud de API | https://support.upwork.com/hc/en-us/articles/115015857647 | 2026-10-31 | API solo con aprobación y uso personal/interno → excluida |
| 18 | ESCO — descarga | https://esco.ec.europa.eu/en/use-esco/download | 2026-10-31 | Versión v1.2.1; descarga por formulario con correo; formatos CSV |
| 19 | ESCO — API de búsqueda | https://ec.europa.eu/esco/api | 2026-10-31 | Etiquetas en español y URI de habilidades (consulta única, versionada) |
| 20 | EUR-Lex — Decisión 2011/833/EU | https://eur-lex.europa.eu/eli/dec/2011/833/oj | 2026-10-31 | Reutilización de documentos de la Comisión con atribución |
| 21 | Banco Central Europeo — tipos de referencia | https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml | 2026-10-31 | Conversión de salarios a USD con fecha y fuente |
| 22 | INEC — Geoportal / DPA | https://www.ecuadorencifras.gob.ec/documentos/web-inec/Geografia_Estadistica/Micrositio_geoportal/index.html | 2026-10-31 | 24 provincias y sus capitales para normalizar ubicaciones |
| 23 | Maven Central — Spring Boot | https://repo1.maven.org/maven2/org/springframework/boot/spring-boot/maven-metadata.xml | 2026-10-31 | Spring Boot 4.1.2 (última GA de la línea 4.1) |
| 24 | Spring Initializr — metadatos | https://start.spring.io/metadata/client | 2026-10-31 | Versión por defecto 4.1.2 y Java 25 soportado |
| 25 | npm — @angular/core | https://www.npmjs.com/package/@angular/core | 2026-10-31 | Angular 22.2.4; exige TypeScript >=6.0 <6.1 y Node ^22.22.3 \|\| ^24.15.0 \|\| >=26 |
| 26 | Node.js — índice de versiones | https://nodejs.org/dist/index.json | 2026-10-31 | Node 26.13.0 «Lithium» es la LTS vigente (2026-10-28) |
| 27 | Docker Hub — imágenes oficiales | https://hub.docker.com/_/postgres | 2026-10-31 | postgres 18.6-alpine, eclipse-temurin 25.0.5_8-jre, nginx-unprivileged 1.29.8, mailpit v1.29.7 |
| 28 | Ley Orgánica de Protección de Datos Personales (Registro Oficial Suplemento 459, 26-05-2021), copia publicada por la SEPS | https://seps.gob.ec/wp-content/uploads/Ley-Orgánica-de-Protección-de-Datos-Personales-2022.pdf | 2026-10-31 | Consentimiento explícito (art. 8) y otras bases (art. 7); derechos de acceso, rectificación, eliminación, oposición, portabilidad y a no ser objeto de decisiones solo automatizadas (ver legal.md) |

| 29 | GitHub Docs — eventos que disparan workflows (schedule) | https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows | 2026-11-01 | El intervalo mínimo programable es de 5 minutos y los programados pueden retrasarse al inicio de cada hora → ingesta cada 30 minutos en los minutos 7 y 37 |
| 30 | GitHub Docs — límites de GitHub Pages | https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits | 2026-11-01 | Límite blando de 10 compilaciones por hora que no aplica a workflows propios; 100 GB/mes de ancho de banda; 1 GB por sitio |
| 31 | GeoNames — readme de la descarga | https://download.geonames.org/export/dump/readme.txt | 2026-11-01 | Ciudades de más de 15 000 habitantes o capitales (cities15000), licencia CC BY 4.0 con atribución |
| 32 | Unicode CLDR (vía Intl.DisplayNames) | https://cldr.unicode.org/ | 2026-11-01 | Nombres de países en español e inglés; licencia Unicode |
| 33 | Himalayas — búsqueda sin país | https://himalayas.app/jobs/api/search?sort=recent&page=1 | 2026-11-01 | Llamada verificada: vacantes de todo el mundo con `locationRestrictions` por país |
| 34 | Jobicy — API sin filtro geográfico | https://jobicy.com/api/v2/remote-jobs?count=50 | 2026-11-01 | Llamada verificada: remotos de todas las regiones con su `jobGeo` |

## Supuestos (no verificados)
- **S-01** La página de licencia propia de ESCO no se localizó; se asume la política general de reutilización de la Comisión (Decisión 2011/833/EU) y se atribuye.
- **S-02** El texto completo de las condiciones de uso de Multitrabajos y Computrabajo no se localizó; la exclusión se basa en la premisa del proyecto y en sus `robots.txt`.
- **S-03** Get on Board no publica una cláusula de atribución para su API pública; se atribuye igual por prudencia.
- **S-04** Conversión horaria a mensual: 173,33 horas (40 h × 52 semanas ÷ 12). Es una convención, no una norma; se aplica igual a todas las fuentes.
- **S-05** Cuando una vacante declara nivel pero no años, se infieren años mínimos por nivel (configurables en `data/config/scoring.json`) y se marca como «inferido».
- **S-06** Un remoto sin alcance declarado pero ubicado en un país («Remote — Spain») exige residir en ese país.
- **S-07** La pertenencia de países a regiones (Latinoamérica, Américas, Europa, EMEA, Asia-Pacífico…) es una agrupación propia y configurable; no hay una norma oficial para esos términos de las vacantes.
- **S-08** En Himalayas, una vacante sin restricciones de ubicación admite a todo el mundo (así la presenta su sitio).

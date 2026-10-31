# Fuentes de vacantes — verificación del 31 de octubre de 2026

Todo lo de este documento sale de **llamadas reales** hechas el 2026-10-31 a cada API y de la lectura de sus términos. Los datos estructurados viven en [`data/sources/`](../data/sources) y son los que usa la ingesta: este documento los explica, no los duplica.

## 1. Resumen y hallazgo principal

| Qué | Resultado |
|---|---|
| Tableros de empresa verificados | **66** en 7 sistemas (Greenhouse 16, Workable 13, Ashby 13, Lever 11, SmartRecruiters 7, Recruitee 4, Teamtailor 2) |
| Con vacantes ubicadas en Ecuador al verificar | **33** |
| Empresas con sede u oficina en Ecuador | 22 (Devsu, Stack Builders, Kruger/Rekluti, Kushki, Produbanco, Jobsity, AltScore, Thoughtworks, Source Meridian, PayJoy, Grupo Mariposa, Veolia, SGS, PedidosYa, Puntonet, Quala, WWF, Coface, Genfar, Aleph, Wursta…) |
| Remoto para Latinoamérica o mundial | 44 |
| Páginas de empleo propias (solo enlace) | 14 (4 en Cuenca) |
| Portales remotos y regionales con API abierta | 7 |
| Excluidos por términos de uso o por no poder verificarse | 8 |

**Lo que tienes que saber (es la parada que pedía la fase 1):** pocas empresas ecuatorianas usan los seis sistemas propuestos. Los usan sobre todo las tecnológicas y de *nearshore* (Devsu, Stack Builders, Kruger, Kushki, Jobsity, AltScore) y las filiales de multinacionales que publican en SmartRecruiters (Veolia, SGS, Coface, Genfar, PedidosYa). La banca, el retail y las telecomunicaciones usan portales propios (Pichincha, Produbanco), HiringRoom (Graiman), Gupy (Cobis Topaz) o **Teamtailor** (Puntonet).

Por eso se tomaron dos decisiones:

1. **Se añadió Teamtailor como séptimo sistema.** Publica un RSS público por empresa con ciudad, país y modalidad. Con él entra Puntonet, que tiene vacantes en **Cuenca**.
2. **Se reforzó el registro de páginas de empleo propias** (14 empresas, 4 de Cuenca) con revisión programada cada 14 días y enlace directo, sin extracción.

**Cuenca presencial, dicho sin rodeos:** al verificar, las vacantes presenciales de TI en Cuenca dentro de fuentes legales eran escasas (Puntonet, Grupo Mariposa —mayoría no TI— y vacantes remotas que listan Cuenca, como Launch Potato y Bluelight). El grupo no queda vacío, pero será el más pequeño. La mayor oportunidad real para Cuenca está en el grupo «remoto abierto a Ecuador».

## 2. Tableros de empresa (ATS)

Todos responden JSON o RSS **sin clave ni autenticación**, con las vacantes que la empresa decidió publicar.

| Sistema | Endpoint verificado | Empresas probadas | Ubicación | Modalidad | Salario | Nivel | Idioma | Notas de uso |
|---|---|---|---|---|---|---|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{empresa}/jobs?content=true` | gitlab (200), thoughtworks (200) | `location.name`, `offices[]` | en metadatos propios de cada empresa o en el texto | no viene en el listado | metadato propio («Job Grade») | `language` (idioma del aviso) | «Job Board data is publicly available»; descripción HTML con entidades escapadas |
| Lever | `api.lever.co/v0/postings/{empresa}?mode=json` (UE: `api.eu.lever.co`) | binance (200), bluelightconsulting (200); kushki → 404 | `categories.location`, `allLocations`, `country` | `workplaceType` (onsite/hybrid/remote) | `salaryRange` solo si la empresa lo llena | en el título | no | filtros `location`, `commitment`, `skip`, `limit` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{empresa}?includeCompensation=true` | ramp (200), deel (200, vacío) | `location`, `secondaryLocations[]`, `address` | `workplaceType`, `isRemote` | `compensation` con mínimo, máximo, moneda e intervalo | no | no | API pública para páginas de empleo y agregadores |
| Workable | `apply.workable.com/api/v1/widget/accounts/{empresa}?details=true` | devsu (200), jobsity (200, vacío) | `country`, `city`, `locations[]` | `telecommuting` | no | `experience` («Mid-Senior level») | no | `www.workable.com/api/accounts/{x}` responde 302 hacia este endpoint. **Cloudflare devolvió error 1015 (límite de ritmo)** tras ~140 consultas en un minuto: se fija 1 consulta cada 3 s |
| Recruitee | `{empresa}.recruitee.com/api/offers/` | bunq (200), hostaway (200) | `location`, `city`, `country_code`, `locations[]` | `remote`, `hybrid`, `on_site` | `salary {min,max,period,currency}` | `experience_code` | `translations` | trae `mailbox_email`: **se descarta siempre** (dato de contacto) |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/{empresa}/postings?country=ec` | BoschGroup (200), GrupoMariposa1 (200) | `location {city, region, country, remote, hybrid}` | `location.remote/hybrid` | no | `experienceLevel` | `language.code` | responde 200 vacío para cualquier identificador; la descripción exige una llamada de detalle por vacante (solo se pide para títulos de TI) |
| Teamtailor | `{empresa}.teamtailor.com/jobs.rss` | puntonet (200, 65 ítems), qualacompany (200) | `tt:locations` (ciudad, país) | `remoteStatus` | no | no | no | RSS público publicado por la propia empresa |

## 3. Portales remotos y regionales

| Portal | Endpoint | Qué aporta | Términos verificados | Atribución en la tarjeta |
|---|---|---|---|---|
| Remote OK | `remoteok.com/api` | salario anual numérico (0 = no declarado), etiquetas | **el primer elemento del arreglo es el aviso legal**: enlazar sin `nofollow` y mencionar Remote OK; no usar su logo | «Publicada en Remote OK» + enlace |
| Remotive | `remotive.com/api/remote-jobs?category=software-dev` | `candidate_required_location`, `job_type`, salario en texto libre | enlazar y mencionar; **máximo 4 consultas al día** (más de 2 por minuto se bloquea); prohibido reenviar a Google Jobs, LinkedIn, Jooble o Neuvoo; prohibido exigir registro para mostrarlas; llegan con 24 h de retraso | «Publicada en Remotive» + enlace; **excluida de las alertas por correo** |
| Himalayas | `himalayas.app/jobs/api/search?country=EC&sort=recent` | salario con moneda y periodo, `locationRestrictions`, husos horarios, `seniority` | API pública sin clave con cupo compartido; usar `applicationLink` sin modificar y mostrar enlace visible a Himalayas; 20 por página | «Publicada en Himalayas» + enlace |
| We Work Remotely | `weworkremotely.com/remote-jobs.rss` | `region` («USA Only», «Anywhere in the World»), `skills`, `type` | «cualquiera puede usar el RSS; solo pedimos atribuir los enlaces» | «Publicada en We Work Remotely» + enlace |
| Arbeitnow | `arbeitnow.com/api/job-board-api` | vacantes de ATS europeos; `remote` | API gratuita «sin abusar», agradecen enlazar | «Publicada en Arbeitnow» + enlace; solo remotas |
| Jobicy | `jobicy.com/api/v2/remote-jobs?count=100&geo=latam` | `jobGeo`, `jobLevel` | acreditar con enlace directo; botón de postular a la URL original; **máximo una consulta por hora** | «Publicada en Jobicy» + enlace |
| Get on Board | `getonbrd.com/api/v0/categories/{cat}/jobs` | Latinoamérica: `remote_modality`, `countries`, salario mensual, `seniority`, sección `desirable` | la API pública «permite construir una búsqueda o bolsa de empleo con vacantes públicas»; sin cláusula de atribución | «Publicada en Get on Board» + enlace (por prudencia) |

Ninguna vacante de portal se marca con datos estructurados `JobPosting`: Remotive lo prohíbe expresamente y se aplica la misma regla a todos.

## 4. Fuentes excluidas

| Fuente | Motivo verificado | Alternativa |
|---|---|---|
| LinkedIn | su `robots.txt` declara: el uso de robots u otros medios automatizados sin permiso expreso está estrictamente prohibido | enlace profundo |
| Multitrabajos | condiciones restrictivas; su `robots.txt` bloquea las búsquedas parametrizadas | enlace profundo |
| Computrabajo | condiciones restrictivas; su `robots.txt` bloquea las búsquedas parametrizadas | enlace profundo |
| Upwork | la API exige solicitud aprobada y es solo para uso personal o interno | enlace profundo |
| Workana | sin API pública; sus vacantes Premium sí entran por su tablero de Workable | enlace profundo |
| Torre | API oficial en beta con acceso por solicitud | enlace profundo |
| Working Nomads | sin documentación oficial ni términos que autoricen reutilizar el endpoint | ninguna |
| Careerjet Ecuador | `careerjet.com.ec` no resolvió; su API exige registro de afiliado | ninguna |

Nota: el texto completo de las condiciones de Multitrabajos y Computrabajo no se localizó en esta verificación; la exclusión se mantiene por la premisa del proyecto y por sus `robots.txt`. La prueba **T-01** impide que cualquier cliente HTTP del repositorio apunte a esos dominios.

## 5. ESCO (taxonomía europea de habilidades)

- Descarga gratuita en 28 idiomas desde el portal de ESCO; la versión vigente es **v1.2.1** (actualizada el 10/12/2025).
- Para descargar el CSV en español el portal pide **aceptar una declaración e ingresar un correo**, al que envía el enlace. Eso no lo puede hacer la ingesta ni debe hacerlo nadie más que tú: está documentado como paso manual en [`data/esco/README.md`](../data/esco/README.md).
- Lo que se embarca ahora: un subconjunto ESCO en español para las habilidades del catálogo, obtenido **una sola vez** con la API pública de ESCO (`ec.europa.eu/esco/api`, versión fijada) y versionado en el repositorio. La búsqueda nunca depende de ESCO en tiempo real.
- Licencia: ESCO es de la Comisión Europea; su reutilización se rige por la Decisión 2011/833/EU (reutilización libre, comercial o no, con atribución y sin distorsionar el contenido). **SUPUESTO a confirmar:** la página de licencia propia de ESCO no se localizó en esta verificación; se cita la decisión y se atribuye igual.

## 6. Registro de empresas

Lista completa con identificador del tablero, ciudad, sector, sitio web y evidencia en [`data/sources/companies.json`](../data/sources/companies.json). Sitios web: solo los que respondieron 200 al verificarlos; el resto queda en `null` en lugar de inventarse.

| Región | Empresas | Ejemplos |
|---|---|---|
| EC (sede u oficina en Ecuador) | 22 | Devsu, Stack Builders, Kruger/Rekluti, Kushki, Produbanco, Jobsity, AltScore, Thoughtworks, Grupo Mariposa, Puntonet |
| LATAM (remoto para la región) | 39 | Bluelight, Launch Potato, Coderio, Talentus, Curotec, Truelogic, Nortal, DaCodes, Workana Premium |
| WORLD (remoto sin restricción) | 5 | Canonical, Supabase, Zapier, Oyster, Welo Global |

Sectores cubiertos: software y consultoría de TI, fintech y banca, telecomunicaciones, consumo masivo, servicios, salud, educación, ONG y marketing digital.

Cuatro cuentas ecuatorianas existen en Workable **sin vacantes publicadas al verificar** (Kushki, Produbanco, Jobsity y el segundo tablero de AltScore). Se mantienen en el registro porque la ingesta las recogerá en cuanto publiquen.

## 7. Páginas de empleo propias (solo enlace)

[`data/sources/career-pages.json`](../data/sources/career-pages.json): 14 páginas que respondieron 200 el 2026-10-31, entre ellas Cooperativa Jardín Azuayo, Graiman, Indurama y Universidad de Cuenca (Cuenca); Banco Pichincha, Produbanco, Banco Internacional, Kushki, Jobsity, Datafast, Payphone y Netlife (Quito); Jelou y Siigo-Contífico (Guayaquil). El archivo registra también las que no se pudieron verificar y por qué.

## 8. Enlaces profundos

[`data/sources/deep-links.json`](../data/sources/deep-links.json): LinkedIn, Computrabajo, Multitrabajos, Encuentra Empleo (Ministerio del Trabajo), Get on Board, Workana, Upwork y Torre. NORTE solo construye la URL con la búsqueda escrita; la abre el navegador del usuario en una pestaña nueva.

## 9. Tipo de cambio

El salario se normaliza a **dólares mensuales** con los tipos de referencia diarios del **Banco Central Europeo** (`eurofxref-daily.xml`, verificado: 1 EUR = 1,1172 USD el 2026-10-30). Las monedas que el BCE no publica (COP, ARS, CLP, PEN) **no se convierten**: el salario queda como «moneda no convertible» y no entra en las estadísticas. Así no se publica ninguna cifra sin origen.

## 10. Políticas de consulta (aplicadas por la ingesta)

Definidas por host en `data/sources/sources.json → hostPolicies`: intervalo mínimo entre peticiones, presupuesto por ejecución, tiempo de espera de 20 s, 3 reintentos con espera exponencial y respeto de `Retry-After`. Las fuentes con tope diario (Remotive: 4 al día) guardan la hora de su última consulta y se saltan hasta cumplir el intervalo; mientras tanto se conservan sus vacantes previas sin marcarlas como cerradas.

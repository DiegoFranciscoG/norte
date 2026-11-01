# Algoritmo de encaje y brecha

El puntaje de NORTE es público y auditable. Se calcula **en tu navegador** sobre el índice estático (tus habilidades no viajan para que veas resultados) y, para las alertas por correo, en el servidor con la misma fórmula. Ambas implementaciones se validan contra los mismos casos calculados a mano: [`data/fixtures/scoring-cases.json`](../data/fixtures/scoring-cases.json).

Todos los pesos, umbrales y factores viven en [`data/config/scoring.json`](../data/config/scoring.json); ninguno está escrito en el código.

## 1. De dónde salen las habilidades

| Lado | Fuente | Regla |
|---|---|---|
| Vacante | Título, descripción y etiquetas | Diccionario de 393 habilidades con sinónimos en español e inglés ([`catalog.json`](../data/skills/catalog.json)), coincidencia por palabra completa y coincidencia difusa acotada (distancia de edición 1, o 2 en palabras de 11+ letras). Lo que está en una sección «deseable / nice to have / plus» se marca como deseable. |
| Perfil: **demostrada** | Tus repositorios públicos de GitHub | Dependencias reales (`pom.xml`, `build.gradle`, `package.json`, `requirements.txt`, `pyproject.toml`…), archivos de CI, pruebas, `Dockerfile`, migraciones y lenguajes (≥ 2 archivos). Cada habilidad guarda el repo y el archivo de donde salió. |
| Perfil: **declarada** | Tu CV, leído en tu dispositivo | El mismo diccionario sobre el texto del PDF. |

- Los alias ambiguos (BDD, Go, R, C, Oracle, Lambda, REST, Node, Express, Excel, Spark, SAFe, «redes», BI, ML, SAS) **solo cuentan con contexto**: «BDD» con Cucumber/escenarios es *behaviour-driven development*; con SQL/tablas es «bases de datos».
- Las implicaciones (Spring Boot ⇒ Spring ⇒ Java) se aplican **solo al perfil**: si demuestras Spring Boot, demuestras Java. A la vacante nunca se le añade algo que no escribió.
- Una habilidad demostrada también cuenta como declarada.

## 2. Componentes y pesos

| Componente | Peso base | Cálculo | Si falta el dato |
|---|---|---|---|
| Habilidades demostradas | 30 | `Σ w(s)·[s ∈ demostradas] / Σ w(s)` | Vacante sin habilidades reconocibles: 0 y aviso |
| Habilidades declaradas | 15 | `Σ w(s)·[s ∈ declaradas ∪ demostradas] / Σ w(s)` | Ídem |
| Nivel y experiencia | 15 | `min(1, años tuyos / años pedidos)` | Si no pide años se usa el mínimo por nivel (junior 0, semi-senior 2, senior 4, lead 6) marcado «estimado». Si no pide nada: puntaje completo, marcado «no declarado». Si tú no declaraste tus años, cuentan como 0. |
| Ubicación | 15 | Relativa a donde vives: tu ciudad: 1 · otra ciudad de tu país: 0,7 si aceptas mudarte, 0,2 si no · remoto que admite tu país: 1 · remoto sin alcance declarado: 0,5 · **remoto que no admite tu país: 0** · presencial en otro país: 0 · aún no indicaste tu ubicación: 0,5 | — |
| Idioma | 10 | Por cada idioma pedido distinto del español: `min(1, tu nivel MCER / nivel pedido)`; manda el más débil | Si pide inglés sin nivel se asume B1; si el aviso está en inglés y no dice nada se asume B2 (marcado «inferido») |
| Compensación | 10 | `min(1, salario máximo ofrecido / tu mínimo)` en USD mensuales | **No declara salario: puntaje completo**, marcado «no declarado» y contado aparte en el observatorio. Sin mínimo tuyo: completo. |
| Frescura | 5 | 1 hasta 7 días, baja linealmente hasta 0 a los 60 días | Vacante cerrada: 0 |

- `w(s)` vale 1 para lo requerido y 0,5 para lo deseable.
- Demostrar una habilidad aporta su parte de los 30 **y** de los 15; declararla solo aporta a los 15. Por eso lo demostrado pesa tres veces más que lo solo declarado.
- Puedes mover los pesos con deslizadores: se escalan para que sumen 100.

## 3. Redondeo: el desglose siempre cuadra

Cada componente se redondea a un decimal y **el total es la suma de los componentes ya redondeados**. Por eso, con pesos personalizados, un encaje perfecto puede mostrar 99,9: es preferible a mostrar un total que no coincide con su desglose (prueba T-03).

## 4. Umbral

Si el total queda por debajo de **60** (`fitThreshold`), NORTE lo dice: «No encajas todavía (X/100): esto es lo que falta.»

## 5. Análisis de brecha

1. **Lo que falta**: habilidades requeridas y deseables de la vacante que no están ni en tu CV ni en tu código; además, las que declaras pero no demuestras.
2. **Simulación honesta**: para cada hueco se recalcula el puntaje real como si lo demostraras. La ganancia no se estima a ojo: es la diferencia entre dos ejecuciones de la misma fórmula.
3. **Repo más cercano**: el repositorio tuyo que comparte más habilidades con la vacante y con las habilidades relacionadas del hueco (desempate: el más reciente).
4. **Herramienta concreta**: si el hueco es una práctica (p. ej. «pruebas de integración»), se sugiere una herramienta del catálogo que la implica y encaja con ese repo (Testcontainers si el repo usa Docker y JUnit).
5. **Recursos gratuitos**: documentación oficial verificada ([`learning.json`](../data/skills/learning.json)).

Ejemplo real de salida: *«Piden Kubernetes y Pruebas de integración y no aparecen en tu perfil. De tus repos, banca-microservicios es el más cercano: añadirle Testcontainers cubre uno de los 2 huecos y sube tu encaje de 78 a 89.»* (es el caso de la prueba T-04: puntaje calculado, no ilustrativo).

La prueba **T-04** recorre 300 combinaciones de vacantes y perfiles y verifica que toda habilidad listada como faltante está en la vacante y no está en el perfil, y que cada ganancia coincide con un recálculo real.

## 6. Grupos

NORTE es global: los grupos no se guardan en el índice, se calculan en el navegador según el país y la ciudad de cada persona (`groupFor` en `packages/core/src/groups.ts`).

| Grupo | Regla |
|---|---|
| Cerca de ti | Presencial o híbrido en tu ciudad |
| En tu país | Presencial o híbrido en otra ciudad de tu país |
| Remoto para ti | Remoto que admite tu país: alcance mundial, una región que lo incluye (Latinoamérica, Américas, Europa, EMEA, Asia-Pacífico…) o una lista de países que lo incluye. Los de alcance no declarado aparecen marcados |
| Freelance | Por proyecto: remoto que te admite o en tu país |

Las modalidades que eliges filtran antes de puntuar: presencial e híbrido se buscan en tu país (tu ciudad primero) y remoto en cualquier lugar que admita tu país. Un remoto solo para Europa no aparece a alguien de Ecuador, pero sí a alguien de España.

La pertenencia de cada país a cada región está en `data/geo/geo.json` (supuesto S-07: no hay un estándar oficial de qué es «LATAM» o «EMEA»). El índice guarda toda vacante que se pueda ubicar: remota, o presencial con país conocido.

## 7. Supuestos declarados

- Años mínimos por nivel cuando la vacante no indica años (configurable).
- Nivel de inglés B2 cuando el aviso está en inglés y no lo especifica; B1 cuando pide inglés sin nivel.
- 173,33 horas al mes para convertir tarifas por hora (40 h × 52 semanas ÷ 12).
- «$» sin código de moneda se interpreta como dólares; los montos fuera del rango 150–60 000 USD mensuales se descartan como probable error de lectura.

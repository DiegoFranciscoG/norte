# Observatorio público

Estadísticas abiertas del mercado laboral tecnológico accesible desde Ecuador, generadas automáticamente en cada ingesta (GitHub Actions) y publicadas como archivos estáticos. No hay servidor de por medio: la «API» son archivos JSON y CSV de solo lectura.

## Licencia y cita

Estadísticas, CSV y JSON: **CC BY 4.0**. Cita sugerida: «NORTE, observatorio del mercado laboral tecnológico de Ecuador», con enlace al sitio y la fecha `generatedAt` del archivo usado.

Las vacantes en sí pertenecen a cada empresa y a su fuente; el observatorio solo publica conteos y agregados.

## API pública de solo lectura

Base: `https://<usuario>.github.io/<repositorio>/data/v1/` (en local: `http://localhost:8081/data/v1/`). El índice completo de archivos está en `stats/api.json`.

| Archivo | Contenido |
|---|---|
| `stats/summary.json` | Foto actual: población, % remoto y su alcance, habilidades y categorías más pedidas, empresas, comparación Cuenca / Quito / Guayaquil, salarios por mercado, rol y nivel, tendencia de 90 días y fuentes con su última fecha de obtención |
| `stats/monthly.json` | Serie mensual de vacantes nuevas: remoto, ubicadas en Ecuador, con salario, por ciudad, por habilidad, por empresa y por fuente |
| `stats/history.json` | Serie diaria de vacantes abiertas |
| `stats/reports/index.json` y `stats/reports/AAAA-MM.json` | Informe automático de cada mes con frases redactadas a partir de las cifras |
| `stats/academia.json` | Brecha academia–mercado (vacía hasta cargar mallas oficiales) |
| `stats/*.csv` | Las mismas cifras en CSV (RFC 4180, UTF-8): `skills`, `monthly`, `monthly-skills`, `cities`, `salaries`, `companies` |

Todos los JSON traen `generatedAt`, `demo` y `license`.

## Metodología

- **Población**: vacantes tecnológicas abiertas ubicadas en Ecuador y remotas que admiten a Ecuador, después de deduplicar (T-02).
- **Series mensuales**: cuentan cada vacante en el mes en que NORTE la vio por primera vez (hora de Ecuador, UTC−5). El estado de la ingesta guarda unos 90 días, así que un mes cerrado se congela y no se recalcula; el mes en curso y el anterior sí se recalculan en cada ejecución.
- **Primer mes**: incluye las vacantes que ya estaban publicadas cuando empezó el observatorio; el informe lo advierte.
- **Tendencia de 90 días**: presencia de cada habilidad (porcentaje de vacantes que la piden) en la segunda mitad de la ventana menos la primera mitad, en puntos porcentuales. Solo se publican movimientos de habilidades con al menos 5 apariciones. Con menos de 90 días observados se marca `insufficient-history` y no se publican subidas ni bajadas.
- **Salarios**: los que publica cada vacante, convertidos a USD mensuales con la tasa de referencia del BCE de la fecha de obtención (supuesto S-04 para hora → mes). Se usa el punto medio del rango. Se separan dos mercados: empleos ubicados en Ecuador y remotos de empresas de fuera, porque mezclarlos daría una mediana que no describe a ninguno.
- **Muestra mínima**: una mediana de una o dos vacantes no representa al mercado. Toda celda con menos de 3 vacantes (configurable en `data/config/observatory.json`) se publica con `suppressed: true` y sin cifras.
- **Cuartiles**: interpolación lineal entre rangos (tipo 7 de Hyndman y Fan, la misma de `PERCENTIL.INC`).
- **Rol**: se deduce del título con las palabras clave configuradas, en orden de prioridad (por ejemplo, «Data Engineer» es Datos e IA antes que Desarrollo general).

## Privacidad (T-10)

El observatorio solo publica conteos de vacantes, habilidades, ciudades, empresas y fuentes. La prueba T-10 genera estadísticas a partir de vacantes con correos, teléfonos, cédulas y nombres de contacto en sus textos y comprueba que nada de eso aparezca en ningún archivo publicado, ni extractos, títulos o enlaces de vacantes.

## Brecha academia–mercado

Preparada pero sin datos: `data/academia/curricula.json` está vacío y `curricula.schema.json` define el formato. Cada malla debe cargarse desde la fuente oficial de la universidad, con fecha de obtención, y enlazar sus asignaturas con habilidades del catálogo. En cuanto exista una, `stats/academia.json` calcula la cobertura ponderada por demanda, las habilidades más pedidas que no se enseñan y las que se enseñan sin demanda.

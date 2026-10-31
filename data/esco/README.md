# ESCO embarcado

NORTE no consulta ESCO en tiempo real. Este directorio guarda la parte de ESCO que usa el catálogo de habilidades.

## Qué hay aquí
- `esco-skills-es.json`: para cada habilidad del catálogo que tiene equivalente en ESCO, su URI, la etiqueta preferida en español y la versión de ESCO. Se genera **una sola vez** con `node scripts/esco-fetch.mjs` contra la API pública de ESCO y se versiona en el repositorio.

## Clasificación completa (opcional, paso manual)
El portal de ESCO entrega el CSV completo en español solo después de aceptar una declaración e ingresar un correo electrónico, así que ese paso lo hace una persona:

1. Entra a https://esco.ec.europa.eu/en/use-esco/download
2. Elige *ESCO dataset v1.2.1*, contenido *classification*, idioma *es*, formato *csv*.
3. Descomprime el archivo recibido en `data/esco/raw/` (está en `.gitignore`).
4. Ejecuta `node scripts/esco-fetch.mjs --from-csv data/esco/raw/skills_es.csv` para regenerar `esco-skills-es.json` sin usar la API.

## Licencia y atribución
ESCO — European Skills, Competences, Qualifications and Occupations — © Unión Europea. Reutilización conforme a la Decisión 2011/833/EU de la Comisión, con atribución y sin distorsionar el contenido. Ver S-01 en `docs/investigacion.md`.

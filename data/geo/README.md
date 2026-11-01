# Datos geográficos

| Archivo | Contenido | Fuente y licencia |
|---|---|---|
| `geo.json` | Provincias y cantones de Ecuador, alias de países, regiones (pertenencia de países) y frases de alcance remoto | INEC (división político-administrativa) y configuración propia |
| `countries.json` | 244 países con su nombre en español e inglés | Unicode CLDR mediante `Intl.DisplayNames` — Unicode License v3 |
| `cities.json` | 6 365 ciudades de más de 100 000 habitantes o capitales, con país y coordenadas redondeadas a dos decimales | © GeoNames (geonames.org), `cities15000`, **CC BY 4.0** |

`cities.json` y `countries.json` se regeneran con `node scripts/geo-cities.mjs`. En el navegador, la ciudad más cercana a la persona se calcula con `cities.json` sin enviar su ubicación a ningún servidor.

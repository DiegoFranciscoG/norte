# Política de seguridad

## Reportar una vulnerabilidad
No abras un issue público. Escríbeme por GitHub (perfil DiegoFranciscoG) con los pasos para reproducir el problema. Respondo en un máximo de 7 días.

## Prácticas aplicadas en este proyecto
- Secretos solo por variables de entorno y GitHub Secrets (`.env` no se versiona; ver `.env.example`). La API no arranca si falta un secreto obligatorio.
- El índice estático es público: la ingesta elimina correos, teléfonos y enlaces personales de los extractos, y una prueba (T-10) verifica que ninguna estadística exponga datos de contacto.
- El CV se procesa solo en el navegador; nunca se sube al servidor (prueba T-05).
- Escaneo de secretos con gitleaks en cada push y pull request; dependencias revisadas con Dependabot.
- API deny-by-default, contraseñas con Argon2id, tokens de acceso cortos y refresco rotativo revocable, rate limiting en autenticación, validación de entradas y errores sin detalles internos.
- Nunca se consultan con clientes HTTP los dominios cuyas condiciones lo prohíben (prueba T-01): solo enlaces profundos.

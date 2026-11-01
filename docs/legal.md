# Cumplimiento legal

## Protección de datos personales (LOPDP, Ecuador)

Referencia: Ley Orgánica de Protección de Datos Personales, Registro Oficial Suplemento 459 de 26 de mayo de 2021 (fuente 28 de [investigacion.md](investigacion.md); artículos verificados el 2026-10-31 en el texto consolidado).

### Qué datos trata NORTE y con qué base

| Dato | Dónde | Base de licitud | Finalidad |
|---|---|---|---|
| CV en PDF | Solo en el navegador; nunca se sube (prueba T-05) | No hay tratamiento en el servidor | Extraer habilidades y años de experiencia |
| Repositorios públicos de GitHub | El navegador llama directo a la API de GitHub | No hay tratamiento en el servidor | Distinguir habilidades demostradas de declaradas |
| Correo y contraseña (hash Argon2id) | Base privada | Ejecución del servicio que la persona pide al crear la cuenta (art. 7) | Iniciar sesión |
| Identificadores de habilidades, años, inglés, preferencias | Base privada | Consentimiento `PROFILE_STORAGE` (art. 8) | Calcular el encaje entre dispositivos |
| Correo + perfil para alertas | Base privada | Consentimiento `EMAIL_ALERTS` (art. 8) | Enviar vacantes nuevas sobre el umbral |
| Postulaciones y notas | Base privada | Ejecución del servicio (art. 7) | Seguimiento personal |

Sin cuenta, todo funciona en el navegador (`localStorage`) y el servidor no sabe nada de la persona.

### Cómo se cumple cada derecho

| Artículo | Derecho u obligación | Implementación | Prueba |
|---|---|---|---|
| Art. 8 | Consentimiento libre, específico, informado e inequívoco | Una casilla por finalidad, desmarcada por defecto; se guarda la versión del texto aceptado; un texto desactualizado se rechaza | `AuthFlowIT`, `ProfileConsentIT` |
| Art. 10 | Principios (minimización, finalidad, conservación) | Solo identificadores de habilidades, nunca el CV; auditoría sin correos ni contenido; índice público sin datos personales | T-01, T-10, `AccountDeletionIT` |
| Art. 12 | Información | Página «Privacidad» y textos de consentimiento visibles antes de aceptar | Interfaz `/privacidad` |
| Art. 13 | Acceso | `GET /api/v1/me/export` devuelve todo lo que el servidor guarda | `AccountDeletionIT` |
| Art. 14 | Rectificación y actualización | Perfil, habilidades y postulaciones editables en todo momento | `ProfileConsentIT`, `ApplicationsIT` |
| Art. 15 | Eliminación | `DELETE /api/v1/me` con contraseña: borrado real en cascada, sin filas huérfanas; los tokens de esa cuenta dejan de servir al instante | **T-09** (`AccountDeletionIT`) |
| Art. 16 | Oposición | Retirar un consentimiento detiene ese tratamiento y borra sus datos | `ProfileConsentIT`, `AlertsIT` |
| Art. 17 | Portabilidad | La exportación es JSON estructurado y de lectura mecánica | `AccountDeletionIT` |
| Art. 19 | Suspensión del tratamiento | Las alertas se apagan con un clic sin borrar la cuenta | `AlertsIT` |
| Art. 20 | No ser objeto de decisiones solo automatizadas | El puntaje es una ayuda: no filtra ni descarta vacantes por sí solo, muestra el desglose completo, la persona ajusta los pesos y la fórmula es pública ([algoritmo.md](algoritmo.md)) | T-03, T-04 |
| Art. 37 | Seguridad | Argon2id, JWT corto + refresco rotativo con detección de reuso, límite de intentos, deny-by-default, CORS explícito, cabeceras, errores sin trazas, secretos solo por entorno | `SecurityIT`, `AuthFlowIT` |
| Arts. 43 y 46 | Notificación de vulneraciones | Procedimiento abajo | — |

### Procedimiento ante una vulneración

1. Revocar todos los tokens (rotar `JWT_SECRET` invalida todas las sesiones) y el token de alertas.
2. Evaluar el alcance con `audit_log` (sin datos personales en el detalle).
3. Notificar a la Autoridad de Protección de Datos Personales y a la ARCOTEL tan pronto sea posible y a más tardar en el término de cinco días (art. 43).
4. Notificar a las personas afectadas cuando haya riesgo para sus derechos, dentro del término de tres días desde que se conoció el riesgo (art. 46).

## Términos de uso de las fuentes de vacantes

El detalle por fuente, con fecha de verificación, está en [fuentes.md](fuentes.md). Resumen:

- **Prohibida la extracción automatizada** (LinkedIn, Multitrabajos, Computrabajo, Encuentra Empleo, Workana, Upwork, Torre): solo enlace profundo de búsqueda que abre la persona. Ningún cliente HTTP contra sus dominios; la prueba T-01 falla si alguien lo intenta.
- **APIs públicas de ATS** (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Teamtailor): son los endpoints que las empresas exponen para publicar sus vacantes.
- **Portales con API abierta**: se respeta la atribución, el límite de consultas y las restricciones de uso de cada uno (por ejemplo, Remotive no se usa en alertas).
- Cada vacante muestra su fuente, la fecha en que se obtuvo y el enlace al original. NORTE no reproduce la descripción completa: muestra un extracto.

## Licencias de los datos publicados

| Material | Licencia |
|---|---|
| Código | MIT |
| Estadísticas del observatorio, CSV y API de solo lectura | CC BY 4.0 — citar «NORTE, observatorio del mercado laboral tecnológico de Ecuador» con enlace |
| Vacantes | Pertenecen a cada empresa y a la fuente indicada; NORTE muestra datos básicos, un extracto y el enlace |
| Equivalencias ESCO | © Unión Europea, reutilización con atribución (Decisión 2011/833/UE; supuesto S-01) |

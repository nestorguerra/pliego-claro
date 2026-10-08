# Estado de la entrega · 8 de octubre de 2026

Repositorio: https://github.com/nestorguerra/pliego-claro · Web: https://nestorguerra.github.io/pliego-claro/
Base recibida: `5b928fc` (AnniezPt/pliego-claro). Correcciones en la PR #1 (`terminar-saas`).

## Situación real

**El servicio NO está listo todavía.** El código está terminado y probado de forma aislada, pero falta que Néstor cree el proyecto de Supabase, el correo (Resend) y la clave de Anthropic, y los guarde como secretos de GitHub. Hasta entonces la web muestra «Falta la conexión con el servidor». La comprobación de entrega del despliegue (`ops/health_check.py`) lo dice explícitamente en cada ejecución.

Etiquetas: **Real** = probado en el servicio publicado · **Aislado** = probado con pruebas automáticas o en el navegador sin servidor · **Pendiente** = requiere el servicio real.

| Prueba | Estado | Evidencia o paso pendiente |
|---|---|---|
| A01 Cuenta nueva | Aislado · Pendiente real | Validación de registro y duplicados (`test-cloud.cjs`). Falta: registro con correo recibido en la URL final. |
| A02 Sesión | Aislado · Pendiente real | Errores de sesión y borrador conservado (`test-cloud`, `test-workflow`). Falta: contraseña incorrecta y caducidad en el servicio. |
| A03 Recuperación | Pendiente real | Enlace de un solo uso y caducidad (1 h) los aplica Supabase Auth; falta recibir el correo y probar enlace usado/caducado. |
| A04 Aislamiento | Aislado (Postgres) · Pendiente real | 23 pruebas SQL con RLS: dos cuentas no leen ni cambian datos, archivos ni páginas ajenas cambiando identificadores. Falta repetirlo con peticiones directas al proyecto real. |
| A05 Permisos | Aislado · Pendiente real | Lectura no edita; invitación caducada, usada, de otro correo o retirada no concede acceso; retirada bloquea operaciones nuevas. |
| A06 Persistencia | Pendiente real | Otro ordenador: pendiente (paso: entrar desde otro equipo y abrir el mismo expediente). |
| A07 Fuente oficial | Aislado con datos reales | Lector PLACSP probado con la sindicación real (8 pruebas); 57 páginas de un PCAP real extraídas en el navegador. Falta la primera sincronización en el proyecto. |
| A08 Documentos | Aislado | Tipo real por firma, 25 MB, SSRF (11 casos), huella SHA-256, inmutabilidad del original, PDF dañado rechazado. Falta subida real a Storage. |
| A09 Lectura y OCR | Aislado | Regresión de más de 40 páginas, PDF mixto, baja confianza y cancelación sin falso «done». Falta OCR real de un escaneado en el navegador con el servicio. |
| A10 Decisión | Aislado | GO exige evidencia trazable y vigente, y plazo no vencido; parcial y no localizado bloquean. |
| A11 Preparación | Aislado | Tareas, responsables, fechas, costes; CSV sin fórmulas; ICS con hora de Madrid. |
| A12 Rectificación | Aislado (Postgres) | Una nueva versión oficial crea un aviso único, reabre GO y conserva el historial. Falta un cambio real detectado por la sincronización. |
| A13 IA real | Pendiente real | Citas verificadas, caché por texto y perfil, resultado inválido o rechazo sin perder trabajo (pruebas). Falta una llamada real con un documento público. |
| A14 Gasto | Aislado (Postgres) | 6 solicitudes simultáneas → solo 2 autorizadas dentro del límite; doble clic no cobra dos veces; interruptor y tope por análisis. |
| A15 Guardado | Aislado | Red caída, sesión vencida y conflicto conservan borrador y no anuncian éxito; dos guardados simultáneos no se pisan. |
| A16 Copias | Aislado · Pendiente real | Importación cancelada, corrupta o con huella alterada no modifica nada; ida y vuelta del .zip. La restauración en Supabase aislado se ejecuta en `backup.yml` cuando haya secretos. |
| A17 Publicación | Parcial | Web publicada y comprobación de entrega. Falta móvil y teclado con el servicio real. |

## Costes y límites autorizados
- IA: Claude `claude-opus-5-5` (4 $ / 20 $ por millón de tokens). Límite de la aplicación: **15 $/mes**, **1 $ por análisis**, 10 análisis por persona y día, 25 por espacio y día. Interruptor `ai_enabled` en la tabla `app_limits`. Poner también 15 $/mes en la consola de Anthropic.
- Supabase, GitHub Pages, GitHub Actions y Resend: planes gratuitos.

## Reversión
- Web y funciones: *Actions → Desplegar Pliego Claro → Run workflow* sobre el commit anterior, o `git revert` del merge de la PR #1.
- Base de datos: las migraciones son aditivas; la copia nocturna cifrada (14 días) se restaura según el README.

## Incidencias abiertas
- Pruebas reales A01–A17 pendientes de los accesos.
- Lectura automática de DOC/DOCX/ZIP no implementada: se archivan con su huella y se revisan manualmente.
- Los análisis de IA y avisos se conservan en la copia como consulta; no se recrean al restaurar.
- R27 (validación con una empresa real): pendiente de que Néstor coordine empresa y expediente vigente.
- Texto de privacidad pendiente de revisión legal.

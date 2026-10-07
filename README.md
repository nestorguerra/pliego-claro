# Pliego Claro

Espacio de trabajo para decidir qué licitaciones públicas merecen tu tiempo y preparar las que sí: licitaciones oficiales de PLACSP, pliegos archivados con huella y citas a página, requisitos con evidencia, decisión GO / REVISAR / NO-GO razonada, tareas, avisos de cambios y análisis asistido por IA.

**Aplicación:** https://nestorguerra.github.io/pliego-claro/

> Piloto. No sustituye la revisión del expediente oficial ni el criterio profesional. La firma y presentación de ofertas siempre las hace una persona en el portal oficial.

## Arquitectura

| Pieza | Dónde | Qué hace |
|---|---|---|
| Interfaz (`dist/`) | GitHub Pages | HTML/CSS/JS sin compilación. Conserva los seis apartados y los seis pasos de expediente de la beta. |
| Cuentas | Supabase Auth | Registro, confirmación de correo, entrada, cierre, caducidad y recuperación con enlace temporal de un solo uso. |
| Datos | Supabase Postgres | Un espacio por empresa. **Todas** las tablas privadas tienen RLS: el servidor decide quién lee o escribe cada fila. |
| Originales | Supabase Storage (privado) | PCAP, PPT y anexos intactos, con SHA-256, versión y autoría. Carpeta raíz = espacio. Sin borrado ni sobrescritura desde el navegador. |
| Funciones (`supabase/functions`) | Supabase Edge Functions | Descarga segura de pliegos de PLACSP, análisis con Claude, invitaciones por correo, borrado de cuenta. |
| Fuente oficial (`sync/`) | GitHub Actions cada 30 min | Lee la sindicación ATOM de PLACSP, guarda versiones, detecta cambios y envía avisos por correo (Resend). |
| Copias | GitHub Actions diario | Volcado cifrado (AES-256) de esquema, datos y roles, con prueba de descifrado. |

Modelo de datos (`supabase/migrations`): `workspaces`, `workspace_members` (titular, administración, edición, lectura), `invitations`, `profiles`, `workspace_settings`, `expedientes` (ficha JSON versionada con concurrencia optimista), `notes`, `team_roles`, `documents`, `document_pages`, `comments`, `activity_log` (auditoría por disparadores), `tenders`, `tender_versions`, `alerts`, `email_notifications`, `ai_analyses`, `app_limits`, `sync_runs`, `client_errors`.

## Puesta en marcha (una vez)

1. Crea un proyecto gratuito en [Supabase](https://supabase.com) (región UE) y guarda la contraseña de la base de datos.
2. Crea una cuenta en [Resend](https://resend.com), verifica tu dominio y crea una API key.
3. Crea una API key de [Anthropic](https://console.anthropic.com) solo para este proyecto y fija un límite de gasto mensual.
4. En GitHub → *Settings → Secrets and variables → Actions*, añade:

   | Secreto | Valor |
   |---|---|
   | `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens |
   | `SUPABASE_PROJECT_REF` | Identificador del proyecto (en la URL del panel) |
   | `SUPABASE_DB_PASSWORD` | Contraseña de la base de datos |
   | `SUPABASE_SECRET_KEY` | Project Settings → API Keys → Secret key (`sb_secret_…`) |
   | `ANTHROPIC_API_KEY` | Clave de Anthropic (opcional: sin ella la IA queda desactivada y todo lo demás funciona) |
   | `RESEND_API_KEY` | Clave de Resend (opcional: sin ella no hay correos de avisos y Auth usa el correo limitado de Supabase) |
   | `MAIL_FROM` | Remitente verificado, p. ej. `Pliego Claro <avisos@tudominio.es>` |
   | `BACKUP_PASSPHRASE` | Frase larga para cifrar las copias |

5. Ejecuta *Actions → Desplegar Pliego Claro → Run workflow*. Aplica migraciones, funciones, secretos, configuración de Auth (URL, SMTP, plantillas en español, contraseña mínima de 10) y publica la web con `config.js` generado.
6. Ejecuta *Actions → Sincronizar PLACSP y avisos → Run workflow* para la primera carga (≈3.000 licitaciones de los últimos días). Después corre sola cada 30 minutos.

Ningún secreto se guarda en el repositorio ni en `dist/`. La clave publicable que va en `config.js` es pública por diseño; la seguridad la aplica RLS.

## Desarrollo local

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Para conectar con un proyecto de pruebas, rellena `dist/config.js` con su URL y clave publicable (no lo subas).

## Pruebas

```bash
node --test scripts/*.cjs                                   # interfaz: copias, flujo, vistas, guardado en servidor
python3 -m unittest discover -s sync -p "test_*.py"         # lector PLACSP con muestra real
deno test --no-check supabase/functions/tests/              # SSRF, tipos, citas, coste, inyección de instrucciones
DATABASE_URL=postgresql://… python3 supabase/tests/test_database.py   # RLS y permisos (Postgres vacío)
```

Todas se ejecutan en cada despliegue (`.github/workflows/ci.yml`); si fallan, no se despliega.

## Operación

- **Límites de IA** (tabla `app_limits`): presupuesto mensual global, análisis por persona/día y por espacio/día, tamaño máximo de texto. Al alcanzarlos se bloquean análisis nuevos y la revisión manual sigue. Combínalo con el límite obligatorio en la consola de Anthropic: una alerta sola no corta el gasto.
- **Copias**: artefacto `copia-cifrada-*` (14 días). Para restaurar en un proyecto nuevo:
  ```bash
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in pliego-claro-copia.tgz.enc -out copia.tgz   # pide la frase
  tar xzf copia.tgz && psql "$NUEVA_DB_URL" -f copia/roles.sql -f copia/esquema.sql -f copia/datos.sql
  ```
  Los archivos de Storage no van en el volcado SQL: cada espacio puede exportarse desde la aplicación y los originales se identifican por su SHA-256.
- **Volver a una versión anterior** de la web: *Actions → Desplegar → Run workflow* sobre el commit anterior, o `git revert`.
- **Incidencias**: errores del navegador (sin contenido de documentos ni claves) en `client_errors`; ejecuciones de la fuente oficial en `sync_runs`; envíos de correo en `email_notifications`.

## Traslado desde la beta local

En la beta: *Ajustes → Datos y resguardo → Exportar copia*. En Pliego Claro: *Ajustes → Traer copia de la beta*. Muestra una vista previa, permite omitir o copiar duplicados, importa todo o nada en el servidor y compara cantidades antes y después. No borra nada del espacio ni del archivo.

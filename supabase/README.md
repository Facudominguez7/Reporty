# Supabase rollout notes

This project is adopting tracked Supabase artifacts incrementally.

- The migration files listed below now live in `archive/migrations/`: the schema baseline replaced them (see "Local development").
- `supabase/migrations/20260421231500_baseline_adoption.sql` is the compatibility-first baseline marker for this change.
- `supabase/migrations/20260422000500_report_image_compatibility_and_rls.sql` adds the first safe compatibility migration: canonical `fotos_reporte.bucket/path`, resumable backfill, evidence-backed image indexes, and limited RLS/storage tightening for `roles`, `estados`, `fotos_reporte`, and the public `reportes` bucket listing policy.
- `supabase/migrations/20260422013500_trusted_mutations_and_incremental_rls.sql` adds the next rollout slice: advisor-backed foreign-key indexes plus read-only RLS for `reportes`, `comentarios_reporte`, and `historial_estados` now that those writes run from trusted server boundaries.
- `supabase/migrations/20260422043000_profiles_public_projection_and_rls.sql` adds the `public.public_profiles` safe projection for shared identity reads and enables owner-only RLS on `public.profiles` so `email` stays in trusted/server-only boundaries.
- `supabase/migrations/20260422124500_public_profiles_security_invoker.sql` redefines `public.public_profiles` with `security_invoker = true` so the view no longer bypasses caller RLS in Postgres 17.
- `supabase/migrations/20260422125500_reportes_vote_summary_consistency.sql` backfills missing aggregate rows, removes stale rows for hidden reports, and syncs `reportes_vote_summary` from both vote changes and `reportes.deleted_at` visibility changes.
- `supabase/migrations/20261019120000_anonymous_guest_identities.sql` adds anonymous guest support: `invitado` role (5), guest-aware profile trigger with promotion on conversion, guest-safe points RPC, restrictive RLS against anonymous votes/uploads, bucket size/MIME limits, and the `report_submission_attempts` rate-limit ledger with `claim_report_submission()`.
- `supabase/migrations/20261019180000_revoke_public_write_grants.sql` revokes the default INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grants from `anon` and `authenticated` on every table and view in `public`. It closes the auto-updatable `public_profiles` view, which runs as its owner and let the anon key change `rol_id` or `puntos`. Only the policy-backed `authenticated` INSERT grants on `fotos_reporte`, `votos_no_existe` and `votos_reparado` are restored. New tables and views still get Supabase's default grants, so their migrations must revoke write privileges explicitly.
- `supabase/migrations/20261020120000_public_profiles_es_invitado.sql` and `20261020120100_public_profiles_drop_rol_id.sql` replace `rol_id` in `public_profiles` with the boolean `es_invitado`, so anonymous readers can no longer enumerate admin or staff accounts. Apply phase 1 before the app deploy and phase 2 only after it: older builds select `rol_id` from the view.
- `supabase/access-matrix.md` documents the trusted access model used to phase in RLS and storage tightening.
- Future schema and policy changes for this change MUST be added as incremental migrations after the baseline file.

## Votos exclusivos: despliegue coordinado

**No es un despliegue sin interrupción.** Las versiones anteriores insertan votos directamente y no saben cambiar un voto; la versión nueva necesita la RPC y su respuesta extendida. No conviene ejecutar ambas durante la transición.

1. Un operador autorizado debe detener todas las escrituras de votos, incluidas acciones server, clientes directos y trabajos, y esperar a que terminen las solicitudes y transacciones en curso. Mantener el bloqueo durante todo el cambio y su verificación.
2. Verificar respaldo, migraciones previas y pruebas SQL/concurrencia en un entorno local aislado. Aplicar la migración versionada candidata mediante el proceso de migraciones del proyecto; verificar sus triggers, permisos y la versión de la RPC. No reejecutar un archivo ya aplicado: para una base que ya tiene una versión anterior de esta candidata, preparar una migración incremental revisada que sustituya la función.
3. Desplegar exclusivamente la versión nueva de la aplicación, comprobar que todas las instancias anteriores terminaron y verificar registro, cambio, bloqueo de reportes cerrados y cierre por umbral antes de habilitar nuevamente las escrituras. La notificación por correo es posterior al commit y no garantiza entrega.
4. Ante fallos, mantener las escrituras detenidas. No volver a una aplicación antigua con las nuevas reglas o con votos cambiados: puede rechazar cambios o duplicar premios y cierre. Un rollback requiere un plan de base de datos y aplicación conjuntamente revisado, que preserve votos, puntos, historial y revisiones; sin ese plan, continuar con las escrituras bloqueadas y corregir hacia adelante.

### Pares históricos ambiguos

La vista `public.votos_exclusivos_ambiguos` solo permite lectura a `service_role`; no publicarla ni conceder acceso a usuarios de la aplicación. Un operador autorizado puede consultar `select reporte_id, usuario_id, fecha_no_existe, fecha_reparado from public.votos_exclusivos_ambiguos;` en un entorno administrativo seguro para elaborar un informe de revisión de acceso restringido. Las fechas no son directamente comparables por su zona horaria: el informe no autoriza elegir un ganador ni modificar filas, puntos o recompensas. No incluir identificadores en canales públicos.

## Local development

Development runs against a local Supabase stack in Docker, not production. One command sets it up or brings it up to date, on Windows, macOS and Linux:

```bash
npm install
npm run db:setup
npm run dev
```

`npm run db:setup` walks through five steps and asks only for what is missing:
1. **Docker:** checks that it is installed and running. If not, it explains how to get it on your OS and waits.
2. **Stack:** starts it if needed. The first run downloads about 7 GB of Docker images.
3. **Data source:** asks where the data comes from:
   - **A fresh copy of production.** Asks for the connection string, typed hidden.
   - **The production copy saved by an earlier run.** No connection needed.
   - **An empty database with the catalogs only.** No production access needed (`supabase/seed.sql`).
4. **Schema and data:** resets the local database with the repo migrations and loads the data.
5. **App environment:** writes `.env.development.local`, so `npm run dev` uses the local stack. Delete that file to develop against production again.

### Requirements

| | Windows | macOS | Linux |
|---|---|---|---|
| Docker | [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) (WSL 2 backend) | [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/) | [Docker Engine](https://docs.docker.com/engine/install/); your user must be able to run `docker ps` |
| Node.js | The version the app uses | Same | Same |
| Terminal | PowerShell, cmd or Windows Terminal | Terminal | Any |

The script is plain Node: it needs no bash, Python or WSL shell.

The production connection string is in Supabase Dashboard → Connect → Direct → Session pooler; replace `[YOUR-PASSWORD]` with the database password. The script reads it from `SUPABASE_DB_URL`, or asks for it, and never saves it. Without it, choose the empty database.

### Options and other commands

| Command | What it does |
|---------|--------------|
| `npm run db:setup -- --production` / `--saved` / `--empty` | Skips the data question. Needed when there is no terminal to ask in. |
| `npm run db:start` / `npm run db:stop` | Starts or stops the stack. Stopping keeps the data. |
| `npm run db:setup -- --schema` | Maintainers: regenerates the schema baseline from production. |

### Local services

- API: `http://127.0.0.1:54321`.
- Studio: `http://127.0.0.1:54323`.
- Mailpit: `http://127.0.0.1:54324`. Every Auth email lands there, with the templates from `supabase/templates/`.

### Production data on your machine

The production copy holds real user data:
- It lives in `supabase/.local/`, which git ignores; never commit or share it.
- Users keep their production passwords, so you can sign in locally with your own account.
- Sessions, refresh tokens, one-time codes, OAuth flow state and the Auth audit log are left out of the dump: they would still be valid against production.
- `.env.development.local` leaves `RESEND_API_KEY` empty, so report notifications are skipped instead of emailing real users.

`supabase/config.toml` mirrors the production Auth settings listed below. Google sign-in and CAPTCHA are off locally.

### Migrations

- `20261020120050_remote_schema.sql` is a `supabase db dump` of production taken on 2026-10-21 (`npm run db:setup -- --schema` regenerates it).
- `20261020120060_match_production_grants.sql` and `20261020120070_auth_and_storage_objects.sql` restore what the dump leaves out: the revoked client privileges, plus the trigger and the policies production keeps in the `auth` and `storage` schemas.
- These three files describe what production already has. Production's migration history lists exactly these three versions, so the CLI never applies them there.
  - It was aligned on 2026-10-21 (the equivalent of `supabase migration repair`). The previous 16 history rows are kept in `supabase_migrations.schema_migrations_backup_20261021`.
- The migrations they replace are kept in `archive/migrations/` for their history.
- `20261020120100_public_profiles_drop_rol_id.sql` is still pending in production.
- New schema changes go in new migrations after these files:
  - Test them locally with `npm run db:setup -- --saved` (or `--empty`).
  - Apply them to production with `npx supabase db push --db-url "<session pooler connection string>"`. It lists the pending files and records each one under its file version.
  - Do not apply them with the dashboard SQL editor or the MCP `apply_migration` tool: those record a different version (or none), and the history drifts from the repo again.

## Anonymous sign-ins: dashboard and environment

Settings that cannot be changed through SQL/MCP and must be reviewed in the Supabase Dashboard:

1. **Authentication → Sign In / Providers → Anonymous sign-ins**: must be enabled (verified enabled on 2026-10-19 via `GET /auth/v1/settings`).
2. **Authentication → Sign In / Providers → Allow manual linking**: enable it so guests can link an email (`updateUser({ email })`) or OAuth identity.
3. **Authentication → Attack Protection → CAPTCHA**: enable Cloudflare Turnstile and paste the Turnstile **secret key**. Then set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the app. Enable both together: with CAPTCHA on and no site key, guest sign-ins fail.
4. **Authentication → Rate Limits → Anonymous sign-ins**: default 30/hour per IP; adjust if needed.
5. **Authentication → URL Configuration → Redirect URLs**: must include `<site>/auth/callback` (the email-linking confirmation and the password recovery link land there).
6. **Authentication → Emails → Change email address / Reset password** templates: the default `{{ .ConfirmationURL }}` works with `/auth/callback`; custom `token_hash` templates work with `/auth/confirm`.
7. **Authentication → Sign In / Providers → Email → Secure password change**: **must be enabled** (enabled on 2026-10-19). It is the only enforcement point for password changes: the session cookies are readable by JavaScript (`@supabase/ssr` uses `httpOnly: false`), so anyone holding a session can call `PUT /auth/v1/user` directly and skip any check in our server actions. With it, a session older than 24 h gets `reauthentication_needed` (the form tells the user to request a recovery link, whose fresh session can set the password). Verified on 2026-10-19: a recent session changed the password, and a session aged to 25 h was refused both through `/auth/nueva-contrasena` and through a direct Auth API call. Sessions younger than 24 h can still change the password without the current one; requiring the current password would break recovery.

Environment variables (no secrets in the repo):

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional | Public Turnstile site key. When unset, the widget is hidden and no `captchaToken` is sent. |
| `REPORT_RATE_LIMIT_SALT` | Recommended | Server-only salt used to hash client IPs for report rate limiting. |

Anonymous users are never cleaned up automatically. If needed, an operator can delete stale guests manually (this keeps their reports, setting `reportes.usuario_id` to null):
`delete from auth.users where is_anonymous is true and created_at < now() - interval '90 days';`

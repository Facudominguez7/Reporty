# Android Play requirements (PWA + account deletion)

Objective: meet Google Play TWA requirements that do not depend on Play Console. Branch: `feat/android-play-requisitos`. Delivery: ask-on-risk. Test runner: vitest (`pnpm test`), SQL verified against the local Supabase stack inside `BEGIN … ROLLBACK`.

## Specs

- **S1** Browser service worker with offline fallback, installable PWA/TWA ("arrancamos por el service worker? — si").
- **S2** Complete web manifest (`id`, `start_url`, `scope`, `description`, `lang`, shortcuts). "hacemos el paso 1 y 2 entonces".
- **S3** In-app account deletion (Play requirement). Product decision (user, 2026-11-13): **"Borrar todo"** — deleting the account also deletes the user's reports, pets, public photos and comments, besides personal data (email, username, points, votes, pending photos).
- **S4** "avisar que ocrurrira si elimina su cuenta al usuario": the confirmation dialog lists what will be deleted before confirming.
- **S5** Public web URL explaining how to delete the account (Play requires a web link), and the privacy policy reflects the in-app deletion.

Assumptions (marked, not user-requested): administrators (rol 1) cannot self-delete from the app; donation records are kept with `usuario_id` nulled (accounting); `audit_events` and its R2 archive are kept (security retention).

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1 | inline | done | `lib/pwa/service-worker.test.ts` RED→GREEN (6); commit 5bf562f |
| T2 | S2 | inline | done | `lib/pwa/manifest.test.ts` RED→GREEN (5); commit 5bf562f |
| T3 | S3 | inline | done | rollback dry-run: 25/25 non-admin local users deleted, 0 FK errors; others' rows intact; admin refused; commit 30b396d |
| T4 | S3, S4 | inline | done | use case + action RED→GREEN (14); dialog/aviso tests (4); mis-reportes test (+1, written after the change) |
| T5 | S5 | inline | done | `app/eliminar-cuenta/page.test.ts` RED→GREEN (5); proxy static route |

## Log

- **L1** (2026-11-13) "que nos falta para subir a android" → "si" (service worker) → "hacemos el paso 1 y 2 entonces".
- **L2** (2026-11-13) Deletion decision: "Borrar todo". Then: "avisar que ocrurrira si elimina su cuenta al usuario".
- **L3** Discovery: ~10 tables reference `profiles` with NO ACTION/RESTRICT (moderation, pets, `puntos_creacion_*`, `avisos_*`, repair evidence), so a plain `auth.admin.deleteUser` fails for active users. Reports also have RESTRICT children (`moderacion_imagenes`, `puntos_creacion_reporte`, `avisos_retiro_reporte`, `evidencias_reparacion`). `mascotas_perdidas` ↔ `mascotas_fotos_moderacion` reference each other with RESTRICT.
- **L4** Separate pending request (not in this feature): "el automata dejo pasar la palabra ebrio".
- **L5** Verification: full suite 2831 passed, 5 failed (baseline failures in mascotas resultado-navegacion and report-contact-actions, already failing before this branch); lint 0 errors; no new tsc errors. Local DB was behind (migrations after 20261110120300); dry-run applied them inside the same rolled-back transaction.
- **L6** Route: all tasks inline (no Writer trigger reason). High-risk items 1 (irreversible data deletion) and 2 (auth identity) → independent verifier at feature end.
- **L7** (2026-11-13) "crea la pr de esto y aplica la migracion en produccion". PR #255 (single PR incl. feat/entrada-app-intro commits, per user choice "Una sola PR"). Migration applied to production via MCP as version 20261113151507 after verifying identical FK set (46) and required columns.

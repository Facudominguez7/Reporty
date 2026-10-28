# Supabase access matrix — `project-hygiene-supabase-boundaries`

Compatibility-first rollout target for the current Reporty flows.

## Evidence captured from live project

- `public.reportes`, `public.profiles`, `public.comentarios_reporte`, `public.historial_estados`, `public.votos_no_existe`, `public.votos_reparado`, `public.fotos_reporte`, `public.roles`, and `public.estados` currently have RLS disabled.
- `storage.objects` already has RLS enabled with authenticated `SELECT` / `INSERT` / `UPDATE` / `DELETE` policies for bucket `reportes`.
- Bucket `reportes` currently exists and is public, so object URLs work without a broad `storage.objects` listing policy.

## Access matrix

| Resource | Read | Write / mutate | Trusted boundary for rollout | Notes |
|---|---|---|---|---|
| `public.reportes` | Public list/detail reads for non-deleted rows | Trusted server insert/update/delete only | Server action + use-case + service-role server client | Browser-owned writes were removed from create/detail flows, so read-only RLS is now safe for this table. `reparacion_reportada_at` records the creator's non-final resolution signal and is written only by the owner-validated server action. |
| `public.profiles` | Owner reads own full row; shared identity reads go through `public.public_profiles`; trusted/server boundaries read private contact data | No browser-owned writes in current app flow; server-owned points/notifications keep using trusted clients | `public.public_profiles` + server-fetched role/identity helpers + service-role boundaries | Authorization MUST use DB role data, never `user_metadata`. `email` stays out of the public projection and remains trusted-only. |
| `public.comentarios_reporte` | Public read for non-deleted comments on visible reports | Trusted server insert/update(delete-soft) only | Trusted comment workflow + notification route + service-role server client | Browser writes were removed from detail flows, so read-only RLS is now safe here. |
| `public.historial_estados` | Public/admin read on visible report history | Trusted server inserts only | Trusted admin/state-change workflow + service-role server client | Insert path now lives behind server-only mutations, so read-only RLS is now safe here. |
| `public.votos_no_existe` | Authenticated user reads own vote existence; aggregate counts for visible reports | No direct client inserts; one vote per eligible user through the authenticated server action and service-role workflow | `app/reportes/[id]/actions.ts` + `lib/use-cases/reportes/detail-mutations.ts` | Five votes create a private admin review; the vote alone never rejects the report. |
| `public.votos_reparado` | Authenticated user reads own vote existence; aggregate counts for visible reports | No direct client inserts; one vote per eligible non-owner through the authenticated server action and service-role workflow | Same trusted vote workflow | Five votes from users other than the report owner mark it repaired. |
| `public.reportes_revision_rechazo` | Admin server boundary only | Service-role workflow only; RLS enabled with no client policies | `lib/moderation/report-status-reviews.server.ts` + admin review Server Action | One pending review is created transactionally when the vote-summary trigger observes five `No existe` votes; admin dismissal/rejection is recorded. |
| `public.reportes_vote_summary` | Public/authenticated aggregate counts for visible reports only | No direct client writes; rows are maintained by DB triggers/functions | `private.refresh_report_vote_summary_row()` plus vote/report visibility triggers | Summary rows must exist for every visible report, even with zero votes, and be removed when a report becomes hidden. |
| `public.fotos_reporte` | Public read for visible report images | Trusted report creation/image workflow inserts metadata | Server-owned image metadata writes with dual-read compatibility | Canonical reference moves to `{ bucket, path }` while legacy `url` remains readable during backfill. |
| `public.roles` | Read-only lookup for server and presentation role labels | No client writes | Shared authz constants + DB lookup fallback | Prefer constants in app code, keep DB as persisted source. Row 4 = `operador` (municipal crew operator), added for the `cuadrillas-municipales` change; see `lib/authz/catalog.ts` `ROLE_IDS.OPERADOR`. |
| `public.cuadrillas` | Staff-only read (`rol_id in (1, 4)`, i.e. ADMIN/OPERADOR) | No client writes; all mutations go through `createAdminClient()` (service role) | `lib/authz/roles.ts` `puedeGestionarCuadrillas`/`puedeOperarCuadrillas` + service-role server client | Catalog of municipal crews. Never grants `SELECT` to `anon`. |
| `public.asignaciones_cuadrilla` | Staff-only read (`rol_id in (1, 4)`) | No client writes; all mutations go through `createAdminClient()` (service role) | Same as above | Crew-to-report assignment and its operational lifecycle (`asignada` → `en_revision`/`en_progreso` → `cerrada`). At most one open assignment per report, enforced by a partial unique index, not app code. |
| `public.observaciones_cuadrilla` | Staff-only read (`rol_id in (1, 4)`) | No client writes; all mutations go through `createAdminClient()` (service role) | Same as above | Follow-up notes on an assignment; `observacion_publica` flags the subset exposed through the public timeline view. |
| `public.reportes_estado_operativo_publico` | Public (`anon` + `authenticated`) | No writes; plain view | Column allowlist (`reporte_id`, `estado_operativo`, `cuadrilla_nombre`, `actualizado_at`) + `security_invoker = false` | Only shows the current open operational state of a still-open report (`estado_id = 1`); a report already closed administratively never surfaces a stale chip. |
| `public.reportes_linea_tiempo_operativa_publica` | Public (`anon` + `authenticated`) | No writes; plain view | Column allowlist (`reporte_id`, `tipo_evento`, `ocurrido_at`, `cuadrilla_nombre`, `estado_operativo`, `motivo_cierre`, `contenido`) + `security_invoker = false` | Only surfaces observations flagged `observacion_publica = true`; base tables stay staff-only. |
| `public.estados` | Read-only lookup for report state labels | No client writes | Shared state constants + DB lookup fallback | Admin transitions must validate against canonical state IDs. |
| `storage.objects` bucket `reportes` | Public object URL reads; avoid broad object listing policies | Permanent authenticated users only (restrictive `reportes_permanent_users_only_upload` blocks anonymous JWTs); the app uploads through the service-role workflow | Trusted image workflow + minimal storage policies | Bucket limited to 100 KB per file (migration `20261023130000`) and `image/jpeg`, `image/png`, `image/webp`. |
| `public.report_submission_attempts` | No client access (RLS on, no policies) | Service role only, through `public.claim_report_submission()` | `lib/security/report-submission-guard.server.ts` | Rate limit per actor and per hashed IP plus idempotency key per submission. |

## Route trust boundaries in this batch

| Route | Caller | Authorization model | Untrusted payload removed |
|---|---|---|---|
| `POST /api/send-notification` | Authenticated session after comment creation | Session user is resolved server-side; owner email/title/usernames are fetched from DB | `ownerEmail`, `ownerUsername`, `commenterUsername`, `reporteTitulo` |
| `POST /api/send-status-notification` | Authenticated admin session after state transition | Session user + DB-backed admin role check; owner email/title/state label are fetched server-side | `ownerEmail`, `ownerUsername`, `reporteTitulo`, arbitrary state label |

## Rollout notes

1. Keep browser UX unchanged while replacing sensitive writes and side effects with trusted server boundaries.
2. Use server-only clients with `service_role` for trusted mutations; never expose that key to the browser.
3. Only enable table RLS after each corresponding trusted path is live.
4. Keep legacy image URL reads active until canonical `{ bucket, path }` reads and backfill land.
5. Since `reportes` is a public bucket, remove `storage.objects` listing policies before tightening table RLS any further.
6. `public.public_profiles` runs with `security_invoker = false` (set explicitly by migration `20260422170000_restore_public_profiles_public_projection.sql`, confirmed on the live database). This corrects an earlier version of this note that claimed the opposite. With `security_invoker = true` and `public.profiles` under owner-only RLS, the view would evaluate RLS as the caller: anonymous visitors and other users would see zero rows instead of the public author/ranking columns, breaking home ranking, comments, and report authors for everyone but the row owner. Safety instead comes from the view's column allowlist (no `email`, no `rol_id`; only the boolean `es_invitado`, since migration `20261020120100_public_profiles_drop_rol_id.sql`), the same pattern followed by `public.reportes_estado_operativo_publico` and `public.reportes_linea_tiempo_operativa_publica` below. The column allowlist only protects reads: the view is auto-updatable and writes through it run as its owner, bypassing `profiles` RLS. Write safety therefore depends on `anon` and `authenticated` holding no INSERT/UPDATE/DELETE grant on it, which migration `20261019180000_revoke_public_write_grants.sql` enforces.

## Anonymous guest identities (migration `20261019120000_anonymous_guest_identities.sql`)

Supabase anonymous users use the `authenticated` Postgres role, so a valid user is never proof of a permanent account.

| Capability | Guest (anonymous, `rol_id = 5`) | Registered | Enforced by |
|---|---|---|---|
| View map and public reports | Yes | Yes | Public RLS reads |
| Create reports and attach a photo | Yes | Yes (admin, ciudadano) | `crearReporteAction` + `REPORT_CREATOR_ROLE_IDS` + rate limit |
| See own reports (`/mis-reportes`) | Yes, same browser | Yes | Server Component filtered by `auth.getUser()` id |
| Earn points / appear in ranking or member count | No | Yes | `adjust_profile_points_atomic` skips role 5; ranking/count queries exclude role 5 |
| Comment and vote | No | Yes | `canParticipateInCommunity` in server actions + restrictive vote RLS |
| Dashboard / crew operations | No | By role | Role checks (role 5 is in no staff list); guests are redirected to `/mis-reportes` |

- `private.sync_profile_from_auth_user()` gives anonymous users `rol_id = 5` and promotes `5 → 2` only when `auth.users.is_anonymous` becomes false (verified email or linked identity). Other roles are never changed.
- Visitors without a session who open `/reportes/nuevo` are redirected to `/auth?next=/reportes/nuevo`, where they choose to sign in/register or "Continuar como invitado" (`/reportes/nuevo?modo=invitado`, see `lib/routes/guest-report.ts`). Choosing guest mode creates no identity by itself.
- The anonymous session is created only by the browser on the new-report page (`signInAnonymously`), at submit time and only without an existing session, so Supabase's per-IP anonymous sign-in limit and CAPTCHA apply to the visitor's IP. `crearReporteAction` never creates identities: it requires a validated session.

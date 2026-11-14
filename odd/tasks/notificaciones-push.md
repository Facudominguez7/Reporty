Feature: Web Push notifications (first batch: status, comments, pets, moderation) for web, PWA and the Android TWA.
Branch: `feat/notificaciones-push`; delivery: single-pr with work-unit commits; checks: Vitest, `npx tsc --noEmit`, `pnpm run lint`, local Supabase for the migration.

## Specs
- S1: Push “Tu reporte cambió de estado”: Reparado, Rechazado o asignado a una cuadrilla, to the report owner. It mirrors `sendStatusNotificationEmail` and `sendCrewAssignedEmail`.
- S2: Push “Nuevo comentario en tu reporte”, to the report owner. It mirrors `sendCommentNotificationEmail`.
- S3: Push “La mascota que reportaste figura como encontrada”, to whoever published the pet. It mirrors `enviarAvisoEstadoMascota`.
- S4: Push “Hay contenido para moderar”: foto pendiente, or a report reaching the «No existe» threshold, to administrators only. It mirrors `sendAdminReviewNotificationEmail`.
- S5: “Pedir el permiso en contexto, nunca al abrir la app. Por ejemplo, justo después de crear un reporte: «¿Querés que te avisemos cuando cambie de estado?»”.
- S6: “Un interruptor por tipo en Mi cuenta”.
- S7 (assumption, from my recommendation): push failures never break the mutation or the email (best effort, like the emails). Subscriptions the push service reports as gone (404/410) are deleted. Account deletion removes the subscriptions and preferences.

## Tasks
- T1 — S6, S7 — inline — done (`4cd429d`; local DB: cascade on account deletion, anon/authenticated denied, http endpoint rejected) — tables `suscripciones_push` and `preferencias_push` (service-role only, cascade on account deletion), queries, access-matrix.
- T2 — S1-S4, S7 — inline — done (`cb12031`; 6 tests, real VAPID+aes128gcm) — `lib/push/` sender with `@block65/webcrypto-web-push`: VAPID env, per-type preference filter, 404/410 cleanup, tests.
- T3 — S5, S6 — inline — in progress (SW handlers + server actions done, 18+17 tests; pending: lib/push/cliente.ts, components/cuenta/notificaciones-section.tsx with @radix-ui/react-switch (already a dependency, no components/ui/switch yet), section in app/dashboard/page.tsx lines ~150 and ~277, prompt in app/reportes/nuevo/page.tsx result dialog ~:591 skipping guests/withdrawn) — service worker `push`/`notificationclick`, client subscribe helper, server actions, Mi cuenta section with per-type toggles, prompt in the report-created dialog.
- T4 — S1-S4 — inline — pending — wire the 4 notification points next to the existing emails.
- T5 — S1-S7 — independent verification — pending — high risk: migration (item 1), credentials/VAPID (item 2), new dependency (item 5).
- T6 — rollout — pending, needs user confirmation — VAPID keys in Cloudflare, migration in production, docs.

## Log
L1 — 2026-11-14, user request verbatim: “listo, ya se actualizó con el logo nuevo, ahora sigamos con las notificaciones push. recomendame cuales agregar”; after the recommendation (batch 1: items 1 to 4): “si”.
L2 — Explorer map: only the pet notification goes through an outbox (`avisos_estado_mascota`, consumer `lib/moderation/avisos-mascotas.server.ts`). Status, comment, crew and admin-review emails are sent inline and best-effort. The owner id is in scope at every call site. No notification-preferences storage exists. `public/sw.js` tests use a minimal fake `self`. Secrets are read via `process.env`; wrangler has `nodejs_compat`.
L3 — Library: `@block65/webcrypto-web-push@2.0.0` (MIT, WebCrypto, works on Cloudflare Workers, ~400k weekly downloads, 1 dependency). `web-push` was rejected because it relies on Node crypto/https APIs.
L4 — Forecast: ~900 authored lines. Delivery: single PR with work-unit commits, because the user consistently asks for “push pr y merge” per feature.
L5 — 2026-11-14: T1 and T2 committed. T3 partial: `public/sw.js` push/notificationclick (same-origin only, falls back to openWindow), `app/cuenta/push-actions.ts` (obtenerEstado/guardar/eliminar/actualizarPreferencia). The VAPID public key is served at runtime by `obtenerEstadoPushAction`, so no NEXT_PUBLIC build variable is needed. Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional).
L6 — User: “continuamos luego”. Paused after the T3 partial commit.

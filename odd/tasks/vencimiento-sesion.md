Feature: vencimiento de sesión (issue #180).
Branch: `feat/vencimiento-sesion` from `origin/main` `52f3741`; delivery: work-unit commits on the feature branch; checks: Vitest, lint, TypeScript.

## Specs
- S1: “La sesion de cada usuario dura infinito, hay que quitarlo y poner cierto tiempo, salvo q seas como anonimo”.
- S2: Decided limits (user answered “si” to “¿Vamos con 30 días para usuarios comunes y 24 h para admin, o preferís otros valores?”): absolute timeout of 30 days since authentication for non-admin users and 24 h for Admin; no inactivity timeout.
- S3: Anonymous sessions (“salvo q seas como anonimo”) never expire by this rule.
- S4: Enforced in the application (`utils/supabase/middleware.ts`), not with the Supabase Pro-only “Time-box user sessions” setting, because that setting cannot exclude anonymous users.

## Tasks
- T1 — S1-S4 — inline — pending — commit: pending.
- T2 — S1-S4 — independent verification (security, high risk item 2) — pending.

## Log
L1 — User request verbatim: “revisa que tareas podemos agarrar para implementar de gihtub projects”; then “si, revisa en internet que es lo mas comun”; then “si”.
L2 — Research: NIST SP 800-63B-4 AAL1 overall timeout “SHOULD be no more than 30 days”, inactivity optional; AAL2 24 h / 1 h. OWASP ASVS 3.3.2 L1 30 days. Supabase time-box and inactivity are “only available on Pro Plans and up”; supabase/supabase#48910 reports the inactivity timeout not enforced on refresh.

Feature: vencimiento de sesión (issue #180).
Branch: `feat/vencimiento-sesion` from `origin/main` `52f3741`; delivery: work-unit commits on the feature branch; checks: Vitest, lint, TypeScript.

## Specs
- S1: “La sesion de cada usuario dura infinito, hay que quitarlo y poner cierto tiempo, salvo q seas como anonimo”.
- S2: Decided limits (user answered “si” to “¿Vamos con 30 días para usuarios comunes y 24 h para admin, o preferís otros valores?”): absolute timeout of 30 days since authentication for non-admin users and 24 h for Admin; no inactivity timeout.
- S3: Anonymous sessions (“salvo q seas como anonimo”) never expire by this rule.
- S4: Enforced in the application (`utils/supabase/middleware.ts`), not with the Supabase Pro-only “Time-box user sessions” setting, because that setting cannot exclude anonymous users.

## Tasks
- T1 — S1-S4 — inline — done; focused Vitest, lint and TypeScript passed; live local GoTrue keeps `amr` timestamp after refresh — commit: `d43980f`.
- T2 — S1-S4 — independent verification (security, high risk item 2) — done; S1-S4 met, advisory A1 fixed — commit: A1 fix in the follow-up commit.

## Log
L1 — User request verbatim: “revisa que tareas podemos agarrar para implementar de gihtub projects”; then “si, revisa en internet que es lo mas comun”; then “si”.
L2 — Research: NIST SP 800-63B-4 AAL1 overall timeout “SHOULD be no more than 30 days”, inactivity optional; AAL2 24 h / 1 h. OWASP ASVS 3.3.2 L1 30 days. Supabase time-box and inactivity are “only available on Pro Plans and up”; supabase/supabase#48910 reports the inactivity timeout not enforced on refresh.
L3 — Full Vitest: 16 failures in `report-contact-actions` and `admin-audit`, reproduced identically on base without the change (pre-existing). Lint 0 errors / 7 warnings; TypeScript passed. A temporary local test user `vencimiento-*@example.com` was created to inspect live tokens and deleted afterwards.
L4 — Independent verifier mw496q5u-1-dzrg: S1-S4 met, no blockers. Advisory A1: when `/logout` fails, `signOut` keeps cookies and a later handler in the same request could accept the expired session — fixed with RED/GREEN test clearing `sb-*` cookies. A2 (refresh tokens used directly against Supabase APIs bypass the app check) is accepted residual risk of S4. A3 (`last_sign_in_at` fallback) is unreachable in practice because GoTrue always emits `amr`.
L5 — Native review `review-b428b27a2c073f1e` (base `52f3741`, committed-only, lenses risk/resilience/reliability) approved, acknowledged and authority burned. Non-blocking advisories: transient profile read failure logs out sessions older than 24 h (fail-closed); one extra `profiles` read per request for sessions older than 24 h (latency); anonymous-to-email conversion keeps the original `amr` age; manual cookie fallback. No push or PR.

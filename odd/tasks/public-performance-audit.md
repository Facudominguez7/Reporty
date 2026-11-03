# Public performance audit

Audit and improve everyday public user flows with proportionate changes and verification.

## Specs

- S1: "Quiero q revises todas las skills de react, supabase, nextjs best practices y todo ese tema. Porque siento que algunas cosas cargan lentas, no se si es las consultas, si las imagenes estan mal optimizadas, o cual es todo el problema. Mi idea es que hagas una auditoria completa para mejorar eso. Osea auditoria completa de todo el sistema, y que te fundamentes en skills y buenas practicas para corregir, tampoco dar vuelta todo el sistema, pero mejorarlo con lo que se pueda"
- S2: "ahi ya inicie docker, continua, recorda ver tema de tambien, los reportes, detalle de un reporte, comunidad, etc. Admin y eso por ahora ni revises no me interesa acelerar eso, si lo otro sientoq  carga lento, el fondo del background y ese tipo de cosas"

## Tasks

- T1 [S1-S2] Measure and audit public flows (baseline observed) | inline | commit: ac973db
- T2 [S1-S2] Fix map filter click interception and assess map loading change (verified) | inline | commit: ac973db
- T3 [S1-S2] Verify map changes using local E2E stack (passed: desktop and mobile) | inline | commit: ac973db
- T4 [S1-S2] Investigate public backgrounds, report screens and community (completed; limits logged) | explorer/inline | commit: ac973db
- T5 [S1-S2] Implement list optimization; independent test execution unavailable (user accepted retention) | inline | commit: ac973db
- T6 [S1-S2] Investigate bounded detail and community improvements (completed) | explorer/inline | commit: ac973db
- T7 [S1-S2] Implement and verify supported public-flow improvements (verified; limitations logged) | inline | commit: ac973db

## Log

- L1: Quiero q revises todas las skills de react, supabase, nextjs best practices y todo ese tema. Porque siento que algunas cosas cargan lentas, no se si es las consultas, si las imagenes estan mal optimizadas, o cual es todo el problema. Mi idea es que hagas una auditoria completa para mejorar eso. Osea auditoria completa de todo el sistema, y que te fundamentes en skills y buenas practicas para corregir, tampoco dar vuelta todo el sistema, pero mejorarlo con lo que se pueda
- L2: Mi idea es q te enfoques mas q nada en todo lo q es la home, mapa, detalles de reportes, listado, quizas no mucho en la parte de admin. Sino mas lo q usa todo el usuario y eso en el dia a dia
- L3: Production build passed. Initial public Chromium measurements were variable; a dedicated-port check showed `/` serving landing content and `/mapa` loading OpenStreetMap tiles. No performance cause established.
- L4: Local Chromium samples measured LCP of 1776ms on `/`, 1348ms on `/mapa`, 1268ms on `/reportes`, and 1424ms on `/reportes/79`. These are single local samples, not production distributions; external image byte counts were unavailable.
- L5: User: segui investigando
- L6: Browser testing exposed a map header overlay intercepting filter clicks. A minimal pointer-event adjustment and desktop/mobile regression cases were added. Local Chromium confirmed filters open and apply and contacts open at 1280px and 390px; build, focused unit tests, and focused lint passed. Map view ordering speedup remains unproven.
- L7: Project Playwright regression could not start: local Supabase is not running, and Docker's daemon is unavailable. Existing unrelated edits to odd/tasks/report-contact-routing.md were preserved. No changes were published.
- L8: ahi ya inicie docker, continua, recorda ver tema de tambien, los reportes, detalle de un reporte, comunidad, etc. Admin y eso por ahora ni revises no me interesa acelerar eso, si lo otro sientoq  carga lento, el fondo del background y ese tipo de cosas
- L9: Local Supabase started; Playwright map filter regression passed at 1280px and 390px (2 tests).
- L10: Background WebP assets measured: desktop 97,818 bytes at 1672×941, mobile 104,046 bytes at 941×1672. Emulated scrolling measured 122 frames in two seconds for baseline, no blur, and non-fixed background; this is not real-device proof.
- L11: The initial compact report list opts out of an unused author profile lookup; default map and card callers retain authors. RED/GREEN observed, 11 focused unit tests and 3 public Playwright tests passed, and targeted lint passed. Performance gain has not been quantified.
- L12: Independent verifier found no evident static regressions but did not execute tests or browser checks; independent verification is incomplete. Native assessment was unassessable with undeclared untracked files.
- L13: User: vos q decis?
- L14: User: y por que no revisas? en vez de quitarla? si se supone q vos sos el programador, encima tenes skills y todo para saber si hiciste bien, tenes formas de testear tambien y eso
- L15: Parent added local Supabase browser tests: loading 13 reports preserves authors in the paginated public API, and map popup shows the author and report link. Both passed, as did existing focused public browser tests. Independent test execution remains unavailable.
- L16: dejalo si, pero segui con lo otro
- L17: Community ranking query now selects only used contributor IDs. RED/GREEN observed; 12 focused unit tests, lint, and community browser smoke test passed. Gain is expected to be small and remains unmeasured. Detail moderation queries were left unchanged because privileged speculative execution needs further evidence.
- L18: Report detail now marks second and later images lazy while leaving the first unchanged. The real local-Supabase two-photo test failed before and passed after. Focused verification passed: 22 unit tests, 6 Playwright tests and lint. Performance gains are not quantified.
- L19: Work-unit commit ac973db. Native assessment of its committed range was unassessable because untracked files require explicit declaration; it did not establish reviewDue. The earlier independent reviewer inspected the shared query but did not run tests; user chose to retain it after the parent ran local integration tests.

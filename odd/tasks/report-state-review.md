Feature: Report status voting and admin-review flow.
Branch: `feat/report-state-review`; delivery `single-pr` (chosen; whole feature remains one future PR); no push or PR.
Tests: Vitest via `npm test`; local SQL assertions via `docker exec ... psql`.

## Specs

### S1 — Public vote controls
> “Tambien me gustaria que los votos de reparado y rechazado, esten debajo de la caja del reporte, y encima de la de comentarios, ahi en una cajita finita, que diga algo como se reparo?, o no existe este reporte? nose, algo asi. Si no quizas con los iconos solamente no se entiende mucho. Usa botones que venimos usando, no hardcodeees colores y eso.”

### S2 — Admin review destination
> “Y bueno tema revisiones, apareceria en la seccion de revisiones del admin, como tambien aparecen las imagenes que tengo q aprobar?”

### S3 — Pending report review badge
> “fijate eso tambien para las revisiones de reportes rechazados.”

### S4 — Remove duplicate admin panel
> “Tambien quiero q quites esta caja en cada reporte cuando estas con rol de admin [Image#1], osea hay un icono q abre ese mismo en modal, no hace falta tener esa caja siempre visible si ese icono ya nos abre el modal.”

### S5 — Agreed voting threshold
> “5 para ambos”

### S6 — Accepted resolution model
> “Me gusta si.”

## Tasks
- T1 — S5-S6 — Implement secure vote thresholds and persistent admin review decisions, migration, workflow tests, and schema/access documentation — in progress; base commits `5fd9a6f`, `1dd230a`; pre-FK lock-order migration and stale-state CAS are GREEN, follow-up commit pending.
- T2 — S1,S4 — Add labeled compact report vote panel in the requested location and remove the redundant inline admin panel while keeping the modal — pending; UI edits exist, but browser behavior remains unverified; commit pending.
- T3 — S2-S3,S6 — Add report-rejection review inbox to Admin → Revisiones and include pending report reviews in the navigation badge without mixing photo decisions — pending; commit pending.
- T4 — S1-S6 — Run focused and applicable full checks; record per-task evidence and final risk — pending; commit pending.

## Log

L1 — User request, verbatim: “bueno dale, vamos a ello, entonces diferencia el nombre de las revisiones, recorda q las revisiones de fotos tambien cuando hay alguna revision pendiente figura un numerito, fijate eso tambien para las revisiones de reportes rechazados. Tambien quiero q quites esta caja en cada reporte cuando estas con rol de admin [Image#1], osea hay un icono q abre ese mismo en modal, no hace falta tener esa caja siempre visible si ese icono ya nos abre el modal.”
L2 — Accepted behavior: report author can flag that a report appears resolved but cannot directly change its final state; external users validate with votes; hitting the shared threshold closes as repaired, while reaching it for “No existe” sends the report to admin review; admins retain direct status control. User confirmed this with “Me gusta si.”
L3 — Threshold decision: user selected “5 para ambos”.
L4 — Admin review destination: report-review queue and photo-review queue should be distinguished in Admin → Revisiones; pending report review count should appear in the admin navigation badge.
L5 — T1 evidence: 34 focused Vitest tests passed; the local migration applied and `supabase/tests/report_status_vote_reviews.sql` passed through transactional `psql`; `npx tsc --noEmit` and `git diff --check` passed. The `supabase test db` runner reports no TAP plan for the repository's manual-assertion SQL style, so direct `psql` was used for the SQL proof.
L6 — T1 commit: `5fd9a6f` (`feat(reports): add five-vote review workflow`). This cohesive unit is 495 authored lines because it keeps the security boundary, migration, deterministic and SQL tests, and access documentation together; next work remains a separate small UI slice. RDD assess returned `nativeRisk: unassessable` because untracked worktree files prevented candidate derivation even with committed-only scope; no review was started, and the writer self-verification plan remains applicable.
L7 — Reopened T1 for a bounded reliability check: the existing workflow inserts a vote, reads the aggregate count afterward, and closes on the threshold in a separate request; the summary trigger recomputes counts before its upsert.
L8 — Reproduced the race against local Postgres: starting with three votes, one transaction inserted vote four and held the transaction open; a concurrent fifth vote committed after waiting on the summary row, but the aggregate ended at 4 and no pending review existed. T1 now includes an atomic/concurrency-safe summary fix and regression coverage.
L9 — The local Postgres image has the `dblink` extension available but not installed; the first concurrency fixture attempt used a duplicate voter and was cleaned up by its trap, then the corrected two-transaction reproduction produced the failure recorded in L8. No application or production data was touched.
L10 — Durable RED: `bash scripts/local-supabase/test-report-vote-concurrency.sh` failed as expected with five committed votes yielding `4|missing`; cleanup removed the isolated fixture. Implement per-report serialization and rerun for GREEN.
L11 — Concurrency fix: migration `20261028123000_serialize_report_vote_summary_refresh.sql` locks the report row before recomputing the vote summary. Applied locally; the same two-transaction regression now passes with `aggregate=5, review=pendiente`.
L12 — Post-fix verification: 34 focused Vitest tests, `npx tsc --noEmit`, the SQL threshold/RLS fixture, the concurrent-vote regression, and `git diff --check` all passed.
L13 — The first work-unit commit contains 495 authored lines, above the ~400-line delivery planning budget. Per `ask-on-risk`, the next commit waits for the user's future PR-slicing strategy choice; no push or PR creation is authorized.
L14 — T1 was blocked only on the delivery choice; after the user selected `single-pr`, resume at the uncommitted concurrency-fix migration and regression script. No push or PR creation is authorized by the choice.
L15 — Delivery strategy decision (2026-10-28): user selected “One single PR — least recommended” (`single-pr`). Record the whole feature as one future PR slice; this is not authorization to push or open a PR.
L16 — Concurrency-fix commit: `1dd230a` (`fix(reports): serialize concurrent vote summary refreshes`); its RED/GREEN regression and core SQL/unit/type checks pass. Total feature branch authored lines now 565; the selected strategy keeps the future change in one PR slice only.
L17 — RDD ASSESS for the committed candidate returned high risk after explicit item-4 escalation, but `nativeRisk` remained unassessable because untracked worktree files prevent candidate derivation. Native review was not started; independent verification was delegated.
L18 — Independent verifier verdict: not fully verified. PostgreSQL's vote FK check can take a key-share lock on `reportes` before the AFTER trigger requests `FOR UPDATE`; concurrent inserts may each hold key-share and deadlock while upgrading. The existing regression covers a different interleaving and does not rule this out. Also explicitly verify five repaired votes and a concurrent report-state change. T1 remains open; next fix must lock the report in a BEFORE INSERT trigger before FK checks, with deterministic lock-order regression coverage.
L19 — Durable lock-order RED: updated `bash scripts/local-supabase/test-report-vote-concurrency.sh` to pause vote four after its FK check and before summary refresh, then submit vote five. Against commits `5fd9a6f`/`1dd230a`, PostgreSQL reports a real `deadlock detected` in `private.sync_report_vote_summary` while both transactions request `FOR UPDATE`. The fixture trap cleans up; implement pre-FK locking.
L20 — Additional source check: `applyReportStateChange` uses a stale report snapshot and does not compare the current `estado_id` with the state read before the update. Existing `detail-mutations.test.ts` has no status-change concurrency test. Add a compare-and-swap guard and test so a concurrent admin decision cannot be overwritten by the repair threshold.
L21 — CAS RED: added a test where the workflow reads pending, an admin changes the report to rejected, and the stale repaired transition is attempted. The current helper overwrites state 3 with state 2; the test fails as expected. Add the prior-state predicate before updates.
L22 — Lock-order fix: migration `20261028133000_lock_report_before_community_vote.sql` adds a BEFORE INSERT trigger on both vote tables that locks and validates the report before PostgreSQL performs the vote foreign-key check. `applyReportStateChange` now updates only when `estado_id` still matches the state it read.
L23 — Targeted GREEN: after applying the new migration, the barrier concurrency script passes with `aggregate=5, review=pendiente`; `detail-mutations.test.ts` and `report-status-votes.test.ts` pass all 12 tests, including five repaired votes and the stale-state conflict case.
L24 — Plan reconciliation: T1's post-fix SQL/type checks are GREEN, but the follow-up commit and independent verification of the corrected lock ordering remain. T2 still needs browser verification; T3 still lacks the Admin → Revisiones report/photo tabs and report-review rendering/actions UI; T4 remains final verification. No task is marked done based on partial proof.
L25 — Post-fix checks: all 39 targeted Vitest tests pass; `npx tsc --noEmit`, the deterministic concurrency barrier regression (`aggregate=5, review=pendiente`), the SQL threshold/RLS fixture, and `git diff --check` pass after applying `20261028133000_lock_report_before_community_vote.sql` locally.

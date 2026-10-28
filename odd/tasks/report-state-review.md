Feature: Report status voting and review flow
Branch: `feat/report-state-review`; no push or PR.
Purpose: clarify community votes and administrative review for report states while preserving the existing photo-review workflow.

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
- T1 — S5-S6 — Implement secure vote thresholds and persistent admin review decisions, migration, workflow tests, and schema/access documentation — commit `COMMIT_PENDING`.
- T2 — S1,S4 — Add labeled compact report vote panel in the requested location and remove the redundant inline admin panel while keeping the modal — commit pending.
- T3 — S2-S3,S6 — Add report-rejection review inbox to Admin → Revisiones and include pending report reviews in the navigation badge without mixing photo decisions — commit pending.
- T4 — S1-S6 — Run focused and applicable full checks; record per-task evidence and final risk — commit pending.

## Log

L1 — User request, verbatim: “bueno dale, vamos a ello, entonces diferencia el nombre de las revisiones, recorda q las revisiones de fotos tambien cuando hay alguna revision pendiente figura un numerito, fijate eso tambien para las revisiones de reportes rechazados. Tambien quiero q quites esta caja en cada reporte cuando estas con rol de admin [Image#1], osea hay un icono q abre ese mismo en modal, no hace falta tener esa caja siempre visible si ese icono ya nos abre el modal.”
L2 — Accepted behavior: report author can flag that a report appears resolved but cannot directly change its final state; external users validate with votes; hitting the shared threshold closes as repaired, while reaching it for “No existe” sends the report to admin review; admins retain direct status control. User confirmed this with “Me gusta si.”
L3 — Threshold decision: user selected “5 para ambos”.
L4 — Admin review destination: report-review queue and photo-review queue should be distinguished in Admin → Revisiones; pending report review count should appear in the admin navigation badge.
L5 — T1 evidence: 34 focused Vitest tests passed; the local migration applied and `supabase/tests/report_status_vote_reviews.sql` passed through transactional `psql`; `npx tsc --noEmit` and `git diff --check` passed. The `supabase test db` runner reports no TAP plan for the repository's manual-assertion SQL style, so direct `psql` was used for the SQL proof.

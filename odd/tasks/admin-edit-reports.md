# Admin report editing
Implement admin-only editing on the report detail page, preserving the existing moderation and authorization boundaries.
The accepted scope is report content and operational fields; author identity and creation metadata are not editable.

## Specs

1. **S1 — Edit report fields.** User request: “La idea es que el rod admim, desde panel de admin, pueda editar todo lo que sea de algun reporte, osea nombre foto, descripcion etc, actualmente puede el estado me parece y borrarlo, asi que la idea es esa, editar todo el reporte.” Accepted fields: title, description, photo, category, priority, location, and state. Exclude author, creation date, and identifiers. Place the edit flow on the report detail page, available to admins only.
2. **S2 — Photo replacement and removal.** User choice: “Reemplazar o quitar”; “Sí, conservar hasta aprobar”; “Incluir quitar foto”; and “Cada foto por separado”. Replacement goes through existing moderation and keeps the selected old photo until the new one is approved. Replacing/removing one photo must leave other photos unchanged. Photo removal must use an authorized storage/database path and cannot bypass the existing moderation/storage protections.
3. **S3 — No separate audit trail.** User decision: “no hace falta lo de la auditoria en este caso creo”. Do not add an edit audit log.
4. **S4 — User experience verification.** The updated `AGENTS.md` requires a visible Playwright browser check for UX/UI changes, but the user specified: “Todo esto que vas a leer aca abajo, lo vas a hacer solo si yo te doy permiso, osea luego de hacer algo medianamente grande me preguntas y ahi recien te digo si o no y lo haces, sino no hagas nada porque si(”. Ask for permission after implementation before running the browser verification; if not granted, leave that check pending and report it.

## Tasks
- T1 — Implement and test admin-only metadata/operational-field editing (S1); route: inline; status: done; commit: pending.
- T2 — Implement and test safe moderated photo replacement and authorized photo removal (S2); route: inline; commit: pending.
- T3 — Add the admin-only detail-page edit UI and verify the flow (S1, S4); route: inline; commit: pending.

## Log
- L1 — User request: “Quiero hacer una nueva feature: La idea es que el rod admim, desde panel de admin, pueda editar todo lo que sea de algun reporte, osea nombre foto, descripcion etc, actualmente puede el estado me parece y borrarlo, asi que la idea es esa, editar todo el reporte. O no se si es necesario que sea desde el panel de admin, sino tambien podria ser mismo desde la vista del reporte en si. Fijate que es lo mas rapido y mejor. Primero lee agents.md ya q lo actualice.”
- L2 — User selected report-detail editing, the proposed fields, and photo replacement or removal.
- L3 — User approved retaining the existing photo until a replacement is approved and including photo removal.
- L4 — User declined a separate audit trail: “no hace falta lo de la auditoria en este caso creo”.
- L5 — User clarified photo operations apply individually: “Cada foto por separado”.
- L6 — T1 metadata/operational update action and workflow pass focused tests and lint; the existing report-action Zod schema order was fixed because module loading failed before tests could run.

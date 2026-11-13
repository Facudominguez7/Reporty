# Optional institution email
Report creation must not send an institution email automatically; the author chooses after creation.

## Specs
S1. "Actualmente se envia un correo automaticamente a la institucion no recuerdo cual, pero se envia"; "si la persona presiona el si, ahi recien se envia ese correo, osea prefiero eso a que sea automatico"
S2. "Me gustaria por ahi quitar botones de ver mis reportes, crear otro reporte etc, y poner ahi en ese modal de exito q aparece actualmente, enviar correo a institucion? un si y un no"; "no lo ahgas literal, acomodalo"
S3. "cuando realizas un reporte exitoso? osea q la imagen fue validada, el texto tambien, etc."

## Tasks
T1 [S1,S3] inline/worker (context backstop): remove automatic dispatch, implement authorized on-demand notification, test flow. Commits: 98f2c1a, 7ce48e8 (66 focused tests passed; typecheck has 2 unrelated baseline errors).
T2 [S2,S3] inline/worker (context backstop): adapt success modal and focused checks. Commit: b655c72 (implementation and E2E assertion; browser verification blocked by missing local psql and fixture cleanup failure).

## Log
L1. Bien vamos con una featurita bien chiquita. Viste que cuando realizas un reporte exitoso? osea q la imagen fue validada, el texto tambien, etc. Actualmente se envia un correo automaticamente a la institucion no recuerdo cual, pero se envia, Me gustaria por ahi quitar botones de ver mis reportes, crear otro reporte etc, y poner ahi en ese modal de exito q aparece actualmente, enviar correo a institucion? un si y un no, y si la persona presiona el si, ahi recien se envia ese correo, osea prefiero eso a que sea automatico, se entiende? fijate el codigo y bueno como preparas esto q te digo, no lo ahgas literal, acomodalo
L2. Independent security verification found that provider delivery failures appeared as an empty recipient list; fixed in 7ce48e8 and reran 66 focused tests. E2E attempted once but its fixture cleanup failed before behavior could be verified (restricted rows). Typecheck reports two pre-existing errors in components/report-detail tests.

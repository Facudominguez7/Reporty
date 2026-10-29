# Agua report category
Objective: Add the Agua report category to Reporty’s local and production catalogs and make its existing UI flows recognize it.
Risk: item 5 (production Supabase catalog write and local data-restore behavior).

## Specs
1. S1: “Ahora, algo q quiero q hagas, tanto en la base de prod como la local, es agregar una categoria mas de tipo de reporte, viste q tenemos alumbrado, bache, semaforo etc, bueno se sumaria agua, asiq agrega eso, y tambien tene en cuenta q deberias agregar logo y demas tambien, toma como referencia como trabajan las otras categorias”
2. S2: “deja de joder con tantos tests, conectate a supabase asi pones en produccion tambien, y tambien al unico reporte cargado q tenemos en prod y en local hay q cambiar la categoriaa q tiene actual q es otros, a por la de agua”

## Tasks
- T1 — S1 — inline — done: Add focused regression tests for Agua category filtering and icon mapping. Commit: 7e68635.
- T2 — S1 — inline — done: Implement the Agua icon and public category-filter mapping. Commit: 7e68635.
- T3 — S1 — inline — done: Persist Agua in the local migration, empty seed, and saved/production setup restore path. Commit: 7e68635.
- T4 — S1 — dropped: Resolve the unrelated full-suite failure; dropped at the user’s explicit request to stop further tests. The failure remains documented, not fixed.
- T5 — S1 — inline — done: Apply production migration `20261029202841_add_agua_category.sql` and record only its version as applied. Verified category ID 8 and sequence value 8. Source migration commit: 7e68635.
- T6 — S1 — dropped: Visible browser verification not run at the user’s explicit request to stop further tests; UX remains unverified because MCP Playwright navigation/interaction tools are unavailable.
- T7 — S2 — inline — done: Change local report 76 from Otros (7) to Agua (8) and read the row back. Commit: not applicable (local data).
- T8 — S2 — inline — done: Change production report 76 from Otros (7) to Agua (8), then read the row back. Leave report 77 (Bache) unchanged. Commit: not applicable (production data).

## Log
- L1: “Ahora, algo q quiero q hagas, tanto en la base de prod como la local, es agregar una categoria mas de tipo de reporte, viste q tenemos alumbrado, bache, semaforo etc, bueno se sumaria agua, asiq agrega eso, y tambien tene en cuenta q deberias agregar logo y demas tambien, toma como referencia como trabajan las otras categorias”
- L2: Local and production initially had category IDs 1–7 and sequence value 7; Agua uses ID 8. Report creation, admin options, and the category filter UI load names from the table; public report/dashboard queries resolve category names through a static name-to-ID map. Map markers and cards use the shared icon mapping. The existing contacts dialog and contact directory already include Agua.
- L3: Empty local setup loads `supabase/seed.sql`; saved/production setup resets from migrations before loading a dump that includes `categorias`. Production migration history differs from the repository, so `db push` may apply unrelated migrations.
- L4: Focused RED tests failed before implementation (no Agua category predicate; generic icon fallback). After the change, both focused files passed (6 tests total).
- L5: Added the Agua seed row and an idempotent migration, plus local setup reapplication after saved/production imports. Local migration verified at ID 8 with sequence 8; a rollback-wrapped stale-snapshot restore check returned `8|Agua`. `node --check` and `git diff --check` passed.
- L6: Commit `7e68635` contains the source slice; `17467c3` records verification. Build passed. The full Vitest suite failed in untouched `lib/validation/zod-resource-limit.test.ts`; the user explicitly asked to stop further tests, so no further tests will run and that failure is retained as documented.
- L7: Production was initially unchanged. Supabase MCP rejected `INSERT` as a read-only transaction; the CLI initially had no access token. Do not reuse the previously exposed password or paste new credentials into chat.
- L8: MCP tool search found no navigable Playwright browser/interaction tool. Visible-browser checks at 1920×1080, 1280×720, and 390×844 remain unverified; no headless substitute was used.
- L9: Independent verifier found no defect in commit `7e68635` but returned a partial S1 verdict because production and browser checks were unavailable. Native assessment required an independent verifier; review itself was not due (`under_budget`).
- L10: User correction S2: “deja de joder con tantos tests, conectate a supabase asi pones en produccion tambien, y tambien al unico reporte cargado q tenemos en prod y en local hay q cambiar la categoriaa q tiene actual q es otros, a por la de agua”. Do not run more tests; proceed with the authorized targeted data updates and leave production blocked only if no authenticated write route is available.
- L11: A read-only production query found active reports 76 (Otros) and 77 (Bache); local had report 76 (Otros). Only local report 76 was changed to category ID 8 and read back as Agua. Production report 76 remains Otros until authenticated write access is available; report 77 was not modified.
- L12: User confirmation: “listo ahi ya conecte”. Authenticated CLI read-only query succeeded. Production still had only categories 1–7, report 76 in Otros, and report 77 in Bache. T5 was unblocked; use the targeted category migration and update report 76 only.
- L13: Applied the exact production migration file through authenticated `supabase db query --linked --project-ref`; a SELECT confirmed Agua at ID 8 and `categorias_id_seq` at 8. `supabase migration repair` marked only `20261029202841` as applied; no broad `db push` or tests were run.
- L14: Updated production report 76 only where its previous category was ID 7, returning category ID 8. Readback confirmed report 76 is Agua (8) and report 77 remains Bache (1). Local report 76 had already been verified as Agua. No tests were run.

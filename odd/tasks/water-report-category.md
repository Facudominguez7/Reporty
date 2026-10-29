# Agua report category
Objective: Add the Agua report category to Reporty’s local and production catalogs and make its existing UI flows recognize it.
Risk: item 5 (production Supabase catalog write and local data-restore behavior).

## Specs
1. S1: “Ahora, algo q quiero q hagas, tanto en la base de prod como la local, es agregar una categoria mas de tipo de reporte, viste q tenemos alumbrado, bache, semaforo etc, bueno se sumaria agua, asiq agrega eso, y tambien tene en cuenta q deberias agregar logo y demas tambien, toma como referencia como trabajan las otras categorias”

## Tasks
- T1 — S1 — inline — done: Add focused regression tests for Agua category filtering and icon mapping. Commit: pending.
- T2 — S1 — inline — done: Implement the Agua icon and public category-filter mapping. Commit: pending.
- T3 — S1 — inline — done: Persist Agua in the local migration, empty seed, and saved/production setup restore path. Commit: pending.
- T4 — S1 — inline — in progress: Commit the feature slice after deterministic checks. Commit: pending. Note: focused tests and build pass; full suite has an unrelated failure.
- T5 — S1 — inline — blocked: Add Agua to production and verify the row. Waiting for authenticated Supabase CLI access; the MCP SQL executor is read-only. Commit: pending.
- T6 — S1 — inline — blocked: Verify the Agua picker, filters, and icon in a visible browser at required desktop/mobile sizes and exercise its error state. Waiting for configured MCP Playwright navigation/interaction tools, which are unavailable in this session. Commit: pending.

## Log
- L1: “Ahora, algo q quiero q hagas, tanto en la base de prod como la local, es agregar una categoria mas de tipo de reporte, viste q tenemos alumbrado, bache, semaforo etc, bueno se sumaria agua, asiq agrega eso, y tambien tene en cuenta q deberias agregar logo y demas tambien, toma como referencia como trabajan las otras categorias”
- L2: Local and production both have category IDs 1–7 and sequence value 7; Agua can use ID 8. Report creation, admin options, and the category filter UI load category names from the table; public report/dashboard queries still resolve category names through a static name-to-ID map. Map markers and cards consume the shared category-icon mapping. The existing contacts dialog and contact directory already include Agua.
- L3: Empty local setup loads `supabase/seed.sql`; saved/production setup resets from migrations before loading a data dump that includes `categorias`. Production migration history differs from the repository, so applying all pending local migrations to production could include unrelated changes and is not authorized by this feature request.
- L4: Focused RED tests failed as expected before implementation: Agua filtering produced no `categoria_id` predicate, and its icon resolved to the generic default.
- L5: Added `agua: 8` to the public filter map and a droplet SVG path to the shared category icon map. The two focused tests now pass (6 tests total across the two files).
- L6: Added the Agua row to the empty seed and a data migration that adds it only when the existing catalog is populated. Updated local setup to re-run the idempotent migration after production/saved data import, so older snapshots gain Agua. The local migration was applied and verified at ID 8 with sequence value 8; a rollback-wrapped test simulated a stale snapshot by removing Agua, re-running the migration, and confirming `8|Agua` was restored. `node --check` and `git diff --check` passed.
- L7: Production remains unchanged. The MCP SQL executor refused the INSERT as a read-only transaction; `supabase db query --linked --project-ref` requires a CLI access token that is not configured. Production migration history differs from the repo, so `db push` could apply unrelated pending migrations. T5 waits for a supported authenticated production write route; do not paste credentials into chat.
- L8: MCP tool search found no navigable Playwright browser or interaction tool. The project-required visible browser check at 1920×1080, 1280×720, and 390×844 remains pending; no headless or DOM-only substitute was used.
- L9: The full Vitest suite exited 1: 4 test files were reported failed, 49 passed, and 1 skipped; 1 assertion failed in the untouched `lib/validation/zod-resource-limit.test.ts`, which expected Zod to skip element refinements for an oversized array. Re-running that single test reproduced the failure. The Agua-focused tests remain green; no unrelated test was changed.
- L10: `npm run build` exited successfully (0) and completed the Next.js production build.

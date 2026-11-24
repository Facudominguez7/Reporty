# Menos viajes entre el Worker y Supabase

- **Objetivo:** bajar la cantidad de viajes en serie entre el Worker de Cloudflare y Supabase, empezando por el detalle de reportes, el mapa y su API.
- **Rama:** `perf/menos-viajes-supabase`. **Entrega:** ask-on-risk.
- **Pruebas:** Vitest (`pnpm vitest run`), `npx tsc --noEmit` y `pnpm run lint`. Medición en producción con `medir.sh` (anónimo) y con los edge logs de Supabase.

## Specs

- **S1:** «Identificá las consultas secuenciales, redundantes, dependencias innecesarias, oportunidades de paralelización, problemas N+1 y posibilidades de consolidación mediante RPC de PostgreSQL y relaciones de PostgREST.»
- **S2:** «Priorizá el detalle de reportes, el mapa y su API. Conservá la caché regional existente, RLS, autenticación y permisos.»
- **S3:** «Medí el rendimiento antes y después mediante TTFB, p50, p95, cantidad de consultas, cache HIT/MISS y tiempos de ejecución.»
- **S4:** «No agregues infraestructura ni dependencias innecesarias. No sacrifiques consistencia, seguridad ni rendimiento de otras rutas.»
- **S5:** «Documentá los hallazgos y generá issues independientes, priorizadas según su impacto real.»
- **S6:** «No implementes optimizaciones especulativas sin mediciones que las justifiquen.»
- **S7:** «solucionemos eso de los viajes»

## Tareas

| ID | Qué | Specs | Ruta | Estado | Commit / evidencia |
|---|---|---|---|---|---|
| T1 | Medición de base en producción, después de revertir la #306 | S3 | inline | pendiente | |
| T2 | Issues priorizados con los hallazgos medidos | S1, S5 | inline | pendiente | |
| T3 | Mapa y su API: traer el autor en la misma consulta (relación PostgREST) | S2, S7 | inline | pendiente | |
| T4 | API del mapa: el proxy no refresca la sesión en `/api/mapa/reportes` (no la usa) | S2, S4, S7 | inline | pendiente | Riesgo: ítem 2 (autenticación) |
| T5 | Detalle: autor, comentarios e historial con su perfil en la misma consulta | S2, S7 | inline | pendiente | |
| T6 | Detalle: un solo `getUser` y una sola lectura del rol por pedido; la consulta principal no espera al usuario | S2, S7 | inline | pendiente | |
| T7 | Detalle: moderación, revisión y evidencia en paralelo con la consulta principal | S2, S7 | inline | pendiente | |
| T8 | Medición después del deploy y cierre | S3 | inline | pendiente | |

## Log

- **L1 (2026-11-24, pedido original):** «Revertí la PR #306 mediante una nueva PR y verificá que las latencias vuelvan a los valores anteriores. Después, realizá una auditoría de rendimiento de Reporty enfocada en reducir los round trips entre Cloudflare Workers y Supabase. Identificá las consultas secuenciales, redundantes, dependencias innecesarias, oportunidades de paralelización, problemas N+1 y posibilidades de consolidación mediante RPC de PostgreSQL y relaciones de PostgREST. Priorizá el detalle de reportes, el mapa y su API. Conservá la caché regional existente, RLS, autenticación y permisos. Medí el rendimiento antes y después mediante TTFB, p50, p95, cantidad de consultas, cache HIT/MISS y tiempos de ejecución. No agregues infraestructura ni dependencias innecesarias. No sacrifiques consistencia, seguridad ni rendimiento de otras rutas. Documentá los hallazgos y generá issues independientes, priorizadas según su impacto real. Aplicá ODD para las posteriores implementaciones. No implementes optimizaciones especulativas sin mediciones que las justifiquen.»
- **L2 (2026-11-24):** «listo, mergeado, solucionemos eso de los viajes»: la PR #307 está mergeada y queda autorizado implementar.
- **L3 (hallazgos medidos antes de implementar):**
  - **Dónde está el costo:** dentro de Postgres las consultas tardan 0,2–19 ms de media (`pg_stat_statements`). Cada viaje Worker→Supabase cuesta ~170 ms de `origin_time` en los edge logs, así que el costo es la cantidad de viajes en serie.
  - **Tráfico del Worker en 24 h:** `auth/v1/user` 974, `GET reportes` 687, `HEAD reportes` 555, `profiles` 503, `public_profiles` 267.
  - **Detalle anónimo:** 10 consultas en unas 3 tandas. Con sesión son unos 8 viajes en serie: `getUser` ×3 y `profiles` ×4 en el mismo pedido.
  - **Mapa y su API:** `reportes_en_zona` y después `public_profiles`, 2 viajes en serie.
  - **Relación PostgREST verificada:** con anon, `autor:public_profiles(username)` funciona sobre `reportes`, `comentarios_reporte`, `historial_estados` y la RPC `reportes_en_zona`.
- **L4:** la ubicación del Worker en `aws:us-east-2` (PR #306) dio un resultado mixto: el detalle mejoró −260 ms y el inicio empeoró +180 ms. Se revirtió en la PR #307.

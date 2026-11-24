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
| T1 | Medición de base en producción, después de revertir la #306 | S3 | inline | hecho | L5 |
| T2 | Issues priorizados con los hallazgos medidos | S1, S5 | inline | hecho | #308–#313 |
| T3 | Mapa y su API: traer el autor en la misma consulta (relación PostgREST) | S2, S7 | inline | hecho | 30d1680 |
| T4 | API del mapa: el proxy no refresca la sesión en `/api/mapa/reportes` (no la usa) | S2, S4, S7 | inline | hecho | 4b65abf. Riesgo: ítem 2 (autenticación) |
| T5 | Detalle: autor, comentarios e historial con su perfil en la misma consulta | S2, S7 | inline | hecho | a89f694 |
| T6 | Detalle: un solo `getUser` y una sola lectura del rol por pedido; la consulta principal no espera al usuario | S2, S7 | inline | hecho | 66a4cee. Riesgo: ítem 2 (permisos) |
| T7 | Detalle: moderación, revisión y evidencia en paralelo con la consulta principal | S2, S7 | inline | hecho | 66a4cee |
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
- **L5 (línea de base, 2026-11-24, después de la #307):** `medir.sh`, 20 pedidos anónimos por ruta, en ms (TTFB p50/p95 · total p50/p95):
  - Estático: 43/73 · 50/79, con `cf-cache-status: HIT`.
  - `/api/mapa/reportes`: 424/457 · 430/462, sin `cf-cache-status`.
  - `/mapa` HTML: 44/75 · 589/655.
  - `/mapa` RSC: 96/113 · 619/655.
  - `/reportes/181` HTML: 90/114 · 610/1006.
  - `/reportes/181` RSC: 100/159 · 837/1164.
  - `/reportes` RSC: 47/65 · 244/567.
  - `/`: 81/97 · 86/103, con `x-nextjs-cache: HIT`.
  - `/comunidad` HTML: 100/138 · 121/159, con STALE.

  Consultas por pedido anónimo: detalle 10 (3 tandas), `/mapa` 3, API del mapa 2.
- **L6:** el embed `autor:public_profiles(username)` devuelve la misma respuesta que `main`: 362 puntos, 356 con autor, mismo hash. Las props del detalle anónimo (reportes 1, 13, 11, 2, 221 y 999999) son idénticas a `main`.
- **L7:** si falla la lectura del rol, `main` ya dejaba votar a un usuario registrado (`puedeVotarReportes` con rol `undefined`). No se cambia acá.
- **L8:** issues #308 (detalle) y #309 (mapa) quedan cubiertos por esta rama. Los otros, #310–#313, necesitan medición antes de implementarse.

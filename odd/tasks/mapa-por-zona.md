# Mapa por zona (#281)

Objetivo: el mapa carga los reportes de la zona visible con PostGIS, sin el límite global de 100, y agrupa en el servidor las zonas densas.
Rama: `feat/mapa-por-zona` desde `main` `ad06598`. Entrega: commits por unidad de trabajo; push y PR los decide el usuario. Pruebas: SQL con `scripts/local-supabase/test-mapa-por-zona.sh`, Vitest (`pnpm vitest run <archivo>`), `pnpm run lint`, `npx tsc --noEmit`.

## Specs

- S1 (issue #281, aceptación): «Un pendiente antiguo sigue visible en su zona aun con más de 100 reportes recientes en otras áreas.»
- S2 (issue #281, aceptación): «No aparecen eliminados, rechazados ni contenido no público.»
- S3 (issue #281, aceptación): «Test de carga, movimiento de mapa y filtros; verificar latencia y consultas con EXPLAIN.»
- S4 (issue #281, aceptación): «RLS y límites antiabuso preservados.»
- S5 (issue #281, alcance): «Mantener filtros, capa mascotas, reportes reparados y foco por ID; incorporar estados abiertos institucionales cuando estén disponibles.»
- S6 (issue #281, alcance): «Debounce, cancelación de solicitudes obsoletas y caché segura.»
- S7 (arquitectura, `docs/arquitectura-mapa-postgis.html`): `GET /api/mapa/reportes` con `zona=oeste,sur,este,norte`, `zoom` (13–18) y los filtros `search`, `categoria`, `estado`, `prioridad`; recorte a `POSADAS_BOUNDS`; estados fijos 1 · 4 · 2 (`estado` solo achica la lista, nunca agrega Rechazado); hasta 300 en la zona responde `{"tipo":"puntos"}`, con más responde `{"tipo":"grupos"}` por celdas de `360 / 2^zoom / 2` grados; `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`.
- S8 (arquitectura): el cliente espera 250 ms tras `moveend`, cancela con `AbortController`, suma y quita marcadores por ID sin redibujar, y al tocar un grupo se acerca a sus límites. Mover el mapa no lo vuelve a encuadrar.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 (funciones SQL por zona y agrupadas, con pruebas) | S1, S2, S3, S4 | inline | hecha | ver Log L3 |
| T2 (consulta por zona y endpoint `GET /api/mapa/reportes`) | S2, S4, S5, S6, S7 | inline | hecha | ver Log L4 |
| T3 (mapa: carga por zona, marcadores incrementales y grupos) | S5, S6, S8 | inline | pendiente | |

Ruta inline en las tres: una sola unidad de comportamiento encadenada (cada tarea depende de la anterior), sin motivo de escritor paralelo.

## Log

- L1 (2026-11-24, usuario): «ya mergee, arranca con la #281»
- L2: decisión vigente de la sesión: opción A (`lat`/`lon` fuente, `ubicacion` generada, aplicada en prod con #295), PostGIS para todo, agrupamiento en el servidor ahora.
- L3 (T1): RED con PostGIS sin funciones («function public.reportes_en_zona(...) does not exist»), GREEN con `test-mapa-por-zona.sh`. Con `set search_path` Postgres no expande la función en línea: el plan se prueba sobre su cuerpo. PostgREST encadena `select` con relaciones, filtros, orden y límite sobre la RPC (probado como `anon` en la red de Docker). Migraciones #295 y T1 aplicadas en la base local de desarrollo.
- L4 (T2): RED/GREEN en `lib/map/zona.test.ts` (16), `app/api/mapa/reportes/route.test.ts` (10) y `mapa-por-zona.test.ts` (4). Las 6 pruebas de zona en `get-report-map-data.test.ts` se escribieron después del cambio en `get-reportes.ts` (sin RED observado). Endpoint real contra la base local: 35 puntos en Posadas con estados 1, 2 y 4, `Cache-Control` público, `estado=Rechazado` vacío, zona inválida 400. `tsc` con los mismos 2 errores que `main`; lint sin avisos en los archivos tocados. Pendiente: verificar en el deploy si Cloudflare respeta `s-maxage` (`cf-cache-status`).

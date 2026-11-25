# Barrio de cada reporte (#299)

Objetivo: importar los barrios de la IDE de Posadas a PostGIS y mostrar el barrio de cada reporte en la ficha y en el panel de Defensoría. Rama `feat/barrios-reporte`. Entrega: `ask-on-risk`. Pruebas: vitest (`pnpm vitest run`) y SQL transaccional con `scripts/local-supabase/test-territorio-barrios.sh`.

## Specs

- **S1 (tabla):** «Esquema `territorio` con la tabla `territorio.barrios`, importada desde `geonode:Barrios_SMU0` del WFS de la IDE de Posadas (licencia ODbL, edición de enero de 2026).»
  - Fuente verificada (L2): WFS `https://www.ide.posadas.gob.ar/geoserver/ows`, 263 `MultiPolygon` en EPSG:5348, nombre en `_Barrio`, `id` único. El catálogo (CSW) declara la última modificación el 2026-06-17, no enero: se registra la fecha que declara la fuente al importar.
- **S2 (importación):** «Script de importación: pide el GeoJSON una vez, transforma de EPSG:5348 a 4326 con `ST_Transform` y registra versión, fecha y atribución.»
  - «La importación es repetible y registra la fecha de la fuente.»
- **S3 (función):** «Función `barrio_de(ubicacion)` con `ST_Covers`. El barrio se calcula en la consulta, no se guarda en `reportes`: si cambian los límites, alcanza con reimportar.»
  - «Prueba SQL: un punto conocido dentro de un barrio devuelve ese barrio; un punto fuera de todos devuelve nulo.»
  - Supuesto: si dos polígonos se superponen, gana el de menor área (el más específico), y si empatan, el de menor `id`.
- **S4 (pantallas):** «Barrio visible en la ficha del reporte y en el panel de Defensoría.»
  - «La ficha y el panel de Defensoría muestran el barrio con su atribución.»
- **S5 (atribución):** «Atribución visible donde aparezca el barrio: «Secretaría de Movilidad Urbana, Dirección SIG-IDE, Municipalidad de Posadas (ODbL)».»
- **S6 (producción):** aplicar la migración y correr la importación en producción. Requiere el permiso de la persona usuaria.

## Tasks

| ID | Tarea | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|---|
| T1 | Migración `territorio` (tabla, importación, `barrio_de`, lote por reportes) y su prueba SQL | S1, S3 | inline | hecho | RED: «schema "territorio" does not exist»; GREEN: `test-territorio-barrios.sh` sale 0 |
| T2 | Script de importación desde el WFS | S2, S5 | inline | hecho | RED: módulo inexistente; GREEN: 7 pruebas; importación real en local: 263 barrios, dos veces (ver L3) |
| T3 | Barrio en la ficha del reporte | S4, S5 | inline | hecho | RED: módulo inexistente y «expected … to contain 'Barrio Centro'»; GREEN: 349 pruebas de queries, ficha y territorio |
| T4 | Barrio en el panel de Defensoría | S4, S5 | inline | hecho | RED: «expected … to contain '>Barrio<'» y la consulta sin llamar a `getBarriosDeReportes`; GREEN: 61 pruebas; suite 3223 (3 fallas previas de `main`) |
| T5 | Docs: access-matrix, AGENTS.md, arquitectura | S1–S5 | inline | pendiente | |
| T6 | Migración e importación en producción | S6 | usuario | pendiente | |

Ruta: todo inline; las unidades dependen del contrato de T1 y no hay motivo de escritor.

## Log

- **L1 (pedido original, 2026-11-25):** «vamos con la 299»
- **L2 (exploración, 2026-11-25):** el host `ide.posadas.gov.ar` tiene un certificado de `www.ide.posadas.gob.ar`; se usa ese. Prod tiene PostGIS 3.3.7 y `EPSG:5348` en `spatial_ref_sys`; no existe el esquema `territorio`. La ficha lee con `createPublicClient()` (anon), así que la función tiene que concederse a `anon`. Defensoría une datos en `getReportesDefensoria` (`database/queries/reportes/get-reportes.ts:539`).
- **L3 (T1 y T2, 2026-11-25):** la RLS de `reportes` oculta a anon los eliminados (`deleted_at is null`), y la prueba lo cubre. La sesión de PostgREST carga `safeupdate`, por eso el borrado de la reimportación lleva `where true`. Importación real en la base local: 263 barrios válidos, recuadro igual al que declara la IDE (diferencia de 1 m), el centro de Posadas da «Centro», 398 de 537 reportes locales caen en un barrio y la búsqueda usa `barrios_geom_idx`. Hay 21 pares de barrios superpuestos (más de 100 m²), así que la regla del más chico de S3 importa. Reimportar deja 263 barrios y 2 registros de importación.
- **L4 (T3, 2026-11-25):** el barrio va en la hoja «Ubicación» con la atribución debajo; la franja angosta no lo muestra (S5 pide la atribución donde aparezca el barrio). `getBarriosDeReportes` devuelve un mapa vacío si la consulta falla o lanza, para que la ficha no se rompa: lo destapó `perfiles-embebidos.test.ts`, cuyo cliente falso no tiene `rpc`. Incidente: un `git stash -- <archivo sin seguimiento>` no guardó nada y el `pop` aplicó el stash de `feat/defensoria-reclamos`. Se revirtieron en la rama exactamente sus 6 archivos versionados y sus 25 nuevos; el stash sigue en la lista, intacto.

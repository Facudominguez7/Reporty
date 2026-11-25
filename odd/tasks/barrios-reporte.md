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
- **S7 (popup del mapa, L7):** «al abrir aca debe aparecer tmb en vez de latitud y longitud». El popup del reporte en `/mapa` muestra «Barrio X» en lugar de «Lat …, Lon …», con la atribución; sin barrio quedan las coordenadas.
- **S8 (mensaje a organismos, L8):** «al momento de avisar a un organismo le llega con latitud y longitud la ubicacion en vez de la calle y altura». El mensaje de WhatsApp o correo de «Contactar a organismos» (ficha y reporte creado) usa `reportes.direccion`; sin dirección, las coordenadas.
- **S9 (hidratación, L9):** «ese error de hidratacion arreglalo aca tmb».
- **S6 (producción):** aplicar la migración y correr la importación en producción. Requiere el permiso de la persona usuaria.

## Tasks

| ID | Tarea | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|---|
| T1 | Migración `territorio` (tabla, importación, `barrio_de`, lote por reportes) y su prueba SQL | S1, S3 | inline | hecho | RED: «schema "territorio" does not exist»; GREEN: `test-territorio-barrios.sh` sale 0 |
| T2 | Script de importación desde el WFS | S2, S5 | inline | hecho | RED: módulo inexistente; GREEN: 7 pruebas; importación real en local: 263 barrios, dos veces (ver L3) |
| T3 | Barrio en la ficha del reporte | S4, S5 | inline | hecho | RED: módulo inexistente y «expected … to contain 'Barrio Centro'»; GREEN: 349 pruebas de queries, ficha y territorio |
| T4 | Barrio en el panel de Defensoría | S4, S5 | inline | hecho | RED: «expected … to contain '>Barrio<'» y la consulta sin llamar a `getBarriosDeReportes`; GREEN: 61 pruebas; suite 3223 (3 fallas previas de `main`) |
| T5 | Docs: access-matrix, AGENTS.md, arquitectura | S1–S5 | inline | hecho | lectura estructural de los tres archivos |
| T7 | Barrio en el popup del mapa en lugar de las coordenadas | S7 | inline | hecho | RED: «function public.barrio(reportes) does not exist» y 2 pruebas de vitest; GREEN: prueba SQL y 74 pruebas; `/api/mapa/reportes` trae `barrio` |
| T8 | Mensaje a organismos con calle y altura en lugar de coordenadas | S8 | inline | hecho | RED: 3 pruebas (borrador, props de las dos pantallas, resultado de creación); GREEN: 700 pruebas |
| T9 | Error de hidratación de `scroll-reveal` | S9 | inline | hecho | RED: 2 pruebas; GREEN: suite con las 3 fallas previas de `main`; Chrome limpio: 1 error de hidratación antes, 0 después |
| T6 | Migración e importación en producción | S6 | usuario | migración aplicada; falta importar | prod: versión 20261125132452 territorio_barrios |

Ruta: todo inline; las unidades dependen del contrato de T1 y no hay motivo de escritor.

## Log

- **L1 (pedido original, 2026-11-25):** «vamos con la 299»
- **L2 (exploración, 2026-11-25):** el host `ide.posadas.gov.ar` tiene un certificado de `www.ide.posadas.gob.ar`; se usa ese. Prod tiene PostGIS 3.3.7 y `EPSG:5348` en `spatial_ref_sys`; no existe el esquema `territorio`. La ficha lee con `createPublicClient()` (anon), así que la función tiene que concederse a `anon`. Defensoría une datos en `getReportesDefensoria` (`database/queries/reportes/get-reportes.ts:539`).
- **L3 (T1 y T2, 2026-11-25):** la RLS de `reportes` oculta a anon los eliminados (`deleted_at is null`), y la prueba lo cubre. La sesión de PostgREST carga `safeupdate`, por eso el borrado de la reimportación lleva `where true`. Importación real en la base local: 263 barrios válidos, recuadro igual al que declara la IDE (diferencia de 1 m), el centro de Posadas da «Centro», 398 de 537 reportes locales caen en un barrio y la búsqueda usa `barrios_geom_idx`. Hay 21 pares de barrios superpuestos (más de 100 m²), así que la regla del más chico de S3 importa. Reimportar deja 263 barrios y 2 registros de importación.
- **L4 (T3, 2026-11-25):** el barrio va en la hoja «Ubicación» con la atribución debajo; la franja angosta no lo muestra (S5 pide la atribución donde aparezca el barrio). `getBarriosDeReportes` devuelve un mapa vacío si la consulta falla o lanza, para que la ficha no se rompa: lo destapó `perfiles-embebidos.test.ts`, cuyo cliente falso no tiene `rpc`. Incidente: un `git stash -- <archivo sin seguimiento>` no guardó nada y el `pop` aplicó el stash de `feat/defensoria-reclamos`. Se revirtieron en la rama exactamente sus 6 archivos versionados y sus 25 nuevos; el stash sigue en la lista, intacto.
- **L5 (T4 y T5, 2026-11-25):** el panel de Defensoría muestra «Barrio» en el detalle, con la atribución debajo, solo si hay barrio. En el servidor de desarrollo, la ficha del reporte 864 trae `"barrio":"Los Oleros (El Porvenir 1)"`. Docs actualizadas: `supabase/access-matrix.md`, `AGENTS.md` y la sección Barrios de `docs/arquitectura-mapa-postgis.html`. Falta T6: aplicar la migración e importar en producción, con permiso.
- **L6 (verificación independiente, 2026-11-25):** S1, S2, S4 y S5 pasan; S3 queda parcial por un bloqueante: `test-territorio-barrios.sh` salía 3 sobre una base ya migrada («relation "importaciones_barrios" already exists»). Seguridad sin hallazgos: anon y authenticated no escriben ni importan, `barrios_de_reportes` no devuelve reportes eliminados, y una importación fallida deja los barrios intactos. Observación A: una geometría que no es polígono se guardaba como barrio vacío. Corrección única: el script borra `territorio` dentro de la transacción antes de aplicar la migración, e `importar_barrios` rechaza geometrías vacías. Se sumaron pruebas de punto, coordenadas inválidas e id repetido. Nueva verificación: el script sale 0 dos veces seguidas y la base local sigue con 263 barrios.
- **L7 (pedido, 2026-11-25):** «al abrir aca debe aparecer tmb en vez de latitud y longitud» (captura del popup de un reporte en `/mapa`). Se resolvió con el campo calculado `public.barrio(reportes)` de PostgREST: el mapa lo pide en el `select` (también sobre `reportes_en_zona`) y las listas no. En el mismo mensaje vino una captura de un error de hidratación causado por `components/scroll-reveal.tsx`, que no es de esta feature.
- **L8 (pedido, 2026-11-25):** «otra cosa que hay que arreglar acaa tmb es al momento de avisar a un organismo le llega con latitud y longitud la ubicacion en vez de la calle y altura». El texto sale de `createContactDraft` (`lib/report-contacts/contact-actions.ts`). El correo automático (`sendOrganismoNotificationEmail`) no lleva ubicación.
- **L9 (pedido, 2026-11-25):** «ese error de hidratacion arreglalo aca tmb».
- **L10 (T9, 2026-11-25):** causa: `components/scroll-reveal.tsx`, montado en el layout, agregaba `scroll-reveal` y `scroll-reveal-visible` a `.page-container > *` 120 ms después del `load`; si React todavía hidrataba ese contenido, el `className` no coincidía. En Chrome, un bloque «oculto» de `/donar` tenía opacidad 1: la animación `reporty-reveal-up` (fill `both`) le ganaba, así que el script no tenía efecto visible en `.page-container`. Solo se notaba en `.auth-shell`, sin animación propia. Se borró el componente y sus reglas, y `.auth-shell > *` usa la misma animación CSS.
- **L11 (pedido, 2026-11-25):** «aplica la migracion en prod». Aplicada con el MCP de Supabase como `20261125132452 territorio_barrios` (el archivo del repo es `20261125130000`). Verificado: 0 barrios; anon y authenticated no importan, service_role sí; anon puede pedir `barrio`; RLS activa; el campo `barrio` responde sobre `reportes`. Los avisos de seguridad no muestran nada nuevo sobre `territorio`. Falta la importación de los barrios.

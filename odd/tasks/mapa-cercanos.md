# Cercanos al abrir el mapa (#297)

Objetivo: al abrir `/mapa`, centrar el mapa en la persona y mostrar los reportes y las mascotas perdidas cercanos, ordenados por distancia. Rama `feat/mapa-cercanos`. Entrega: `ask-on-risk`. Pruebas: vitest (`pnpm vitest run`) y SQL transaccional con `scripts/local-supabase/test-mapa-cercanos.sh`.

## Specs

- **S1 (punto de la persona):** «se tiene que ver el punto de la persona para que sepa que esa es su ubicacion». El punto se ve siempre que haya una lectura dentro de Posadas, aunque el mapa no se mueva solo.
- **S2 (permiso al abrir):** «Sin botón: al abrir `/mapa` se consulta el estado del permiso de ubicación.»
  - «`granted`: se centra el mapa en la persona a zoom 16, con su punto, un círculo de 500 m y un panel compacto «N reportes cerca tuyo».»
  - «`prompt`: se pide el permiso en ese momento (diálogo del navegador; diálogo nativo en la app Android, que ya tiene `locationDelegation` activo). Si se cierra sin responder, no se vuelve a pedir en esa sesión.»
  - «`denied`: el mapa abre como hoy, con un aviso chico y descartable, una sola vez, que explica cómo activarla.»
  - «Sin Permissions API: se llama directo a la geolocalización.»
- **S3 (cuándo no se mueve):** «El mapa no se mueve solo si se llegó desde un reporte (`/mapa?reporte=…`), si la persona ya movió el mapa o si está fuera de Posadas.»
- **S4 (una lectura):** «Una sola lectura por visita con `buscarUbicacionPrecisa` (tiempo máximo 6 s), sin seguimiento continuo.»
- **S5 (función SQL):** «Función `cerca_de(lat, lon, radio_m, estados)` con `ST_DWithin` y `ST_Distance`, para reportes y mascotas.»
  - Prueba: «con puntos a 90, 480 y 520 m de un punto conocido, el radio de 500 m devuelve los dos primeros, ordenados.»
  - Supuesto: las mascotas que entran son las `perdida` visibles por RLS (la historia habla de «mascotas perdidas»). Los reportes, con los estados del mapa (pendiente, tomado por la Defensoría y reparado) y sin eliminados.
- **S6 (endpoint):** «`POST /api/mapa/cerca` con `{lat, lon, radio}` en el cuerpo: coordenada redondeada a 4 decimales, dentro de Posadas, radio de 100 a 2000 m, `Cache-Control: no-store` y sin la coordenada en los logs. Nunca se guarda.»
  - «El endpoint rechaza coordenadas fuera de Posadas y radios fuera de rango.»
  - «La coordenada no aparece en logs ni en ninguna tabla.»
- **S7 (panel):** «Panel compacto que se expande al tocarlo, con radios de 300 m, 500 m y 1 km; aviso «Ubicación aproximada» si la precisión supera 50 m.»
- **S8 (Android):** «Probado en Android dentro de la TWA.» Requiere a la persona usuaria con el teléfono.

## Tasks

| ID | Tarea | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|---|
| T1 | Función `cerca_de` y su prueba SQL | S5 | inline | hecho | RED: la prueba falla sin la función; GREEN: `test-mapa-cercanos.sh` sale 0; usa los dos índices GiST |
| T2 | Endpoint `POST /api/mapa/cerca` | S6 | inline | pendiente | |
| T3 | Ubicación al abrir el mapa: permiso, punto, círculo y centrado | S1–S4 | inline | pendiente | |
| T4 | Panel de cercanos con radios y aviso de precisión | S7 | inline | pendiente | |
| T5 | Migración en producción y prueba en la TWA | S8 | usuario | pendiente | |

Ruta: todo inline; ninguna unidad tiene un motivo de escritor (no hay unidades paralelas independientes).

## Log

- **L1 (pedido original, 2026-11-24):** «dale, arrancá con la 297. se tiene que ver el punto de la persona para que sepa que esa es su ubicacion»
- **L2 (T1, decisiones):**
  - `cerca_de` devuelve `tipo, id, titulo, metros`, como máximo 100 filas. El título de una mascota es su `tipo_animal`.
  - Las mascotas no se filtran por moderación dentro de la función: `anon` solo tiene permisos por columna sobre `mascotas_perdidas` (sin `moderacion_estado` ni `retirada_at`), así que lo decide la RLS (vigente y aprobada), igual que en `reportes_en_zona`.
  - Por eso no se concede a `service_role`, que saltea la RLS. Hubo que revocarlo explícitamente: Supabase lo concede por privilegios por defecto.
  - EXPLAIN como `anon`: `reportes_ubicacion_gist` y `mascotas_perdidas_ubicacion_gist`.

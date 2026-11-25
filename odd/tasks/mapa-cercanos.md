# Cercanos al abrir el mapa (#297)

Objetivo: al abrir `/mapa`, centrar el mapa en la persona y mostrar los reportes y las mascotas perdidas cercanos, ordenados por distancia. Rama `feat/mapa-cercanos`. Entrega: `ask-on-risk`. Pruebas: vitest (`pnpm vitest run`) y SQL transaccional con `scripts/local-supabase/test-mapa-cercanos.sh`.

## Specs

- **S1 (punto de la persona):** «se tiene que ver el punto de la persona para que sepa que esa es su ubicacion». El punto se ve siempre que haya una lectura dentro de Posadas, aunque el mapa no se mueva solo.
- **S2 (permiso al abrir):** «Sin botón: al abrir `/mapa` se consulta el estado del permiso de ubicación.»
  - «`granted`: se centra el mapa en la persona a zoom 16, con su punto, un círculo de 500 m y un panel compacto «N reportes cerca tuyo».»
  - Cambiado en L7: en vez de zoom 16 fijo, el mapa encuadra el círculo entero (zoom 15 en un iPhone para 500 m).
  - «`prompt`: se pide el permiso en ese momento (diálogo del navegador; diálogo nativo en la app Android, que ya tiene `locationDelegation` activo). Si se cierra sin responder, no se vuelve a pedir en esa sesión.»
  - «`denied`: el mapa abre como hoy, con un aviso chico y descartable, una sola vez, que explica cómo activarla.»
  - «Sin Permissions API: se llama directo a la geolocalización.»
- **S3 (centrado, reescrita en L6):** «en la carga del mapa siempre debe redirigir a la ubicacion del usuario». Al llegar la ubicación se centra siempre, aunque el mapa se haya movido mientras se leía. Excepción, que la persona usuaria puede revisar: al llegar desde un reporte (`/mapa?reporte=…`) se muestra ese reporte. Fuera de Posadas no hay ubicación que mostrar.
- **S4 (lectura y seguimiento, reescrita en L9):** la primera lectura usa `buscarUbicacionPrecisa`, con 6 s como máximo. Después, «si, que te siga»: el punto sigue a la persona mientras el mapa está a la vista; el mapa no se mueve solo; lo cercano se vuelve a pedir cuando se alejó más de 100 m; el GPS se apaga al pasar a otra app o pestaña. (Antes: «Una sola lectura por visita…, sin seguimiento continuo.»)
- **S5 (función SQL):** «Función `cerca_de(lat, lon, radio_m, estados)` con `ST_DWithin` y `ST_Distance`, para reportes y mascotas.»
  - Prueba: «con puntos a 90, 480 y 520 m de un punto conocido, el radio de 500 m devuelve los dos primeros, ordenados.»
  - Supuesto: las mascotas que entran son las `perdida` visibles por RLS (la historia habla de «mascotas perdidas»). Los reportes, con los estados del mapa (pendiente, tomado por la Defensoría y reparado) y sin eliminados.
- **S6 (endpoint):** «`POST /api/mapa/cerca` con `{lat, lon, radio}` en el cuerpo: coordenada redondeada a 4 decimales, dentro de Posadas, radio de 100 a 2000 m, `Cache-Control: no-store` y sin la coordenada en los logs. Nunca se guarda.»
  - «El endpoint rechaza coordenadas fuera de Posadas y radios fuera de rango.»
  - «La coordenada no aparece en logs ni en ninguna tabla.»
- **S7 (panel):** «Panel compacto que se expande al tocarlo, con radios de 300 m, 500 m y 1 km; aviso «Ubicación aproximada» si la precisión supera 50 m.»
  - L7: «cuando se aumenta o disminuye la ubicacion desde reportes cerca tuyo debe o acercar o alejar el zoom». Al cambiar el radio, el mapa encuadra el círculo nuevo.
- **S8 (Android):** «Probado en Android dentro de la TWA.» Requiere a la persona usuaria con el teléfono.

## Tasks

| ID | Tarea | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|---|
| T1 | Función `cerca_de` y su prueba SQL | S5 | inline | hecho | RED: la prueba falla sin la función; GREEN: `test-mapa-cercanos.sh` sale 0; usa los dos índices GiST |
| T2 | Endpoint `POST /api/mapa/cerca` | S6 | inline | hecho | RED: 4 archivos sin módulo; GREEN: 23 pruebas; tsc solo con los 2 errores previos de main |
| T3 | Ubicación al abrir el mapa: permiso, punto, círculo y centrado | S1–S4 | inline | hecho | RED: módulo inexistente; GREEN: 13 pruebas del flujo; Chrome: 14/14 casos (ver L4) |
| T4 | Panel de cercanos con radios y aviso de precisión | S7 | inline | hecho | RED: componentes inexistentes; GREEN: 10 pruebas del panel y el aviso; Chrome: radio 1 km y lista |
| T5 | Migración en producción y prueba en la TWA | S8 | usuario | migración aplicada; falta la TWA | ver L11 |

Ruta: todo inline; ninguna unidad tiene un motivo de escritor (no hay unidades paralelas independientes).

## Log

- **L1 (pedido original, 2026-11-24):** «dale, arrancá con la 297. se tiene que ver el punto de la persona para que sepa que esa es su ubicacion»
- **L2 (T1, decisiones):**
  - `cerca_de` devuelve `tipo, id, titulo, metros`, como máximo 100 filas. El título de una mascota es su `tipo_animal`.
  - Las mascotas no se filtran por moderación dentro de la función: `anon` solo tiene permisos por columna sobre `mascotas_perdidas` (sin `moderacion_estado` ni `retirada_at`), así que lo decide la RLS (vigente y aprobada), igual que en `reportes_en_zona`.
  - Por eso no se concede a `service_role`, que saltea la RLS. Hubo que revocarlo explícitamente: Supabase lo concede por privilegios por defecto.
  - EXPLAIN como `anon`: `reportes_ubicacion_gist` y `mascotas_perdidas_ubicacion_gist`.
- **L3 (T2, decisiones):**
  - `buscarCercanos` llama a `cerca_de` por POST, sin `{ get: true }`: así la coordenada no queda en la URL que registra el gateway de Supabase. Hay una prueba que lo fija.
  - Ante un error, el endpoint solo escribe en los logs el código y el mensaje de la consulta, o el nombre de la excepción; las pruebas verifican que la coordenada no aparezca.
  - El proxy deja pasar `/api/mapa/cerca` sin refrescar la sesión, igual que `/api/mapa/reportes`.
- **L4 (T3 y T4, verificación y decisiones):**
  - Lógica sin React ni Leaflet en `lib/map/ubicacion-al-abrir.ts`: permiso, una sola lectura de 6 s, Posadas, «no volver a pedir en la sesión» y aviso una sola vez. `debeCentrarEnPersona` decide el centrado.
  - El punto: azul con borde blanco, halo que late (sin animación con `prefers-reduced-motion`) y la etiqueta «Estás acá» siempre visible. Se dibuja aunque el mapa no se mueva (foco de reporte o mapa ya movido), para cumplir S1.
  - «Mapa movido por la persona» = cualquier `movestart` después de la primera vista. `invalidateSize` (el teléfono esconde la barra) no dispara `movestart`: está verificado en el código de Leaflet.
  - Bug encontrado en Chrome: StrictMode repetía el efecto, la primera corrida marcaba el aviso de permiso negado y la segunda ya no lo mostraba. Se arregló con una ref que corre el flujo una vez por montaje, lo que también garantiza una sola lectura en desarrollo.
  - El panel muestra «100+» al llegar al máximo de 100 filas de `cerca_de`. Esa prueba se escribió junto con el cambio, sin RED previo.
  - Chrome (playwright-core con el Chrome del sistema, 390×844, contra el servidor de desarrollo y la base local con la migración aplicada), 14/14:
    - `granted`: punto con «Estás acá», centrado a 0 px, círculo, panel «70 reportes cerca tuyo».
    - Un solo POST sin la coordenada en la URL, redondeada a 4 decimales; el radio de 1 km manda 1000 y no mueve el mapa.
    - Con foco de reporte, el punto queda a 795 px del centro (no centra).
    - Precisión de 120 m: «Ubicación aproximada». Fuera de Posadas: sin punto ni pedido.
    - `denied`: el aviso se descarta y no vuelve.
  - Límites de esa verificación:
    - Chrome headless convierte `prompt` en `denied`, así que «sin respuesta → no volver a pedir» quedó cubierto solo por las pruebas unitarias.
    - El estado `denied` se simuló sobreescribiendo `permissions.query`, porque `Browser.setPermission` no aplica a contextos aislados.
    - El caso «la persona movió el mapa antes de la lectura» no se probó en el navegador.
    - El servidor de desarrollo de la persona usuaria servía un CSS viejo, sin las reglas nuevas; las capturas inyectan ese bloque de `globals.css`, que compila bien con `@tailwindcss/postcss`.
  - Suite: 3188 pruebas pasan; fallan las 3 de `app/mascotas/nueva/resultado-navegacion.test.ts`, que ya fallaban en main. `tsc` solo muestra los 2 errores previos de main.
- **L5 (verificador independiente, riesgo ítem 2: privacidad y permisos de la RPC):**
  - Sin bloqueantes. S1–S7 PASS; S8 no se verificó porque necesita el teléfono.
  - Probó como `anon` y `authenticated` dentro de una transacción revertida: radios de 90, 480 y 520 m en otra dirección; valores `±Infinity`, `NaN` y nulos; arreglos de dos dimensiones; mascotas retiradas.
  - Permisos de la función: `{postgres, anon, authenticated}`, sin `service_role` ni `PUBLIC`.
  - Probó el endpoint con 12 cuerpos: siempre `no-store`, sin cookies; un `estados` extra se descarta.
  - Los rechazados que se obtienen llamando directo a la RPC ya eran públicos por la RLS de `reportes`: no es una exposición nueva.
  - **Nota 1, aplicada:** los 6 s corrían desde que se abre el diálogo de permiso. Si la persona tardaba más en aceptar, no veía su punto. Ahora, si vencen sin respuesta, se espera el evento `change` del permiso y se lee una vez más al aceptar.
    - RED: «si la persona tarda más de 6 s en aceptar el permiso, lee apenas lo acepta» falló.
    - GREEN: 64 pruebas de `lib/map`.
    - Se agregó otra prueba que fija que, si niega, no se lee de nuevo.
  - Notas aceptadas sin cambio:
    - Las teselas a zoom 16 revelan la zona al proveedor del mapa, lo mismo que si la persona moviera el mapa a mano.
    - No se revisó si Postgres en producción registra los parámetros de las RPC.
    - El aviso de permiso negado aparece una vez por dispositivo.
- **L6 (corrección de la persona usuaria, 2026-11-24):** «no, no aparece. en la carga del mapa siempre debe redirigir a la ubicacion del usuario»
  - Diagnóstico: el registro de pedidos del servidor de desarrollo muestra `/mapa` seguido de `POST /api/mapa/cerca` 200. El teléfono dio una ubicación dentro de Posadas, pero el mapa no se centró y el punto quedó fuera de la pantalla.
  - Causa probable: antes de la lectura hubo un `movestart` (un toque de la persona o la animación de entrada), y la regla «si la persona ya movió el mapa» bloqueaba el centrado.
  - En Chrome, con la ubicación demorada 3 s, centraba bien. El servidor de desarrollo además servía un CSS viejo; se reinició.
  - Cambio: `debeCentrarEnPersona` solo mira el foco de reporte, y se quitó la marca de «mapa movido».
    - RED: los tipos de la prueba nueva no compilaban.
    - GREEN: 80 pruebas de `lib/map` y `components/map`.
    - Chrome: arrastrando el mapa antes de que llegue la ubicación, el punto queda centrado.
- **L7 (pedido de la persona usuaria, 2026-11-24):** «mira el video de la prueba en taildrop, cuando se aumenta o disminuye la ubicacion desde reportes cerca tuyo debe o acercar o alejar el zoom»
  - El video del iPhone confirma que, con el JS nuevo, el punto y el centrado andan. Al cambiar el radio, solo se redibujaba el círculo.
  - Cambio: `debeEncuadrarRadio` detecta el cambio de radio y el mapa hace `fitBounds` del círculo, con margen para el panel y la leyenda.
  - Al abrir también se encuadra el círculo, en vez de zoom 16 fijo. Con zoom 16, el círculo de 500 m no entraba en el iPhone (472 px en 390 px), y pasar de 500 a 300 m no cambiaba el zoom.
  - RED: `debeEncuadrarRadio is not a function`. GREEN: 82 pruebas de `lib/map` y `components/map`.
  - WebKit con iPhone 13: al abrir, 500 m da zoom 15; 300 m, zoom 16; 1 km, zoom 14. El círculo queda entero y centrado.
- **L8 (entorno, 2026-11-24):** el servidor de desarrollo mandaba los estáticos con `immutable`, y Safari usaba JS y CSS viejos. Commits `4577934` (la regla queda solo para producción) y `320421c` (prueba).
- **L9 (decisión de la persona usuaria, 2026-11-24):** a «que ocurre si ia persona se mueve», respondió «si, que te siga» a la propuesta de seguir la ubicación con el mapa abierto.
  - `seguirUbicacion` usa `watchPosition` con alta precisión e ignora las lecturas fuera de Posadas. Arranca recién con la primera ubicación, cuando el permiso ya está dado, así que no abre otro diálogo.
  - `debeActualizarCercanos` vuelve a pedir lo cercano a más de 100 m del último punto de búsqueda; reusa `distanciaEnMetros`.
  - El hook apaga el seguimiento con `visibilitychange` (pestaña oculta) y al desmontar.
  - Privacidad: cada nueva búsqueda manda la coordenada redondeada, como antes; a lo sumo una cada 100 m.
  - RED: 5 pruebas fallaron («is not a function»). GREEN: 87 pruebas de `lib/map` y `components/map`.
  - WebKit con iPhone 13, moviendo la ubicación simulada:
    - a 50 m, el punto se mueve y no se pide de nuevo lo cercano;
    - a 150 m, se hace el segundo pedido (`-27.3693`, redondeado);
    - con el mapa movido por la persona, el punto sigue moviéndose y el mapa no vuelve.
  - No probado: el apagado al ocultar la pestaña, que solo cubre el código, sin prueba.
- **L10 (pedido de la persona usuaria, 2026-11-24):** «tmb si cambias a mascotas desde el mapa es decir con ek switch no vuekve a tu ubicacion como si se hace en incidentes»
  - Causa: al pasar a la capa de mascotas, `LeafletMap` encuadraba todas las mascotas de la ciudad.
  - Cambio: si hay ubicación de la persona, encuadra su círculo con el mismo margen (`MARGEN_CIRCULO_PERSONA`); sin ubicación, sigue como antes.
  - WebKit con iPhone 13: con el código anterior, el punto quedaba en (650, 160), fuera de la pantalla; con el cambio, en (195, 364), centrado. No hay prueba unitaria: es lógica de Leaflet sin módulo puro.
- **L11 (T5, migración en producción y prueba en la TWA; 2026-11-24):** «aplica la migracion en prod».
  - Se aplicó `20261125120000_mapa_cercanos.sql` en una transacción con `execute_sql`, y se registró en `supabase_migrations.schema_migrations` con la misma versión.
  - Verificado en producción:
    - permisos `{postgres, anon, authenticated}`; `service_role` sin `execute`; `stable`, `security invoker`;
    - como `anon`, con radio de 1 km, devolvió 10 reportes (126 a 927 m) y 7 mascotas (324 a 954 m);
    - un radio de 5000 m se rechaza con `22023`.
  - El iPhone con Safari ya se probó (la persona usuaria respondió «funciona»). Falta la app de Android (TWA).

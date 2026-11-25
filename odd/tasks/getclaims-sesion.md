# getClaims en la sesión (#310)

Objetivo: que las páginas con sesión no paguen un viaje a `auth/v1/user` para saber quién es el usuario, sin debilitar las escrituras, la revocación ni el vencimiento absoluto (#180).
Rama: `perf/getclaims-sesion`. Entrega: una PR. Pruebas: `pnpm test` (Vitest), `npx tsc --noEmit`, `pnpm run lint`.

## Specs

- **S1:** el proxy (`utils/supabase/middleware.ts`) valida la sesión con `auth.getClaims()` (firma ES256 verificada localmente) en lugar de `auth.getUser()`. Las guardas de rutas y de roles se comportan igual que antes.
- **S2:** el vencimiento absoluto de #180 se conserva: mismos límites, misma exención de sesiones anónimas, mismo cierre cuando falla la revocación. Si el token no trae `amr`, se recurre a `getUser()` para leer `last_sign_in_at`, como antes.
- **S3:** las páginas que solo **leen** y no son de staff usan los claims: detalle de reporte (incluida la sección de evidencia de reparación), `/mis-reportes`, `/dashboard`, `/mascotas/nueva`, `/mascotas/[id]` y `/auth/nueva-contrasena`.
- **S4:** siguen con `getUser()`: todas las server actions y route handlers que escriben, y las páginas de staff (`/admin/*`, `/defensoria`, cuadrillas, usuarios y donaciones del admin), porque ahí el control de rol habilita lecturas con el cliente de servicio. El tráfico de esas páginas es mínimo.
- **S5:** `crearContrasenaCuenta` refresca la sesión después de `updateUser`, para que los claims dejen de marcar `password_pending` en el mismo momento y no recién cuando vence el token.
- **S6:** medición en producción después del deploy: llamadas diarias a `auth/v1/user` (línea de base: 1404 en 24 h, p50 165 ms, p95 485 ms) y tiempo de las páginas con sesión.

Supuesto verificado: la clave actual del proyecto es ECC (P-256) y la HS256 quedó como «Previously used key» (captura del Dashboard, 2026-11-24).

## Tasks

| ID | Tarea | Specs | Ruta | Estado | Evidencia |
|----|-------|-------|------|--------|-----------|
| T1 | Proxy con `getClaims`, con respaldo de `getUser` si falta `amr` | S1, S2 | inline | hecho | 7b60880. RED 15/15 → GREEN 16/16. Riesgo: ítem 2 (autenticación) |
| T2 | Helper de usuario desde claims y páginas de lectura | S3, S4 | inline | hecho | 750362d. Riesgo: ítem 2 (autenticación) |
| T3 | Refrescar la sesión al crear la contraseña | S5 | inline | hecho | 6c53472. RED 1 → GREEN 83/83 |
| T4 | Medición después del deploy | S6 | inline | hecho | L5 |

## Log

- **L1 (2026-11-24, pedido original):** «dale, cerralas y arrancá con la #310». Alcance aprobado: «dale, avanzá con ese alcance» (`getClaims` en el proxy y en las lecturas, `getUser` en las escrituras).
- **L2 (hallazgos antes de implementar):**
  - JWKS del proyecto: una clave ES256. En el Dashboard figura como clave actual, y la HS256 como «Previously used».
  - supabase-js 2.56.1 / ssr 0.7.0 ya traen `getClaims`: verifica la firma con WebCrypto, guarda el JWKS en una caché global del isolate por 10 minutos y, si el token es HS*, vuelve a `getUser`.
  - Edge logs de 24 h: `auth/v1/user` 1404 llamadas, p50 165 ms, p95 485 ms.
  - `getClaims` no detecta la revocación hasta que vence el access token (≤1 h). PostgREST y RLS ya aceptan el mismo JWT hasta su vencimiento, así que en las lecturas con sesión no se abre nada nuevo. Por eso las páginas de staff, que leen con el cliente de servicio, quedan con `getUser` (S4).
  - `updateUser` conserva el access token anterior, y con él los claims viejos. La única acción que cambia metadatos con la sesión del propio usuario es `crearContrasenaCuenta` (S5).
  - Excluido del alcance: los `getUser` del navegador (`/reportes/nuevo`, `/auth`) no pasan por el Worker.
- **L3 (implementación, 2026-11-24):**
  - T1: el proxy usa `getClaims`. Si el token no trae `amr`, llama a `getUser` solo para leer `last_sign_in_at`. Un token que no verifica cuenta como sesión inexistente.
  - T2: `lib/auth/usuario-de-lectura.ts` (`obtenerUsuarioDeLectura`, `usuarioDesdeClaims`, `sesionVigenteEnAuth`). Dos hallazgos durante la migración:
    - `email_confirmed_at` no viaja en el token. Se usa `user_metadata.email_verified`: en producción lo tienen los 116 confirmados y ninguno de los 4 sin confirmar, que además no tienen sesión. Solo decide qué se muestra; la acción y la RPC siguen exigiendo `email_confirmed_at`.
    - `new_email` tampoco viaja. `/mis-reportes` lo sigue leyendo de Auth, solo para invitados.
  - T2, S4 aplicado dentro del detalle: quien opera cuadrillas confirma su sesión con `sesionVigenteEnAuth` antes de cargar el panel interno, porque se lee con el cliente de servicio.
  - T3: `crearContrasenaCuenta` llama a `refreshSession()` después de `updateUser`. Si el refresco falla, el flujo termina igual.
  - Documentación: sección «Session checks: reads vs writes» en `supabase/access-matrix.md`. `AGENTS.md` y `CLAUDE.md` se actualizaron, pero están en `.gitignore`.
  - Verificación: `pnpm test` 3142 pasan y 3 fallan; las 3 fallas son de `app/mascotas/nueva/resultado-navegacion.test.ts` y ya fallaban en la base (verificado con `git stash`). `tsc`: 2 errores, los mismos que en la base, en pruebas que este cambio no toca. `eslint` sin advertencias en los archivos cambiados.
  - Próximo paso: PR, deploy y T4 (medición).
- **L4 (verificación independiente, riesgo ítem 2):** S1–S5 PASS, sin regresiones de seguridad. Un bloqueante y una observación aplicada:
  - **B1 (robustez):** `getClaims` relanza los errores que no son AuthError (token vencido o malformado, `alg` inválido), mientras que `getUser` los devolvía como error. Con una cookie dañada, el proxy daba 500 en todas las rutas, `/auth` incluida. Corrección: try/catch que lo trata como sesión inexistente. Prueba de borde: RED → GREEN.
  - **Observación aplicada:** `puedeInformarReparacion` vuelve a aceptar solo `email_confirmed_at` (mutaciones), y la vista usa `mostrarParticipacionReparacion`. Así una mutación no puede satisfacerse con metadatos editables. Una prueba lo fija.
  - **Observaciones no aplicadas:**
    - `/mascotas/[id]` lee la propiedad y el rol con el cliente de servicio, pero solo para mostrar botones; las acciones vuelven a verificar con `getUser`.
    - Los avisos con `email` pueden mostrar el correo anterior hasta que se refresca el token (≤1 h).
- **L5 (medición después del deploy de la #319, 2026-11-24, merge ce6e650):**
  - **Métrica:** llamadas a `auth/v1/user` por cada consulta REST con sesión de usuario (`role = authenticated` en los edge logs). No depende de cuánta gente entra.
    - Línea de base (24 h antes del deploy): 1347 llamadas sobre 1199 consultas = **1,12**.
    - Después, en dos sesiones reales con login, refresh y navegación por el detalle, `/dashboard` y `/reportes`: 2 llamadas sobre 10 consultas = **0,2** (−82 %). La muestra es chica; conviene repetirla con 24 h de tráfico.
  - **Firma:** todos los tokens de usuario de las últimas 24 h vienen firmados con ES256, así que `getClaims` nunca vuelve a `getUser` por un token HS256.
  - **Lo que queda en `auth/v1/user`:** una llamada por carga completa de página con sesión. Viene de `obtenerEstadoPushAction` (server action de lectura), que `InvitacionPush` llama desde el layout raíz. Se identificó por el `POST /reportes` que coincide en los logs del Worker con cada llamada. Queda como seguimiento, porque el alcance aprobado dejó todas las server actions con `getUser`.
  - **JWKS:** se descarga casi en cada pedido con sesión (17 veces para ~10 pedidos). La caché global de auth-js no está aguantando entre pedidos en el Worker. Igual sale de la caché de Supabase (`HIT`, 2–9 ms de `origin_time`), contra 237–257 ms de `auth/v1/user` en la misma ventana. Es otro seguimiento posible.
  - **Rutas públicas** (`medir.sh`, 3 corridas de 30; mediana del p50 total, antes → ahora), sin cambios fuera del ruido, como se esperaba (sin sesión, `getUser` tampoco viajaba):
    - API del mapa: ~263 → ~271 ms.
    - `/mapa`: ~421 → ~430 ms (HTML) y ~410 → ~416 ms (RSC).
    - Detalle: ~511 → ~453 ms (HTML) y ~444 → ~440 ms (RSC).
    - `/reportes`: ~281 → ~291 ms (HTML) y ~284 → ~286 ms (RSC).
  - **No medido:** el tiempo de las páginas con sesión, porque `medir.sh` es anónimo y no hay una cookie de prueba. El ahorro esperado por pedido con sesión es un viaje a Auth (~240 ms en esta ventana) en el camino crítico del proxy.
  - Cierre: S1–S6 cubiertos.

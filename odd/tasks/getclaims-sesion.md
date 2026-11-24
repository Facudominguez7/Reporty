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
| T1 | Proxy con `getClaims`, con respaldo de `getUser` si falta `amr` | S1, S2 | inline | pendiente | Riesgo: ítem 2 (autenticación) |
| T2 | Helper de usuario desde claims y páginas de lectura | S3, S4 | inline | pendiente | Riesgo: ítem 2 (autenticación) |
| T3 | Refrescar la sesión al crear la contraseña | S5 | inline | pendiente | |
| T4 | Medición después del deploy | S6 | inline | pendiente | |

## Log

- **L1 (2026-11-24, pedido original):** «dale, cerralas y arrancá con la #310». Alcance aprobado: «dale, avanzá con ese alcance» (`getClaims` en el proxy y en las lecturas, `getUser` en las escrituras).
- **L2 (hallazgos antes de implementar):**
  - JWKS del proyecto: una clave ES256. En el Dashboard figura como clave actual, y la HS256 como «Previously used».
  - supabase-js 2.56.1 / ssr 0.7.0 ya traen `getClaims`: verifica la firma con WebCrypto, guarda el JWKS en una caché global del isolate por 10 minutos y, si el token es HS*, vuelve a `getUser`.
  - Edge logs de 24 h: `auth/v1/user` 1404 llamadas, p50 165 ms, p95 485 ms.
  - `getClaims` no detecta la revocación hasta que vence el access token (≤1 h). PostgREST y RLS ya aceptan el mismo JWT hasta su vencimiento, así que en las lecturas con sesión no se abre nada nuevo. Por eso las páginas de staff, que leen con el cliente de servicio, quedan con `getUser` (S4).
  - `updateUser` conserva el access token anterior, y con él los claims viejos. La única acción que cambia metadatos con la sesión del propio usuario es `crearContrasenaCuenta` (S5).
  - Excluido del alcance: los `getUser` del navegador (`/reportes/nuevo`, `/auth`) no pasan por el Worker.

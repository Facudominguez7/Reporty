# Donaciones con Mercado Pago

Objetivo: cualquiera puede donar a Reporty por Mercado Pago (Checkout Pro) y el admin ve todas las donaciones.
Rama: `feat/donaciones` · Entrega: ask-on-risk · Tests: `pnpm vitest run`, `npx tsc --noEmit`, `pnpm run lint`.

## Specs

- **S1 — Quién dona.** "Cualquiera (Recomendado)": no hace falta sesión; si hay sesión, la donación queda asociada al usuario.
- **S2 — Ubicación.** "opcion 2 y despues de publicar un reporte o mascota": un botón «Donar» fijo en el encabezado (B) y una invitación dentro del diálogo que aparece después de publicar un reporte o una mascota (D). Las dos llevan a `/donar`.
- **S3 — Montos.** "1.000 a 20.000 + Otro (Recomendado)": $1.000, $2.000, $5.000, $10.000 y $20.000, más «Otro» con monto libre (mínimo $500). Nombre y mensaje son opcionales.
- **S4 — Pago.** "la plata iria a un mercado pago": el pago se hace en Checkout Pro de Mercado Pago (redirección). Reporty no ve datos de tarjeta. El servidor confirma el estado consultando `GET /v1/payments/{id}`, nunca confiando en el navegador.
- **S5 — Privacidad.** "Solo el admin las ve (Recomendado)": nombre y mensaje no se muestran en público.
- **S6 — Panel admin.** "desde el panel admin se debe de poder visualizar todas las donaciones" + "Lo anterior + exportar CSV": tabla con fecha, monto, estado (aprobada/pendiente/rechazada), nombre, mensaje y usuario si tenía sesión; totales del mes y de siempre; filtros por estado y mes; exportar CSV.
- **S7 — Emails.** "Avisar también al admin": cuando el pago queda aprobado, email de agradecimiento al donante si tenía sesión ("Gracias por tu donación de $X") y aviso a los admins. Cada email se manda una sola vez por pago.
- **S8 — Credenciales.** "Sí, ya la tengo": se desarrolla con las credenciales de prueba de la app `57185228504296`; el usuario carga las de producción en Cloudflare. Variables: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
| --- | --- | --- | --- | --- |
| T1 | S4, S5, S6 | inline | hecho | a48213c |
| T2 | S3, S4 | inline | hecho | a48213c |
| T3 | S1, S3, S4 | inline | hecho; falta pago real de prueba | 8dd9fb9 |
| T4 | S4, S7 | inline | hecho; falta pago real de prueba | a48213c, 8dd9fb9 |
| T5 | S6 | inline | hecho; sin verificación visual con sesión admin | 5ca8fdb |
| T6 | S2 | inline | hecho | 141e335 |
| T7 | S8 | inline | hecho (docs); faltan credenciales del usuario | 141e335 |

- T1: migración `donaciones` (RLS sin políticas: solo service role).
- T2: `lib/donaciones` (montos, validación, cliente de Mercado Pago, firma del webhook).
- T3: página `/donar`, acción que crea la preferencia, página de vuelta `/donar/gracias` que concilia el pago.
- T4: webhook `/api/donaciones/webhook` + emails al donante y a los admins.
- T5: `/admin/donaciones` con totales, filtros y CSV.
- T6: botón «Donar» en el encabezado e invitación en los diálogos de publicación.
- T7: documentación de variables y del webhook.

Ruta: todo inline, sin motivo de delegación (una sola unidad de comportamiento encadenada). Riesgo: items 1 (tabla nueva con datos de pagos), 2 (webhook público con firma) y 5 (variables de despliegue).

## Log

- L1 (2026-11-10): "ahora propongo lo siguiente queremos agregar un boton para que la gente pueda donarnos, la plata iria a un mercado pago en la parte donaciones investiga en internet si se puede de alguna manera. desde el panel admin se debe de poder visualizar todas las donaciones"
- L2: "si, vamos con la opción A - haceme preguntas antes de implementar"; respuestas en S1–S8.
- L3: "tiene que existir mcp de mercado pago para que puedas configurar lo que necesites, buscalo tmb" → MCP oficial agregado y autenticado; app `57185228504296`.
- L4: Decisión: API de Preferencias por `fetch` (sin SDK nuevo). La fila de la donación se crea recién cuando existe un pago (webhook o vuelta de Checkout Pro), con nombre, mensaje y usuario tomados de `metadata` de la preferencia, que arma el servidor. Así los checkouts abandonados no ensucian la tabla.
- L5: Webhook de producción configurado por MCP: `https://reporty.com.ar/api/donaciones/webhook`, topic `payment`. Sin URL sandbox (el servidor local no es público; la vuelta a `/donar/gracias` concilia el pago).
- L6: Verificación: vitest 1576 ok, `tsc` ok, lint 0 errores. Capturas a 390 px de `/donar`, error de monto mínimo y encabezado con «Donar». Se quitó la condición por ruta del botón del encabezado porque producía un aviso de hidratación en `/donar`. En `/` y `/mapa` no hay encabezado superior, así que ahí no aparece el botón.
- L7: Pendiente: el usuario carga `MERCADOPAGO_ACCESS_TOKEN` (prueba) en `.env.development.local` para hacer un pago de punta a punta con un comprador de prueba; en producción carga access token y clave secreta del webhook en Cloudflare y aplica la migración.

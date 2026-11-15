# Reportes duplicados

Objetivo: detectar reportes parecidos al cargar uno nuevo y guiar a sumar una novedad, confirmar que es otro problema o reemplazar el propio.
Rama: `feat/reportes-duplicados` · Entrega: `ask-on-risk` · Runner: `vitest run` (`pnpm test`), más `pnpm run lint` y `npx tsc --noEmit`.

## Specs

- **S1** Regla de coincidencia: misma categoría, a 100 m o menos, estado Pendiente (los abiertos; Reparado y Rechazado quedan afuera), sin `deleted_at`. Se consulta apenas hay categoría y ubicación, y el servidor la vuelve a validar al publicar.
- **S2** Reporte de otro vecino a ≤100 m: aviso suave. «Es el mismo» publica una novedad con el select de aportes existente (`APORTES_COMUNITARIOS`, preseleccionado «El problema sigue igual») sobre el reporte existente. «Es otro problema» pide confirmación y deja seguir.
- **S3** Reporte propio a menos de 25 m: «Ya reportaste este punto». No deja publicar salvo «Reemplazar mi reporte»; ofrece agregar una novedad al existente.
- **S4** Reporte propio entre 25 y 100 m: «Es otro poste: seguir», «Es el mismo: ver mi reporte» o «Lo cargué mal: reemplazar mi reporte».
- **S5** Reemplazar: confirmación que avisa que se pierden las novedades del anterior y que no se puede deshacer; se publica el nuevo y se elimina el anterior con el flujo existente de eliminación propia (que descuenta sus puntos). Lo completado en el formulario se mantiene.
- **S6** El comentario sigue la estructura actual de selects (pedido del usuario: «el comentario debe de seguir la estructura actual de selects»).
- Supuesto: no existe un voto de «apoyo»; «sumar apoyo» = publicar el aporte elegido (+2 puntos en reporte ajeno). El motivo de «es otro problema» no se persiste (no hay columna; evitar migración).

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| T1 | S1, S3, S4 | inline | hecho | RED (módulo inexistente) → GREEN 11 tests `lib/reportes/duplicados.test.ts` |
| T2 | S1, S3, S4, S5 | inline | hecho | RED 10 fallos → GREEN `create-report.test.ts` (45) y `actions.test.ts` (36) |
| T3 | S2–S6 | inline | hecho | `components/reportes/aviso-reporte-duplicado.tsx` + `page.tsx`; e2e `e2e/reportes-duplicados.spec.ts` 3/3 ok con video |

## Log

- **L1** (2026-11-14, pedido original): «crea una rama desde main y revisa lo siguiente: hay reportes duplicados los podes ver en produccion en la calle 111, deberia de habrer una manera en la cual al momento de la carga o no se te muestre el reporte que ya hay cargado y que no te deje cargarlo, o si es otro usuario que pueda comentar de ultima, analiza la mejor experiencia de usuario y genera los diseños con claude design»
- **L2** Diagnóstico: los reportes 108, 118, 119, 120, 122 y 123 (Alumbrado, Calle 111) son del mismo usuario y están a ≤90 m. Diseños: https://claude.ai/artifact/9TiXJJ71kg3nkhmRVhY2xq
- **L3** Comentario en el diseño: «el comentario debe de seguir la estructura actual de selects».
- **L4** «y si la misma persona que publica quiere publicar nuevamente porque estaba mal o porque hay varios postes sin luz por ejemplo?» → «si, anda con la A y el reemplazar» (umbral propio de 25 m + reemplazar).
- **L5** «si, arrancá a programarlo».
- **L6** «cuando termines probalo en local con playwright podes crearte usuarios si queres y deja el video guardado en documentos/pruebas-playwright - 3 segundos entre interacciones»
- **L7** Verificación: suite completa 2823 ok; 3 fallos preexistentes en `app/mascotas/nueva/resultado-navegacion.test.ts` (también fallan en la base). `tsc` sin errores nuevos (los existentes son de `.next/types` y dos tests ajenos). El reemplazo elimina el anterior solo si la foto del nuevo no lo retiró.
- **L8** E2E local (Supabase local, `npx playwright test e2e/reportes-duplicados.spec.ts`): 3/3 ok. Videos en `~/Documentos/pruebas-playwright/duplicados-*.webm`. Se instaló el ffmpeg de Playwright para grabar.

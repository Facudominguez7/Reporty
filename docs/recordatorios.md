# Recordatorio quincenal por correo

Quien publica un reporte o una mascota perdida recibe un correo cada dos semanas mientras la
publicación siga abierta, para que revise si sigue igual o ya se resolvió.

## Regla

- **Reportes**: estado Pendiente, sin eliminar, con 14 días o más desde la creación.
- **Mascotas**: `estado = 'perdida'`, moderación aprobada, sin retirar, con 14 días o más desde
  `publicada_at`.
- Se vuelve a enviar 14 días después del último recordatorio de esa publicación.
- Se corta solo cuando el reporte pasa a Reparado o Rechazado, se elimina, o la mascota aparece
  o se retira.
- Cada persona recibe como máximo un recordatorio por día; si tiene varias publicaciones
  vencidas, salen en días sucesivos.
- Los invitados sin correo no reciben nada.

## Piezas

| Pieza | Archivo |
|---|---|
| Selección (regla de 14 días, uno por persona y día) | RPC `public.recordatorios_pendientes` en `supabase/migrations/20261113170000_recordatorios_quincenales.sql` |
| Registro del último envío | Tabla `public.recordatorios_publicacion` (solo service role) |
| Plantillas | `lib/notifications/recordatorio-templates.ts` |
| Envío por Resend | `lib/notifications/recordatorios.server.ts` |
| Endpoint | `POST /api/cron/recordatorios` con `Authorization: Bearer <AUDIT_ARCHIVE_CRON_SECRET>` |
| Cron Trigger | `0 13 * * *` (10:00 en Argentina), `lib/cloudflare/cron-recordatorios.ts` y `wrangler.jsonc` |

El envío usa una clave de idempotencia por publicación y período de 14 días, y la fecha se
registra recién después de que Resend acepta el correo: un fallo deja la publicación pendiente
para la corrida siguiente. Cada corrida envía como máximo 100 correos.

No requiere variables nuevas: usa `AUDIT_ARCHIVE_CRON_SECRET`, `RESEND_API_KEY` y
`NEXT_PUBLIC_APP_URL`, que ya existen en el Worker.

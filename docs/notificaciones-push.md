# Notificaciones push

Reporty avisa con Web Push (VAPID) en la web, la PWA y la app Android (TWA). Las push son un
complemento de los correos: salen en los mismos momentos y, si fallan, el correo y la acción
siguen igual.

## Avisos

| Tipo (interruptor en Mi cuenta) | Cuándo | A quién |
|---|---|---|
| `estado_reporte` | El reporte pasa a Reparado o Rechazado, o se le asigna una cuadrilla por primera vez | Dueño del reporte |
| `comentarios` | Alguien que no es el dueño comenta el reporte | Dueño del reporte |
| `mascotas` | La mascota publicada figura como encontrada (después de confirmar el correo) | Quien la publicó |
| `moderacion` | Foto en revisión manual o reporte que llega al umbral de votos «No existe» | Administradores |

Las push no se pueden prender sin permiso: el navegador o Android lo exigen. Por eso se ofrecen
solas a toda cuenta registrada que todavía no las activó en ese dispositivo:

- **Aviso automático** fijo abajo, en todas las páginas (`AvisoPushAutomatico` en el layout
  raíz). No aparece en `/reportes/nuevo`, que tiene su propia invitación después de publicar.
- **«Ahora no»** (o la cruz) lo esconde 14 días en ese navegador; después se vuelve a ofrecer.
- El diálogo del sistema se abre recién al tocar «Sí, avisame»: pedirlo sin un toque no funciona
  en Firefox ni Safari, y en Chrome un «Bloquear» queda para siempre.
- También se activan o desactivan desde «Mi cuenta → Notificaciones».

Al activarlas, todos los tipos quedan prendidos; los interruptores sirven para apagar alguno.
Los invitados no reciben push.

## Piezas

| Pieza | Archivo |
|---|---|
| Tablas privadas (solo service role, cascada al borrar la cuenta) | `supabase/migrations/20261114203000_notificaciones_push.sql` |
| Consultas | `database/queries/push/suscripciones.ts` |
| Envío (VAPID + aes128gcm, corte a los 8 s, borra suscripciones 404/410) | `lib/push/enviar.server.ts` |
| Un aviso por función | `lib/push/avisos.server.ts` |
| Server actions de Mi cuenta | `app/cuenta/push-actions.ts` |
| Suscripción en el navegador | `lib/push/cliente.ts` |
| Mostrar y abrir la notificación (solo URLs del mismo origen) | `public/sw.js` |

## Variables de entorno

| Variable | Tipo | Valor |
|---|---|---|
| `VAPID_PUBLIC_KEY` | variable | Clave pública (65 bytes, base64url). El navegador la recibe en tiempo de ejecución, no hace falta `NEXT_PUBLIC_`. |
| `VAPID_PRIVATE_KEY` | **secreto** | Clave privada (32 bytes, base64url). Nunca en el repo ni con `NEXT_PUBLIC_`. |
| `VAPID_SUBJECT` | variable, opcional | Contacto para los servicios push. Por defecto `mailto:contacto@reporty.com.ar`. |

Sin `VAPID_PUBLIC_KEY` o `VAPID_PRIVATE_KEY` las push quedan apagadas: la sección de Mi cuenta
y la invitación no se muestran y no se consulta la base.

## Generar y cargar las claves

```bash
# 1. Generar el par fuera del repo. La privada se guarda con permisos 600 y no se imprime.
node scripts/push/generar-claves-vapid.mjs ~/.config/reporty/vapid

# 2. Cargarlas en el Worker de producción, leyendo desde los archivos.
npx wrangler login
npx wrangler secret put VAPID_PRIVATE_KEY < ~/.config/reporty/vapid/VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY < ~/.config/reporty/vapid/VAPID_PUBLIC_KEY
```

Guardá una copia de las dos claves en un lugar seguro. **No las rotes sin necesidad**: con
claves nuevas, todas las suscripciones existentes dejan de funcionar y cada persona tiene que
volver a activar las notificaciones.

Para probar en local, copiá las dos variables a `.env.local`. El service worker solo se registra
en producción, así que la suscripción real se prueba con `pnpm run build && pnpm run start` o
desde el sitio publicado.

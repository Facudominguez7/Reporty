# Cloudflare Turnstile en Reporty (issue #188)

Turnstile (plan gratuito, modo Managed) separa a las personas de los scripts en las
operaciones que crean cuentas, sesiones o contenido. La autorización, la RLS y los límites de
frecuencia siguen funcionando igual: el CAPTCHA es una capa más, no los reemplaza.

## Qué protege y quién verifica cada token

| Operación | Dónde | Verifica |
|---|---|---|
| Ingreso con correo y contraseña | `app/auth/actions.ts` (`signInWithPassword`) | Supabase Auth (`captchaToken`) |
| Registro | `app/auth/actions.ts` (`signUp`) | Supabase Auth |
| Ingreso como invitado | `app/auth/page.tsx` y `app/reportes/nuevo/page.tsx` (`signInAnonymously`, desde el navegador) | Supabase Auth |
| Recuperación de contraseña | `app/auth/actions.ts` (`resetPasswordForEmail`) | Supabase Auth |
| Creación de reportes (registrados e invitados) | `app/reportes/nuevo/actions.ts`, action `crear_reporte` | Servidor de Reporty con Siteverify |
| Comentarios | `app/reportes/[id]/actions.ts`, action `comentar_reporte` | Servidor de Reporty con Siteverify |

Cada token se usa una sola vez. Un invitado consume un token al abrir su sesión anónima y el
reporte pide otro; Cloudflare suele resolver ese segundo challenge sin interacción.

La verificación del servidor (`lib/security/turnstile.server.ts`) usa el endpoint oficial,
valida formato y longitud del token, exige `success`, el hostname permitido y la action, tiene
un timeout de 10 s y falla cerrada ante cualquier error. Nunca registra tokens ni claves.

### Excluidos a propósito

- **Votos**: ya tienen un voto por persona y reporte, una RPC exclusiva del service role y los
  inserts directos revocados. Un CAPTCHA por voto agregaría fricción sin ganancia real.
- **Vincular el correo de un invitado** (`updateUser`): el SDK no acepta `captchaToken` en esa
  llamada y requiere una sesión existente.
- **Google OAuth**: el proveedor ya hace su propia protección.
- **Operaciones administrativas**: requieren rol de administrador u operador.
- **Navegación y consultas públicas**: nunca muestran un challenge.

## Variables de entorno

| Variable | Dónde | Valor en producción |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Pública; se incrusta en el build | Site key del widget |
| `TURNSTILE_SECRET_KEY` | Solo servidor | Secret key del widget |
| `TURNSTILE_ALLOWED_HOSTNAMES` | Solo servidor | `reporty.com.ar` (nunca `localhost`) |
| `TURNSTILE_SITEVERIFY_URL` | Solo E2E | Vacía. Cualquier valor que no sea loopback bloquea todas las verificaciones |

En producción (`NODE_ENV=production`) las tres primeras son obligatorias: si falta alguna, los
formularios protegidos muestran «La verificación de seguridad no está disponible…» y no
envían nada. Producción también rechaza las claves de prueba de Cloudflare.

Claves de prueba oficiales para desarrollo:

- Site key `1x00000000000000000000AA` y secret `1x0000000000000000000000000000000AA`: siempre aprueban.
- Con esas claves Siteverify responde `hostname: "example.com"` y sin action, así que en
  desarrollo `TURNSTILE_ALLOWED_HOSTNAMES=example.com`. La action solo se omite fuera de
  producción, con secreto de prueba y con la marca `result_with_testing_key` de Cloudflare.

## Crear el widget gratuito en Cloudflare

1. Entrá al panel de Cloudflare → **Turnstile** → **Add widget**.
2. Nombre: `Reporty`. Hostname: `reporty.com.ar` (el sitio redirige `www` al dominio sin
   `www`, así que alcanza con ese).
3. Widget mode: **Managed**. Pre-clearance: no.
4. Guardá y copiá la **Site Key** y la **Secret Key**. La secret key no va al repositorio ni a
   ninguna variable `NEXT_PUBLIC_*`.

## Configurar el CAPTCHA de Supabase Auth

En el panel de Supabase: **Authentication → Attack Protection → Enable CAPTCHA protection**,
proveedor **Turnstile**, y pegá la misma **Secret Key**.

Esa opción es global: desde que se activa, login, registro, ingreso como invitado y
recuperación de contraseña exigen un token válido. Por eso va **después** del despliegue.

## Despliegue en Hostinger (orden recomendado)

1. Cargá las tres variables de producción en la configuración de entorno de la app Node.js.
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` tiene que existir cuando se construye la app; si cambia,
   hay que reconstruir.
2. Desplegá. Con Supabase CAPTCHA todavía apagado, Auth ignora los tokens y el servidor ya
   verifica reportes y comentarios.
3. Probá en `https://reporty.com.ar`: ingreso, registro, invitado, recuperación, crear un
   reporte y comentar.
4. Recién entonces activá el CAPTCHA de Supabase y repetí esas pruebas.

No hay una Content Security Policy configurada (ni en `next.config.mjs` ni en el proxy). Si se
agrega una, tiene que permitir `https://challenges.cloudflare.com` en `script-src` y `frame-src`.

## Pruebas

- Unitarias (Vitest): `lib/security/turnstile.server.test.ts`, `tests/auth/turnstile-widget.test.ts`,
  `tests/reportes/turnstile-report.test.ts`, `app/auth/signup-login.test.ts`,
  `app/reportes/nuevo/actions.test.ts` y `app/reportes/[id]/actions.test.ts`.
- E2E (Playwright): build de producción con la site key de prueba y un Siteverify falso en
  `e2e/support/fake-siteverify.mjs` (puerto 3198). Puede rechazar la próxima verificación y
  cambiar la action devuelta (`e2e/support/siteverify.ts`). Nunca se resuelven challenges reales.

## Riesgos pendientes

- La protección de Auth depende de activar el CAPTCHA en Supabase; hasta entonces, solo los
  reportes y los comentarios quedan verificados por el servidor.
- Si el script de Cloudflare no carga (bloqueadores, red), los formularios protegidos muestran
  «No pudimos cargar la verificación de seguridad…» y no se pueden enviar.
- Siteverify no recibe la IP del cliente (`remoteip` es opcional). Agregarla solo tiene sentido
  si se confirma una cabecera de IP confiable detrás del CDN de Hostinger.

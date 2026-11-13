# Cloudflare Turnstile en Reporty (issue #188)

Turnstile (plan gratuito, modo Managed) separa a las personas de los scripts en las
operaciones de autenticación: registro, inicio de sesión e ingreso como invitado. La autorización, la RLS y los límites de
frecuencia siguen funcionando igual: el CAPTCHA es una ## Qué protege y quién verifica cada token

| Operación | Dónde | Verifica |
|---|---|---|
| Ingreso con correo y contraseña | `app/auth/actions.ts` (`signInWithPassword`) | Supabase Auth (`captchaToken`) |
| Registro | `app/auth/actions.ts` (`signUp`) | Supabase Auth |
| Ingreso como invitado | `app/auth/page.tsx` y `app/reportes/nuevo/page.tsx` (`signInAnonymously`, desde el navegador) | Supabase Auth |
| Recuperación de contraseña | `app/auth/actions.ts` (`resetPasswordForEmail`) | Supabase Auth |

Reporty no verifica tokens en su propio servidor: no existe ninguna llamada a Siteverify.
La recuperación de contraseña sigue mostrando el challenge porque el CAPTCHA de Supabase Auth
es global: con la protección activa, Supabase rechaza `resetPasswordForEmail` sin token.

En `/reportes/nuevo` el challenge solo aparece para quien no tiene sesión: el token abre la
sesión de invitado y el reporte se envía sin verificación adicional. Una persona con sesión
(registrada o invitada) nunca ve el challenge.

### Sin CAPTCHA a propósito

- **Creación de reportes, comentarios y evidencia de reparación**: dependen de la sesión, de
  los roles, de la moderación y de los límites de frecuencia existentes.
- **Votos**: un voto por persona y reporte, con RPC exclusiva del service role.
- **Vincular el correo de un invitado** (`updateUser`): el SDK no acepta `captchaToken` en esa
  llamada y requiere una sesión existente.
- **Google OAuth**: el proveedor ya hace su propia protección.
- **Operaciones administrativas**: requieren rol de administrador u operador.
- **Navegación y consultas públicas**: nunca muestran un challenge.

## Variables de entorno

| Variable | Dónde | Valor en producción |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Pública; se incrusta en el build | Site key del widget |

La secret key se carga solo en Supabase (ver abajo); la app ya no la necesita. En producción
sin site key, los formularios de autenticación muestran «La verificación de seguridad no está
disponible…» y no envían nada.

Site key de prueba oficial para desarrollo: `1x00000000000000000000AA` (siempre aprueba).

testing_key` de Cloudflare.

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

## Pruebas

- Unitarias (Vitest): `tests/auth/turnstile-widget.test.ts`, `tests/reportes/turnstile-report.test.ts`,
  `app/auth/signup-login.test.ts`, `app/reportes/nuevo/actions.test.ts` y
  `app/reportes/[id]/actions.test.ts`.
- E2E (Playwright): build de producción con la site key de prueba oficial; Supabase local no
  exige CAPTCHA, así que nunca se resuelven challenges reales.

## Riesgos pendientes

- La protección depende de tener activo el CAPTCHA en Supabase.
- Si el script de Cloudflare no carga (bloqueadores, red), los formularios de autenticación
  muestran «No pudimos cargar la verificación de seguridad…» y no se pueden enviar.

No hay una Content Security Policy configurada. Si se agrega una, tiene que permitir
`https://challenges.cloudflare.com` en `script-src` y `frame-src`.

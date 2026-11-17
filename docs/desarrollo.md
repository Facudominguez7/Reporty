# Desarrollo local

Guía interna para los titulares del proyecto. El código no está licenciado para uso de terceros (ver [`LICENSE`](../LICENSE)).

## Prerrequisitos

- Node.js y pnpm (la versión de pnpm está fijada en `packageManager` de `package.json`)
- Cuenta en Supabase
- Cuenta en Resend (para emails)

## Pasos

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/Facudominguez7/Reporty.git
   cd Reporty
   ```

2. **Instalar dependencias**
   ```bash
   pnpm install
   ```

3. **Configurar variables de entorno**
   Crear `.env.local` con tus credenciales (git lo ignora; `pnpm run db:setup` genera además `.env.development.local` para el Supabase local):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=tu_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key   # secreto: solo servidor
   RESEND_API_KEY=tu_resend_api_key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   # Notificaciones push (ver docs/notificaciones-push.md). Opcional: sin estas
   # variables las push quedan apagadas. La privada nunca con NEXT_PUBLIC_.
   VAPID_PUBLIC_KEY=
   VAPID_PRIVATE_KEY=
   # Archivo histórico de auditoría en Cloudflare R2 (ver docs/auditoria-archivo-r2.md).
   # Opcional en desarrollo: sin estas variables el panel funciona y solo queda
   # deshabilitado el archivado. Nunca uses NEXT_PUBLIC_ para estos valores.
   R2_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET_NAME=reporty-audit-archive
   AUDIT_ARCHIVE_CRON_SECRET=
   AUDIT_HOT_DAYS=180
   # Cloudflare Turnstile (ver docs/turnstile.md). Site key de prueba oficial para desarrollo:
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
   # Donaciones con Mercado Pago (ver docs/donaciones.md). En desarrollo, credenciales de prueba.
   # Nunca uses NEXT_PUBLIC_ para estos valores.
   MERCADOPAGO_ACCESS_TOKEN=
   MERCADOPAGO_WEBHOOK_SECRET=
   # Opcional: habilita la gestión de cuadrillas (desactivada si no se define)
   CUADRILLAS_ENABLED=true
   # Opcional: ID de medición de Google Analytics 4 (G-XXXXXXXXXX).
   # Definilo solo en producción para no medir dev ni previews.
   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
   ```

   La gestión de cuadrillas está desactivada en producción. `CUADRILLAS_ENABLED` se lee en el servidor mientras la app corre: para activarla basta con definirla en `true` y reiniciar, sin volver a compilar.

4. **Iniciar servidor de desarrollo**
   ```bash
   pnpm run dev
   ```

5. Abrir [http://localhost:3000](http://localhost:3000)

## Pruebas

- **Unitarias:** `pnpm test` (Vitest).
- **De punta a punta:** `pnpm run test:e2e` (Playwright). Recorren los flujos principales en una build de producción contra el Supabase local, nunca contra producción:
  1. Levantar Supabase local con `pnpm run db:start` (ver `supabase/README.md`).
  2. Ejecutar `pnpm run test:e2e`. La primera vez compila la app y la sirve en el puerto 3100; los correos de autenticación quedan en el Mailpit del Supabase local y los de notificación en un Resend falso del puerto 3199, así que no se envía ningún correo real. Turnstile corre de verdad con la site key de prueba oficial en los formularios de autenticación. La limpieza de datos necesita `psql` en el PATH.
  3. Para ver el navegador mientras corren: `E2E_HEADED=1 pnpm run test:e2e`.

  Usan el Google Chrome instalado (no descargan navegadores). Cada prueba borra los usuarios, reportes y fotos que creó, aunque falle. Si una prueba falla, su traza queda en `test-results/` y se abre con `npx playwright show-trace <ruta>/trace.zip`.
- **De carga:** `pnpm run test:load` (k6 en Docker, sin dependencias npm). Recorre `/`, `/mapa`, `/reportes`, el detalle de un reporte y `/sitemap.xml` con usuarios concurrentes. Corre solo contra una build de producción local con el Supabase local; **nunca apuntes una prueba de carga a producción**.
  1. Levantar Supabase local con `pnpm run db:start`. Para que el detalle tenga un reporte, la base local necesita datos (`pnpm run db:setup`).
  2. Ejecutar `pnpm run test:load`. Compila la app, la sirve en el puerto 3100 (si el puerto está ocupado, corta sin probar nada) y corre `scripts/carga/paginas-publicas.js` con la imagen `grafana/k6`.
  3. Por defecto sube a 20 usuarios virtuales y los mantiene 1 minuto; se cambia con `USUARIOS=50 DURACION=2m pnpm run test:load`.

  Falla (código 99) si más del 1 % de los pedidos da error o si el p95 de alguna página supera los 2 s. El resumen queda en `test-results/carga/resumen.json`.

## Despliegue

La app corre en Cloudflare Workers con OpenNext. Workers Builds despliega `main` automáticamente; el despliegue manual es `pnpm run deploy`.

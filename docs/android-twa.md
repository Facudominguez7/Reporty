# Reporty como app Android (TWA + Bubblewrap)

Cómo Reporty se empaqueta como aplicación Android sin abandonar Next.js, Supabase ni Cloudflare Workers.

## Arquitectura

```text
Google Play Store
       |
       v
Reporty Android (TWA, package ar.com.reporty.app)
       |
       v
https://reporty.com.ar
       |
       v
Cloudflare Workers (OpenNext)
       |
       +-- Supabase Auth / PostgreSQL
       +-- Cloudflare Images / R2
       +-- Turnstile
       +-- Leaflet, GPS, cámara vía controles web
```

- La app Android es una **Trusted Web Activity** que abre `https://reporty.com.ar/mapa`.
- Las actualizaciones web se despliegan normalmente y se reflejan en la app sin recompilar el APK/AAB.
- Sin Capacitor, sin WebView propio, sin duplicar el frontend.

## Requisitos de instalación

| Herramienta | Versión usada | Fuente oficial |
|---|---|---|
| Node.js | v24.x | nodejs.org |
| pnpm | fijado por `packageManager` en `package.json` | pnpm.io |
| Bubblewrap CLI | `@bubblewrap/cli` (npm) | npmjs.com/package/@bubblewrap/cli |
| OpenJDK | **17 LTS** (Temurin) | adoptium.net |
| Android SDK | cmdline-tools + platform 36 + build-tools 36.0.0 | dl.google.com |

> Bubblewrap exige JDK 17 exacto; otras partes del repo (TypeScript/Next) no dependen de Java.

### Instalación de Bubblewrap

```bash
npm install -g @bubblewrap/cli
bubblewrap --version
```

En `~/.bubblewrap/config.json` (Bubblewrap lo crea si lo dejás autogestionar JDK/SDK):

```json
{
  "jdkPath": "/ruta/a/jdk17",
  "androidSdkPath": "/ruta/a/android-sdk"
}
```

Verificá con `bubblewrap doctor`.

> Nota: si tu SDK es moderno (cmdline-tools bajo `cmdline-tools/latest`), Bubblewrap espera
> `tools/` o `bin/` en la raíz. `ln -s $SDK/cmdline-tools/latest/bin $SDK/bin` lo resuelve.

## Generación del proyecto Android

El proyecto vive en `android/twa/` con su manifiesto en `android/twa/twa-manifest.json`.

Para regenerar el proyecto completo a partir del manifiesto:

```bash
cd android/twa
bubblewrap update --skipVersionUpgrade
```

Para actualizar tras cambiar íconos, nombre o versión:

```bash
cd android/twa
bubblewrap update
# o incrementar versión manualmente en twa-manifest.json (appVersionCode / appVersionName)
```

Configuración vigente:

- Package: `ar.com.reporty.app` — **a confirmar antes de la primera publicación** (no se puede cambiar después en Play).
- Host: `reporty.com.ar`, start URL `/mapa`.
- `targetSdkVersion` 36 / `minSdkVersion` 23 (AGP 8.9.1, Gradle 8.11.1).
- Orientación por defecto (adaptable).
- Delegación de geolocalización habilitada (`features.locationDelegation.enabled: true`): los prompts de ubicación del navegador web se traducen a permisos Android dentro de la TWA.
- Shortcuts de app: Mapa, Reportes, Crear reporte.

## Compilación de APK y AAB

```bash
cd android/twa

# APK debug para pruebas locales (no firmado para distribución)
bubblewrap build --skipPwaValidation

# Android App Bundle para Google Play (requiere keystore configurado)
bubblewrap build --skipPwaValidation --manifest twa-manifest.json
# produce: app-release-bundle.aab
```

El primer `build` descarga Gradle y dependencias; requiere JDK 17 y Android SDK configurados.

## Firma y certificados

Tres certificados distintos, no confundirlos:

| Certificado | Uso | Dónde vive |
|---|---|---|
| Upload key (local) | Firmar el AAB que subís a Play | `android/twa-config/*.jks` (fuera del repo) |
| App Signing Key (Google) | Firma de distribución que aplica Play automáticamente | Solo en Play Console |
| Debug key | Instalación local durante desarrollo | `~/.android/debug.keystore` |

Generación de la upload key (una sola vez, guardar en un gestor de secretos):

```bash
keytool -genkeypair -v \
  -keystore android/twa-config/reporty-upload-key.jks \
  -alias reporty -keyalg RSA -keysize 2048 -validity 10000
```

En CI el workflow genera un keystore efímero solo para verificar que compila; nunca se firma producción con credenciales ficticias.

## Digital Asset Links

Para que la TWA corra sin barra de URL, `https://reporty.com.ar/.well-known/assetlinks.json` debe declarar la relación con el paquete Android y la huella SHA-256 real del certificado.

**Nunca publicar huellas ficticias.** El archivo se genera con:

```bash
# Desde la upload key local:
node scripts/android-twa/generar-assetlinks.mjs \
  --keystore android/twa-config/reporty-upload-key.jks --alias reporty

# Desde las huellas de Play Console (Configuración → Firma de apps → Certificado de firma de la app):
node scripts/android-twa/generar-assetlinks.mjs --huella AA:BB:... --huella CC:DD:...
```

La plantilla documentada está en `android/twa-config/assetlinks-plantilla.json` (fuera de `public/`).

Verificación posterior al deploy:

```bash
curl -s https://reporty.com.ar/.well-known/assetlinks.json | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)))"
```

Debe responder HTTP 200 con JSON válido y sin redirecciones. **No declarar la asociación verificada hasta comprobarla** (se puede probar con `bubblewrap fingerprint` o abriendo la app en un dispositivo con `adb shell pm verify-app-links --re-verify <pkg>`).

## Permisos

- **Ubicación:** delegada al navegador de la TWA vía `locationDelegation`. `buscarUbicacionPrecisa()` sigue funcionando sin cambios: el prompt web de geolocalización se traduce a un permiso Android.
- **Cámara/fotos:** el flujo web actual (selector de imágenes del sistema) funciona en la TWA sin permisos Android adicionales. No se agregan `RECORD_AUDIO`, `CAMERA` ni nada que el flujo web no necesite.
- **Notificaciones:** deshabilitadas en el manifiesto TWA por ahora (`enableNotifications: false`).

## Pruebas con Android físico

```bash
# Con el dispositivo en modo desarrollador y depuración USB:
cd android/twa
bubblewrap build --skipPwaValidation
adb install app-release-signed.apk   # o el APK debug
adb logcat | grep -i twa
```

Verificar en el dispositivo: mapa Leaflet, GPS de alta precisión, selector de fotos, login (email + Google OAuth), Turnstile, Mercado Pago (donaciones), back button, enlaces compartidos desde WhatsApp.

## Publicación futura en Google Play

1. Confirmar el package ID `ar.com.reporty.app` (definitivo tras la primera subida).
2. Crear la app en Play Console y habilitar **Play App Signing**.
3. Subir el AAB firmado con la upload key.
4. Copiar la huella SHA-256 del App Signing Key y regenerar `assetlinks.json` con ambas huellas (upload + App Signing).
5. Completar: Data Safety, declaración de permisos de ubicación, política de contenido generado por usuarios (reportes, fotos, comentarios con moderación existente), método de eliminación de cuenta (hoy por email; documentado en la política de privacidad), enlaces a términos y privacidad, y declaración de donaciones vía Mercado Pago.
6. **No automatizar publicación en esta etapa.**

## Actualización del proyecto Android

Las actualizaciones web se reflejan sin recompilar. Solo se recompila si cambiás:

- Íconos, nombre, colores del splash.
- Versión (`appVersionCode`/`appVersionName`).
- Configuración de features (locationDelegation, billing, etc.).

```bash
cd android/twa
# editar twa-manifest.json (incrementar appVersionCode)
bubblewrap update
bubblewrap build
```

## Relación con Cloudflare Workers

- La TWA no cambia el worker: `custom-worker.ts` sigue sirviendo la app OpenNext tal cual.
- `public/.well-known/assetlinks.json` se sirve como asset estático (HTTP 200, JSON puro, sin redirect).
- El Service Worker (`public/sw.js`) solo cachea estáticos con hash (`/_next/static/`, favicon, mapas); APIs, Server Actions y respuestas de sesión nunca se cachean.

## Problemas conocidos

- Bubblewrap exige **JDK 17 exacto**; si usás otro, `bubblewrap doctor` falla.
- Si el SDK no tiene `tools/` o `bin/` en la raíz, Bubblewrap no lo reconoce (ver symlink en Requisitos).
- Si se ejecuta `bubblewrap init` sin conexión al manifiesto en producción, puede descargar íconos 404: usar URLs de producción reales o un servidor local con los archivos presentes.
- Los shortcuts del manifiesto web requieren `icons` con `src`, `sizes` y `type` para que Bubblewrap los genere como shortcuts Android.

## Limitaciones

- Sin modo offline para crear reportes: la pantalla `offline.html` solo avisa que no hay conexión.
- Notificaciones push nativas no habilitadas en esta etapa.
- La verificación de Digital Asset Links requiere el dominio en producción y el certificado real.

## Preparación para iOS futuro

La arquitectura elegida no duplica frontend ni backend. Para una app iOS futura:

- Misma PWA puede empaquetarse con **App Clips** o un wrapper mínimo compatible con App Store (no TWA: Apple no soporta DAL; la verificación se hace con `apple-app-site-association`).
- Reutilizar íconos, manifiesto y pantalla offline ya preparados.
- Ningún cambio de Cloudflare/Supabase acoplado a Android: los cambios de esta rama son solo capas de empaquetado.

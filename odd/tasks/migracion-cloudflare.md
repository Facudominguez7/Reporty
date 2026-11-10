# Migración de Reporty a Cloudflare Workers
Objetivo: sacar la app Next.js del hosting compartido de Hostinger (origen saturado: picos de 5 a 60 s aun en endpoints sin trabajo) y servirla desde Cloudflare Workers con OpenNext, con deploy automático desde el repo de GitHub. Base: `02441fc`. Rama: `feat/migracion-cloudflare`; entrega: commits por unidad de trabajo, push/PR/merge y corte de DNS son decisión del dueño.
Checks: `pnpm test` (Vitest), `pnpm run lint`, `pnpm exec tsc --noEmit`, build de OpenNext + `wrangler dev` local, y las mediciones de Playwright/curl de la sesión del 2026-11-09 contra producción después del corte.

## Specs

S1. Migración (L1): «vamos a migrar esto a cloudflare urgente, junto a la vinculacion con el repo todo». La app corre en Cloudflare Workers con `@opennextjs/cloudflare`, y Workers Builds queda vinculado a `Facudominguez7/Reporty`, rama `main`, con deploy automático.

S2. Prefetch (L1): «esto del prefetch vamos a sacarlo antes». Decisión del 2026-11-09: revertirlo. #223 se revierte en #225 y #224 se cierra sin mergear (hecho).

S3. Next compatible: `@opennextjs/cloudflare@1.20.16` pide `next >=16.4.5`; producción corre la 16.4.3. Hay que actualizar Next a 16.4.6 sin romper tests ni tipos.

S4. Fotos sin `sharp` (decisión del 2026-11-09: «Cloudflare Images (Recomendado)»): `prepararImagenReporte` usa `sharp`, que no corre en Workers. Se reemplaza por el binding `IMAGES` de Cloudflare Images y se mantienen las mismas garantías: tamaño máximo, tipos aceptados, una sola página o cuadro, dimensiones máximas, salida WebP sin metadatos, miniatura y límite de bytes. Lo usan los reportes, la evidencia de reparación y las mascotas.

S5. Configuración: `wrangler.jsonc`, `open-next.config.ts` y caché incremental para `unstable_cache`. Las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` y la de Google Analytics van en build; `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, los `R2_*` y el secreto del cron van como secrets. Ningún secreto se commitea.

S6. Cron del archivo de auditoría: hoy lo dispara el cron de Hostinger con `~/reporty-audit-cron.sh` contra `/api/cron/auditoria-archivo`. Tiene que seguir funcionando después del corte, con un Cron Trigger de Cloudflare o apuntando al nuevo origen.

S7. Corte de DNS de `reporty.com.ar` sin romper el correo ni `notificaciones.reporty.com.ar` (sigue en Hostinger), con rollback documentado. Requiere confirmación explícita del dueño antes de tocar DNS.

S8. Verificación: volver a medir producción con los mismos scripts (requests por visita, 5 y 10 concurrentes, robots.txt sin caché) y comparar con las mediciones de Hostinger.

## Tasks

- T1 [S3] Actualizar Next a 16.4.6 — inline — hecho (tsc OK, lint 0 errores, vitest 1473 OK). Risk: item 5 (dependencias).
- T2 [S4] Reemplazar `sharp` por el binding `IMAGES` en `prepararImagenReporte` — inline — hecho `7236b49` + corrección (RED→GREEN); verificación independiente: sin bloqueantes. Risk: item 2 (guarda de seguridad sobre imágenes subidas).
- T3 [S5] Adaptador OpenNext, `wrangler.jsonc`, caché, scripts y verificación con `wrangler dev` — inline — base hecha `6671d92`; falta la caché incremental en R2 (necesita la cuenta, T5). Risk: item 5.
- T4 [S6] Cron del archivo de auditoría en Cloudflare — inline — hecho (custom-worker.ts + Cron Trigger `0 6 * * 0`); falta borrar el cron de Hostinger en el corte (T6).
- T5 [S1, S5] Crear el Worker, cargar secrets y vincular Workers Builds con el repo (requiere autenticar los MCP de Cloudflare) — inline — bloqueada por el dueño.
- T6 [S7] Corte de DNS con rollback — inline — bloqueada por la confirmación del dueño.
- T7 [S8] Medición post-migración — inline — pendiente.

Ruta: todo inline. No hay unidades paralelas independientes de varios minutos: T2 y T3 comparten el build.

## Log

L1 (2026-11-09, verbatim): «vamos a migrar esto a cloudflare urgente, junto a la vinculacion con el repo todo. esto del prefetch vamos a sacarlo antes»
L2 (2026-11-09): aclaración de «sacarlo antes»: revertirlo. #225 abierto con el revert de #223 y #224 cerrado. También se pidió «instalate el mcp de cloudflare»: se agregaron `cloudflare`, `cloudflare-builds`, `cloudflare-observability` y `cloudflare-docs` (los tres primeros requieren `/mcp` para autenticar).
L3 (2026-11-09): para reemplazar `sharp` se eligió «Cloudflare Images (Recomendado)». Evidencia: `npm view @opennextjs/cloudflare` da peer `next: '>=15.5.29 <16 || >=16.4.5'`; producción tiene 16.4.3. Una app Next de este tamaño probablemente requiere el plan pago de Workers (límites de 3 MB de bundle y 10 ms de CPU en el plan gratis).
L4 (2026-11-09): T2: APNG pasaba con sharp (solo se chequeaban páginas de WebP); ahora se rechaza. sharp quedó como devDependency, solo para los tests, mediante el doble inyectado en `vitest.setup.ts`. Bundle del Worker: 2,84 MB gzip (antes 2,90 MB). `wrangler dev` (workerd): /, /mapa, /reportes, /reportes/85, /comunidad, /auth y /crear devuelven 200 con datos reales; /reportes/nuevo, /admin y /dashboard sin sesión devuelven 307 a /auth. Advertencia de OpenNext: el soporte del middleware Node (`proxy.ts`) es experimental en Cloudflare.
L5 (2026-11-09): T4: el cron de Hostinger es `0 6 * * 0` (uid w8GJEVvYpf) y se replicó. No se disparó el handler programado en local porque `.env.local` apunta a la base de producción y haría una corrida real. Hallazgo: la misma cuenta de Hostinger corre `torneosmitai.com` con `queue:work` cada minuto (hasta 50 s), que compite por la CPU y los procesos de la cuenta compartida.
L6 (2026-11-09): verificación independiente de T2: sin bloqueantes, cinco advertencias. Corregida la regresión: los chequeos rechazaban fotos legítimas con datos después de EOI o IEND y WebP/PNG cuyos metadatos contienen "ANIM" o "acTL". Ahora se recorren los chunks PNG y RIFF y en JPEG se busca FFD9 después de FFDA. Al repetir las sondas, todos los casos legítimos pasan. Riesgo aceptado: un archivo truncado con el marcador de fin re-pegado o un WebP con los chunks de animación renombrados pasan el chequeo estructural, y su rechazo depende del decodificador de Cloudflare. Como el binding recodifica todo, no se guardan bytes ni metadatos del atacante. El doble sharp de los tests (`failOn: warning`) es más estricto que el binding real. Costo: cada foto hace 1 info y hasta 8 output contra Images.
L7 (2026-11-09): MCP de Cloudflare autenticados (cuenta reporty1901, account b03bf300c1b4dc37f98b061084165903). La zona `reporty.com.ar` existe en estado `pending` (plan Free, NS anuj/fay.ns.cloudflare.com; el dominio sigue con NS de Hostinger). No hay Workers ni subdominio workers.dev; ya existen los buckets R2 `reporty-audit-archive` y `reporty-audit-archive-pruebas`. Workers Builds: `config_autofill` del repo (owner 129807018, repo 1047218099) devuelve 404, es decir, la app de GitHub de Cloudflare no está conectada. Producción en Hostinger tiene 23 variables (valores enmascarados). Faltan en `.env.local`: SUPABASE_URL, SUPABASE_API_KEY, NEXT_PUBLIC_GA_ID, NEXT_PUBLIC_APP_URL, TURNSTILE_SECRET_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_ALLOWED_HOSTNAMES y NEXT_PUBLIC_CARTO_API_KEY. `R2_BUCKET_NAME` local apunta al bucket de pruebas. T5 está bloqueada por el dueño: instalar la app de GitHub, cargar los valores de producción en `.env.cloudflare` (gitignored por `.env*`), el plan pago de Workers y autorizar el push de la rama.
L8 (2026-11-09, verbatim): «por que queres que instale con npm y no con pnpm» y «vamos con pnpm, tengo que cambiar algo en cloudflare?». Corrección: `pnpm-lock.yaml` era la lockfile al día (tenía el SDK de AWS) y `package-lock.json` la vieja; el mensaje del commit `9c33de2` («quedarse con npm») es incorrecto y lo revierte el commit siguiente. Se fija `"packageManager": "pnpm@12.16.1"`: Workers Builds usaba pnpm 9.10.0 por defecto y falló con «packages field missing or empty» (el build de `main`, que todavía no tiene la configuración). Por la política `minimumReleaseAge` de 24 h se fijan Next 16.4.5 (la 16.4.6 se publicó hoy) y wrangler 4.158.0. pnpm estricto exigió declarar `@supabase/storage-js` (devDependency). Evidencia: tsc OK, lint 0 errores, Vitest 1485 OK, build de OpenNext OK, bundle 2,84 MB gzip.

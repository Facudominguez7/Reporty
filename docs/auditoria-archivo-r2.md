# Archivo histórico de auditoría en Cloudflare R2

`public.audit_events` registra la actividad de Reporty (reportes, comentarios,
votos y evidencias de reparación) y crece para siempre. Este archivo mueve los
eventos con más de 180 días a un bucket privado de Cloudflare R2 en formato
JSON Lines comprimido, y deja en PostgreSQL solo la ventana caliente que usa el
panel `/admin/auditoria`.

- Retención caliente: `AUDIT_HOT_DAYS` (180 por defecto, entre 30 y 3650).
- Histórico: objetos `.jsonl.gz` privados, consultables y descargables solo por
  un Admin autenticado, a través del servidor.
- Sin borrado automático de archivos históricos: ningún objeto de R2 se elimina.
- La política no aplica a `historial_estados`, `evidencias_reparacion`,
  `verificaciones_reparacion` ni a otras tablas de negocio.

## Arquitectura

| Pieza | Archivo |
| --- | --- |
| Configuración validada (solo servidor) | `lib/auditoria-archivo/configuracion.ts` |
| Cliente S3 de R2 | `lib/auditoria-archivo/cliente-r2.ts` |
| Formato JSONL, GZIP y SHA-256 | `lib/auditoria-archivo/serializacion.ts` |
| Rutas de objeto y validación anti-traversal | `lib/auditoria-archivo/rutas-objeto.ts` |
| Servicio de archivado | `lib/auditoria-archivo/servicio-archivado.ts` |
| Acceso real a la base y a R2 | `lib/auditoria-archivo/datos-archivado.ts` |
| Servicio de recuperación | `lib/auditoria-archivo/servicio-recuperacion.ts` |
| Ejecución programada y manual | `app/api/cron/auditoria-archivo/route.ts` |
| Descarga autorizada | `app/api/admin/auditoria/archivo/[id]/descarga/route.ts` |
| Migraciones | `supabase/migrations/20261110120000_auditoria_archivo_r2.sql`, `20261110120100_auditoria_archivo_api.sql` |
| Contrato SQL | `supabase/tests/auditoria_archivo_r2.sql` (`scripts/local-supabase/test-auditoria-archivo.sh`) |

Tablas:

- `public.audit_archives`: lote con rango de identificadores, primera y última
  fecha, cantidad, ruta del objeto, tamaño comprimido, hash SHA-256, estado
  (`reclamado → subido → verificado → origen_eliminado`, más `fallido`), fecha de
  verificación, fecha de eliminación de origen, intentos y último error acotado.
- `public.audit_archive_claims`: reclamo por `event_id` (clave primaria). Impide
  que dos corridas archiven el mismo evento y permite reanudar un lote fallido.

RPC `security definer` reservadas a `service_role` (envoltorios públicos en
`auditoria_*`): `auditoria_reclamar_lote`, `auditoria_previsualizar_lote`,
`auditoria_confirmar_subida`, `auditoria_verificar_lote`,
`auditoria_eliminar_origen`, `auditoria_fallar_lote`, `auditoria_metricas`,
`auditoria_registrar_evento`. Los triggers de captura de `audit_events` no se
modifican.

## Formato del archivo

```text
reporty-audit-archive/
  audit/v1/2026/11/audit-{primer_id}-{ultimo_id}-{hash}.jsonl.gz
```

- `{hash}` son los primeros 16 caracteres hexadecimales del SHA-256 del archivo
  comprimido: el nombre es content-addressed, así que reintentar la misma subida
  produce la misma ruta y **no** crea objetos duplicados.
- Cada línea es un evento con `version` (1), `id`, `occurred_at` (UTC), `actor_id`,
  `report_id`, `report_title` y `action`. El orden de claves es fijo para que los
  bytes sean determinísticos.
- La integridad se comprueba con el SHA-256 del archivo comprimido. **El ETag de
  R2 no se usa como checksum**: en cargas multiparte ni siquiera es el MD5 del
  contenido. Después de subir, el servicio descarga el objeto, recalcula el hash y
  cuenta los eventos antes de confirmar.

## Variables de entorno

Todas son privadas del servidor: ninguna usa el prefijo `NEXT_PUBLIC_` ni llega
al navegador.

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=reporty-audit-archive
AUDIT_ARCHIVE_CRON_SECRET=
AUDIT_HOT_DAYS=180
# Opcionales
AUDIT_ARCHIVE_MAX_BATCH=1000
AUDIT_ARCHIVE_PURGE_ENABLED=false
```

| Variable | Regla |
| --- | --- |
| `R2_ACCOUNT_ID` | 16-64 caracteres alfanuméricos; arma `https://<cuenta>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | credenciales del token de R2; nunca se registran en logs |
| `R2_BUCKET_NAME` | minúsculas, dígitos y guiones (`reporty-audit-archive`) |
| `AUDIT_ARCHIVE_CRON_SECRET` | mínimo 32 caracteres; autentica el endpoint programado |
| `AUDIT_HOT_DAYS` | 30-3650, por defecto 180 |
| `AUDIT_ARCHIVE_MAX_BATCH` | 1-5000, por defecto 1000 |
| `AUDIT_ARCHIVE_PURGE_ENABLED` | solo `true` habilita eliminar de PostgreSQL el origen ya verificado |

El archivo se configura en `.env.local` en desarrollo (git lo ignora) y en el
panel de Hostinger en producción. `.env*` está en `.gitignore`: no se versiona
ninguna plantilla.

## Cloudflare: bucket y credenciales

1. Dashboard de Cloudflare → **Storage & databases → R2 → Create bucket**.
2. Nombre `reporty-audit-archive`, **Standard** storage class, **sin** dominio
   público ni `r2.dev` habilitado: el bucket queda privado y solo se accede por
   la API S3 con credenciales.
3. **Manage API Tokens → Create API token** con permiso **Object Read & Write**
   limitado a ese bucket (permiso mínimo; no se necesita administración de bucket).
4. Guardar en producción `R2_ACCOUNT_ID` (ID de cuenta, no de token),
   `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` (se muestran una sola vez).
5. Generar `AUDIT_ARCHIVE_CRON_SECRET` con un valor aleatorio largo:
   `openssl rand -hex 32`.

La conectividad se puede comprobar con `HeadBucket` a través de
`comprobarConectividad()` (`lib/auditoria-archivo/cliente-r2.ts`) o ejecutando el
`dry-run` desde el panel.

## Puesta en marcha en producción

Orden obligatorio; no saltear pasos:

1. Aplicar las migraciones nuevas (`supabase/migrations/20261110120000_*` y
   `20261110120100_*`). Son incrementales y no tocan migraciones aplicadas.
2. Configurar las variables de entorno en Hostinger.
3. Ejecutar un `dry-run` (`GET /api/cron/auditoria-archivo` con el secreto). La
   primera ejecución puede informar **0 eventos elegibles**: es un resultado
   válido, no un error.
4. Ejecutar una corrida real con `AUDIT_ARCHIVE_PURGE_ENABLED=false` y un lote
   chico (`POST ...?limite=10`). Queda en estado `verificado` y **no** borra nada.
5. Verificar en el panel: lote listado, cantidad, tamaño comprimido, hash;
   descargar el `.jsonl.gz` desde el navegador de un Admin y abrirlo.
6. Confirmar que los eventos nuevos siguen ingresando: crear actividad normal y
   verla en `/admin/auditoria`.
7. Recién entonces poner `AUDIT_ARCHIVE_PURGE_ENABLED=true`: la corrida siguiente
   purga los lotes que ya estaban verificados y, desde ahí, archiva y purga en el
   mismo paso.
8. Programar la corrida semanal.

## Programación semanal

No hay cron en el repositorio. Las dos opciones documentadas usan el mismo
endpoint; elija una.

### Hostinger (más simple, sin extensiones de base)

Cron del panel de Hostinger, semanal (domingos 03:00):

```bash
curl --fail --silent --show-error --request POST \
  --header "Authorization: Bearer $AUDIT_ARCHIVE_CRON_SECRET" \
  "https://reporty.com.ar/api/cron/auditoria-archivo?limite=1000" \
  > /dev/null
```

### Supabase Cron + Vault (sin depender del hosting)

`pg_cron` ejecuta SQL; el HTTP lo hace `pg_net`. El secreto se guarda en Vault y
no queda escrito en ningún repositorio:

```sql
select vault.create_secret('https://reporty.com.ar', 'reporty_url');
select vault.create_secret('<AUDIT_ARCHIVE_CRON_SECRET>', 'reporty_audit_cron_secret');

select cron.schedule(
  'archivo-auditoria-semanal',
  '0 3 * * 0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reporty_url')
           || '/api/cron/auditoria-archivo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'reporty_audit_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

Esta variante **no** se aplica desde el repositorio: es una operación del dueño
en su proyecto de Supabase.

## Ejecución manual y `dry-run`

- `GET /api/cron/auditoria-archivo` con `Authorization: Bearer <secreto>`:
  simulación. Nunca reclama, sube ni borra; informa eventos elegibles, rango y
  fechas.
- `POST /api/cron/auditoria-archivo?limite=<1..5000>`: corrida real.
- Sin `Authorization` o con token incorrecto: `401`. Sin secreto configurado:
  `503` y no ejecuta nada. Si la corrida falla: `502` con el resumen.
- El panel `/admin/auditoria` tiene un botón de `dry-run` para el Admin; la
  corrida real no se expone en la interfaz porque puede superar el tiempo de una
  request.

El lote por invocación es acotado a propósito (máximo 5000 eventos): el proceso
no depende de una request larga y, si quedan eventos, la corrida siguiente los
toma.

## Panel administrativo

`/admin/auditoria` conserva la actividad reciente y agrega:

- métricas: eventos archivados, tamaño en R2, espacio liberable y elegibles;
- filtro por rango de fechas (`desde` / `hasta`);
- lista de lotes con período, cantidad, tamaño comprimido, estado, hash corto;
- **Ver eventos**: recupera y muestra el contenido del lote sin restaurarlo a
  `audit_events`;
- **Descargar**: `GET /api/admin/auditoria/archivo/<id>/descarga`, con sesión y
  rol Admin verificados en el servidor, `Content-Disposition: attachment` y
  `Cache-Control: no-store`. No existen URLs públicas ni pre-firmadas.

Cada descarga agrega una fila `audit_archive_downloaded` en `audit_events`.

## Runbook de errores

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `503` “no está configurado” | falta `AUDIT_ARCHIVE_CRON_SECRET` | configurar la variable y reiniciar el despliegue |
| `501/500` con `ErrorConfiguracionArchivo` | falta o es inválida una variable `R2_*` | revisar la tabla de variables; el nombre faltante viaja en el mensaje |
| Lote en `fallido` con `subida` | credenciales, cuota o red | corregir la causa y volver a ejecutar: los reclamos se liberaron y el lote se retoma |
| Lote en `fallido` con `integridad` | el objeto descargado no coincide | **no** se borró nada; revisar el bucket y reintentar. Si el objeto está corrupto, eliminarlo a mano en R2 y volver a ejecutar |
| Lote en `verificado` sin purgar | `AUDIT_ARCHIVE_PURGE_ENABLED=false` o la purga falló | habilitar la variable; la corrida siguiente purga sin volver a subir |
| `No hay eventos elegibles o hay otra ejecución en curso` | lock de reclamo tomado o nada vencido | normal; esperar la próxima corrida |
| Error de `GZIP` al recuperar | objeto manipulado o truncado | el lote no se muestra: revisar el objeto en R2 y el hash registrado |

Reanudación: cualquier corrida siguiente retoma el trabajo. Un lote `fallido`
libera sus reclamos; un lote `verificado` conserva los reclamos (los eventos no
se pueden reclamar dos veces) y se purga cuando la purga esté habilitada.

Recuperación de datos históricos: desde el panel (**Ver eventos** / **Descargar**)
o descargando el objeto con la API S3 y `gunzip`. Los registros **no** se
restauran a `audit_events`; la tabla caliente solo recibe actividad nueva.

## Métricas y monitoreo

`public.auditoria_metricas(180)` devuelve `lotes`, `lotes_fallidos`,
`lotes_pendientes_purga`, `eventos_archivados`, `eventos_purgados`, `bytes_en_r2`,
`elegibles`, `eventos_en_postgres` y `espacio_tabla_bytes`. El panel las muestra y
el resumen de cada corrida las acompaña con `duracionMs`, `purgado` y `errores`.

## Cuotas y costos

R2 tiene un plan gratuito de 10 GB-mes de almacenamiento, 1 millón de operaciones
Class A y 10 millones de Class B por mes, sin costo de egreso
(<https://developers.cloudflare.com/r2/pricing/>). Con 21 eventos y 48 KB de
partida, y un archivo semanal acotado a 1000 eventos, el consumo queda muy lejos
de esos límites. El plan de Supabase no cambia: el archivado reduce filas.

## Riesgos y limitaciones

- `audit_events` no tiene trigger de `DELETE`/`UPDATE`: la purga elimina filas
  verificadas y no deja rastro en la propia tabla; el rastro está en
  `audit_archives` y en las acciones `audit_archive_*`.
- El máximo por lote (5000) acota memoria y tiempo: un volumen mayor necesita más
  corridas, no lotes más grandes.
- La descarga administrativa exige rol Admin verificado en el servidor; un ID de
  lote inválido o ajeno se rechaza antes de consultar R2 (anti-IDOR).
- La primera ejecución real sobre una tabla reciente no archiva nada: es correcto.
- Si R2 no responde, PostgreSQL conserva los eventos; si el proceso se corta entre
  la subida y la purga, el lote queda `verificado` y se purga después.
- El `dry-run` no valida la conectividad con R2: solo describe el próximo lote.

## Pruebas

```bash
npx tsc --noEmit
npm run lint
npm test                     # Vitest: cliente R2, JSONL, GZIP, hash, servicio, endpoints, catálogo
bash scripts/local-supabase/test-auditoria-archivo.sh   # contrato SQL transaccional
npm run build
```

Las pruebas no usan credenciales reales: el cliente S3 se inyecta como objeto
falso en memoria y el contrato SQL corre dentro de una transacción que se revierte.

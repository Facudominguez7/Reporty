# Retiro por fotografía rechazada — contrato T1 → T2

## Transacción y privacidad

`decidir_imagen_moderacion` conserva su firma y CAS automático/admin. Un trigger
incremental comparte su transacción: REJECTED marca `reportes.deleted_at`, revierte
el premio registrado y crea un aviso único por reporte. No depende de que exista
el archivo privado. No borra evidencia, fotos, votos ni historial. REVIEW y
APPROVED no retiran. La evidencia rechazada admite mantenimiento terminal después
del retiro, pero no cambios de identidad, token ni reapertura de publicación.

El reporte bloqueado serializa retiro y premio. El aviso captura exclusivamente
el email del autor de la evidencia desde `auth.users`, no desde el administrador
ni desde consultas que requieren un reporte visible. Invitado (rol catálogo 5 o
`is_anonymous`) y autor sin email generan estado `omitido`, con motivo auditable.
El admin válido sigue siendo rol catálogo 1.

Las dos tablas tienen RLS y ningún permiso anon/authenticated. Las RPC son sólo
para servicio. Los definer viven en `moderacion_privada`, con search_path vacío.
No se conceden permisos nuevos sobre perfiles, usuarios ni reportes.

## Puntos: cambio obligatorio en T2

Reemplazar **solamente el premio de creación** (`sumarPuntos(...,10,...)`) por
`acreditar_puntos_reporte(p_reporte_id bigint)` desde un cliente service_role,
tras autorización del actor y creación del reporte. No pasar usuario ni monto:
se derivan del reporte y de `PUNTOS.CREAR_REPORTE=10`. `true` significa premio nuevo;
`false` significa retirado, inexistente, invitado o premio ya registrado.
No usar fallback agregado si devuelve false o falla. No acreditar dos veces.

`puntos_creacion_reporte` registra el monto exacto y la reversión única. Se usa
`adjust_profile_points_atomic`: saldo nunca negativo y exclusión histórica de rol
invitado. No se aplica penalización -3 ni se revierten premios de votos/comentarios.
El rechazo sin registro no resta nada: un saldo agregado no prueba el origen.

**Límite de despliegue:** T1 solo no impide que el consumidor TS antiguo acredite
por fuera del ledger. Entregar junto con T2. No hay backfill inferido de premios
históricos; cualquier conciliación histórica requiere evidencia y autorización
separadas. No cambiar otros consumidores del ajuste genérico.

## Aviso durable y reintento sin cron

El servicio consulta `avisos_retiro_reporte` pendiente/reclamado vencido y llama
`reclamar_aviso_retiro(p_reporte_id)`. Devuelve UUID o null si otro worker conserva
el lease de cinco minutos o ya se envió/omitió. El worker relee la fila y sólo usa
el destinatario persistido. La operación administrativa de T2 puede drenar esta
cola sin scheduler pago.

Enviar con clave de idempotencia estable `retiro-reporte/<reporte_id>`, nunca con
el token del intento. Tras aceptación del proveedor, llamar
`confirmar_aviso_retiro(p_reporte_id,p_token)`; true sólo una vez y para token
vigente. Ante error devuelto, excepción, falta de ID o caída no confirmar: permanece durable y sólo se reclama tras
vencer el lease, dentro de la ventana permitida. El lease evita workers simultáneos normales, pero no garantiza
exactly-once en una red incierta: T2 debe respetar la ventana de deduplicación del
proveedor. Fuera de esa ventana no reenviar automáticamente un resultado incierto;
requiere conciliación. Nunca prometer exactly-once SMTP sin idempotencia externa.
No almacenar errores del proveedor con datos sensibles.

Texto confirmado del correo para T2:
«Tu reporte fue retirado porque la fotografía adjunta incumple nuestras normas de contenido. Evitá volver a publicar este tipo de material».
Sin CC/admin. Invitados reciben advertencia en pantalla (T2), no email.
La falla de email nunca restaura el reporte. Falta de archivo no impide el retiro.

## Entrega T2 y ventana finita de Resend

Fuente oficial comprobada: [Resend Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys.md). Resend conserva claves **24 horas**, permite `emails.send(payload, { idempotencyKey })`, devuelve el mismo resultado para igual clave/payload y rechaza payloads diferentes con `invalid_idempotent_request`. No es una garantía de entrega SMTP exactly-once.

Migraciones generadas por CLI, aplicadas sólo al Postgres local e inmutables desde entonces:
- `20261026124436_moderacion_aviso_entrega_segura.sql`: agrega `primer_intento_at`, `conciliado_at`, `conciliado_por`; reclamo ancla el primer intento atómicamente antes de red, sin renovarlo; confirmación exige token y lease vigente.
- `20261026124905_moderacion_aviso_entrega_segura.sql`: corrección incremental de permisos. La conciliación valida al Admin permanente en un definer privado con search_path vacío; wrapper público invoker sólo para servicio. No concede acceso directo a `auth.users`.

Corte conservador a **23 h 55 min** desde el primer reclamo (cinco minutos de margen para red/relojes). El primer envío puede ocurrir aunque el aviso haya sido creado antes: se ancla al reclamar, no a `creado_at`. Intentos previos a esta ampliación se anclan conservadoramente a `creado_at`; nunca se asume que no llegaron al proveedor. La fila terminal enviada/omitida no se reclama. El trabajador relee token, lease, destinatario persistido y ventana antes del envío; cualquier error queda sin confirmar, sin datos remotos en logs. Mantener remitente, plantilla y configuración del correo estables durante reintentos; Resend no deduplica payloads distintos.

No se puede garantizar que una red arbitrariamente pausada respete un plazo remoto ni que el proveedor entregue una sola copia al buzón. Fuera del corte, la aplicación no inicia reenvíos: requiere investigación humana. La UI administrativa muestra estado e intentos sin destinatario. Una conciliación sólo confirma aceptación comprobada manualmente en Resend, mediante token CAS, lease vencido y Admin DB; registra fecha y actor y no envía otro correo. Sin evidencia se conserva el aviso incierto, sin botón de reenvío forzado.

El correo reutiliza layout, remitente y configuración Resend existentes; contiene exactamente el texto confirmado, sin enlace al detalle retirado ni CC/admin. El invitado no necesita email y ve esa advertencia inmediatamente. El rechazo no anuncia reporte publicado ni ofrece enlace a su detalle. REVIEW conserva su aviso público existente; APPROVED y sin foto conservan su flujo. `acreditar_puntos_reporte` es el único premio de creación, después de autorización: false/error/excepción no tienen fallback. Una lectura final detecta retiro administrativo concurrente para no anunciar premio/publicación ya revocados.

## Evidencia de integración T2 (local, sin proveedores reales)

- RED: creación seguía otorgando 10 puntos al rechazo y al premio repetido/error; faltaban sender/outbox; el rechazo decía «Tu reporte fue creado» y administración no admitía reintentos. SQL falló por ausencia de `primer_intento_at`.
- GREEN: 106 pruebas enfocadas; suite completa 307 pasadas y una integración opt-in omitida. TypeScript sin errores. ESLint enfocado exit 0 con las dos advertencias previas de `app/reportes/nuevo/page.tsx` (useEffect/img).
- SQL entrega segura, retiro T1 y moderación anterior: exit 0 y ROLLBACK. Runner concurrente T1: cuatro carreras, diferencial SQL y limpieza exit 0. El primer GREEN SQL detectó acceso denegado a `auth.users`; se corrigió con la segunda migración incremental, no editando la aplicada.
- Diferencial temporal contra HEAD, sin pruebas comprometidas que lean Git: 13 casos de creación/admin y tres escenarios de pipeline; stdout, stderr y exit idénticos para APPROVED/REVIEW/sin foto/fallo privado/invitados y aprobación/recuperación/publicación/limpieza/listado. Diferencia REJECTED intencional. Scratch externo eliminado en finally. El primer script tuvo un error sintáctico antes de ejecutar; la corrección pasó.
- Sin envíos reales de Resend ni llamadas reales a Sightengine. No se ejecutó build: pertenece al cierre del padre. Navegador visible pendiente del padre en 1920×1080, 1280×720 y 390×844, con ausencia de overflow horizontal y controles recortados en escritorio.

## Verificación local

`supabase/tests/moderacion_retiro_reporte.sql` usa fixtures negativas y rollback,
roles reales anon/authenticated/service_role, sin proveedor ni correos reales.
Se observó RED en la baja ausente antes de implementar; GREEN después.

La matriz transaccional verifica rol 5, ciudadano `is_anonymous` y permanente
sin email, retiro automático sin archivo, destinatario exclusivo, rechazo de RPC
con roles ordinarios, fallo INSERT inyectado (rollback de baja/decisión/saldo/ledger
/contador) y lease vencido con rechazo del token anterior y envío duplicado.
El test anterior usa reportes separados para rechazo y publicación/legacy. Aísla
su cuota mediante reemplazo transaccional de la tabla de reservas: no modifica
reservas existentes y ROLLBACK restaura la tabla original. Requiere bloqueo DDL
local breve (lock_timeout 5s); nunca ejecutar en remoto.

El runner Node abre tres sesiones psql independientes. Espera evidencia real de
`pg_blocking_pids`, con timeouts acotados, antes de liberar cada transacción:
premio→rechazo, rechazo→premio, dos rechazos y dos reclamos. Comprueba saldos,
ledger único, aviso único y ocultación pública. Usa propietario aleatorio e IDs
negativos; confirma exclusivamente esas fixtures y las elimina en `finally`,
comprobando ausencia al final. No crea archivos temporales.

Además compara stdout exacto del CAS REVIEW/APPROVED y confirmación/publicación
contra el validador anterior copiado de la migración20261025144223 dentro de una
transacción revertida. No consulta git ni deja funciones base persistidas.

Comandos exactos (Docker local mapeado a127.0.0.1:54322; conexión loopback dentro
del contenedor al mismo Postgres, sin credenciales impresas):

```sh
docker exec -i supabase_db_JackeMate psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -v ON_ERROR_STOP=1 < supabase/tests/moderacion_retiro_reporte.sql
docker exec -i supabase_db_JackeMate psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -v ON_ERROR_STOP=1 < supabase/tests/moderacion_imagenes.sql
node scripts/moderacion/verificar-retiro.mjs
git diff --check
```

Se verificaron los seis cuerpos de funciones aplicados contra la migración T1 y
los contratos mediante las suites SQL. Sin replay ni reset, después de descubrir
`migration repair --help`, se registró sólo la versión local aplicada:

```sh
node_modules/.bin/supabase migration repair 20261026122648 --status applied --local
```

No se cambió la migración aplicada ni fue necesaria una migración correctiva.
La verificación de navegador pertenece al padre; estas pruebas no la sustituyen.

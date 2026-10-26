# Contrato de base de datos para moderación

## Estado de entrega

Migración incremental aplicada por el orquestador en el stack **aislado y sintético** `ReportyModeracionPruebas`; SQL y pruebas HTTP ejecutadas satisfactoriamente. Sin acceso productivo ni llamadas al proveedor. El consumidor de aplicación todavía requiere integración y validación propias.

Archivos: `supabase/migrations/20261025144223_moderacion_imagenes.sql`, `supabase/tests/moderacion_imagenes.sql` y `scripts/moderacion/verificar-rls.mjs`. Esta corrección no modifica la migración ni los contratos RPC: corrige la fixture legacy, amplía las pruebas y documenta evidencia real.

## Frontera y compatibilidad (S4, S5, S9)

- `reportes` sigue público. No se cambian objetos, URLs, filas ni lecturas históricas de `fotos_reporte`.
- `reportes-pendientes` es privado: máximo 102400 bytes y MIME JPEG/PNG/WebP. La base no valida mágicamente los bytes: el backend debe comprobar firma, dimensiones y decodificación y generar una miniatura confiable.
- Políticas **restrictivas para PUBLIC** impiden INSERT/UPDATE en ambos buckets, además de SELECT/DELETE en el privado, incluso si otra política permisiva permite todo. La excepción es el servicio con BYPASSRLS, no una condición JWT editable.
- DELETE público existente se conserva. No se alteran políticas de otros buckets. Los UPDATE que intenten mover un objeto entre buckets también se bloquean mediante USING y WITH CHECK.
- Se revocan INSERT/UPDATE públicos de `fotos_reporte`, se elimina la política owner-insert y se añaden barreras restrictivas. Se preservan lecturas y borrados existentes. Las filas de cola nunca participan en lecturas públicas.
- Las nuevas tablas tienen RLS y carecen de privilegios para PUBLIC/anon/authenticated. Las RPC tienen EXECUTE revocado explícitamente para esos tres destinatarios. El único definer está en `moderacion_privada`, fuera de esquemas API; el resto es invoker con search_path vacío.

## Cola y autorización (S5, S7)

`public.moderacion_imagenes` conserva el contrato L5:

| Campo | Contrato |
| --- | --- |
| id | UUID de solicitud, generado una sola vez por backend |
| reporte_id | bigint, FK RESTRICT; no perder reclamaciones al borrar reportes |
| propietario_id | UUID de profiles; debe coincidir con reportes.usuario_id |
| hash_sha256 | 64 caracteres hexadecimales minúsculos del archivo canónico |
| path_privado | exactamente `<propietario_id>/<id>` sin extensión |
| decision | REVIEW inicial, APPROVED o REJECTED |
| motivos | array JSON, sin respuesta cruda ni credenciales |
| operaciones | entero no negativo; consumo informativo de la evidencia |
| administrador_id, revisado_at | decisión humana mediante rol DB 1 |
| publicado_at, creado_at | timestamptz |
| estado_publicacion, token | máquina durable descrita debajo |

UNIQUE(reporte_id,hash_sha256) elimina duplicaciones de evidencia; ante conflicto se recupera la fila existente, nunca se sustituye su contenido. El trigger verifica propietario y reporte no eliminado bajo bloqueo SHARE en cada escritura, incluso si el servicio inserta directamente. La identidad de la evidencia es inmutable.

**El servicio es frontera confiable**, no un actor que SQL pueda distinguir: antes de pasar propietario/administrador a una RPC debe obtener el usuario desde la sesión autenticada. No aceptar esos UUID desde el cliente sin verificar identidad. La autorización administrativa consulta `profiles.rol_id = 1`, nunca user_metadata. Las consultas administrativas y firmas de objetos privados son exclusivamente de servicio y requieren la misma autorización previa en el backend.

### RPC de clasificación y revisión

1. Insertar fila REVIEW/pendiente para el propietario comprobado. Subir original validado al privado usando `path_privado`; recuperar/limpiar cargas huérfanas si falla la inserción.
2. `reclamar_imagen_moderacion(p_id uuid,p_propietario uuid) → uuid|null`: CAS pendiente→reclamada, devuelve token original; solo un ganador.
3. Reservar cuota con el mismo id, antes de llamar al proveedor.
4. `decidir_imagen_moderacion(p_id uuid,p_token uuid,p_decision text,p_motivos jsonb,p_administrador uuid default null) → boolean`:
   - clasificación inicial: exige token original y estado reclamada;
   - revisión humana: exige Admin DB=1 y estado pendiente; no usa el token original;
   - REVIEW→pendiente, REJECTED→rechazada, APPROVED→publicando con **nuevo token durable**;
   - error de autorización eleva excepción; CAS perdedor devuelve false.
5. Tras aprobación, leer la fila exclusivamente mediante servicio para obtener el nuevo token. Copiar original y miniatura a `reportes/<id>/<token>` y `reportes/<id>/<token>-miniatura`. La ruta no incluye extensión: enviar Content-Type correcto.
6. `confirmar_publicacion_moderacion(p_id uuid,p_token uuid,p_url text,p_thumbnail_url text default null) → boolean`: CAS publicando→publicada e INSERT de `fotos_reporte` atómicos. Conserva `url` y referencias bucket/path canónicas; la miniatura es opcional. Segundo confirm no inserta duplicados.

**No rechazar ni expirar una fila publicando.** Dos administradores serializan la decisión bajo row lock; si gana rechazo, aprobación posterior devuelve false; si gana aprobación, rechazo devuelve false y la UI debe informar conflicto. Nunca mostrar un rechazo exitoso mientras un publicador todavía conserva autorización. El token no caduca: reintentar recuperación con el mismo token, sin nueva clasificación ni reserva; comprobar objeto existente antes de reutilizarlo, no sobrescribir evidencia arbitrariamente.

El borrado duro del reporte queda bloqueado por FK mientras exista cola; el borrado lógico hace fallar la confirmación por trigger. Si ocurre durante la copia HTTP, pueden quedar **objetos aprobados huérfanos**, nunca una imagen rechazada autorizada para publicación. El recuperador debe borrar esos objetos antes de retirar la fila de cola. No hay transacción distribuida PostgreSQL/Storage: no afirmar lo contrario. Una fila reclamada interrumpida conserva su evidencia; recuperación operativa debe enviarla a revisión mediante el token original, sin relanzar una llamada incierta.

Limpieza pendiente en consumidor: tras confirmar, eliminar archivo privado; rechazados permanecen privados hasta borrado controlado. No hay cron/TTL implementado en esta unidad. El backend debe definir retención y reintentar borrados fallidos sin borrar evidencia de otra solicitud.

## Cuota global conservadora (S8)

`reservar_operaciones_moderacion(p_solicitud uuid,p_operaciones integer default 2) → boolean`, solo servicio:

- advisory transaction lock global 76230125;
- máximo 500 operaciones/día y 2000/mes, ventanas de calendario **UTC**;
- una reserva por segundo global, independiente del usuario;
- duplicado devuelve **false**, incluso tras terminar o fallar la solicitud;
- una reserva incierta nunca se devuelve al presupuesto;
- parámetros nulos, cero o fuera de rango devuelven false;
- no borrar reservas durante operación normal: conservar identificadores evita duplicados antiguos.

`reducir_presupuesto_moderacion(p_diario integer,p_mensual integer) → void`: solo servicio, límites inferiores o iguales a los actuales; serializa con el mismo lock. No hay UPDATE directo del presupuesto para service_role. Cero desactiva llamadas.

`registrar_operaciones_moderacion(p_solicitud uuid,p_operaciones integer) → boolean`: registra consumo observado una sola vez, separado de la reserva, sin reembolso. No aceptar más que lo reservado: un exceso inesperado exige detener llamadas e investigar. El backend actualiza también `moderacion_imagenes.operaciones` para visualización; no usar ese contador para autorizar presupuesto.

**Condición operativa indispensable:** cuenta Sightengine exclusiva, Free confirmado, sin facturación automática, sin otros consumidores y límites alineados con el proveedor. Si el proveedor reinicia ventanas en otra zona horaria o usa otra contabilidad, bajar/desactivar presupuestos hasta alinear; el calendario UTC local no demuestra por sí solo costo cero. Configurar un margen menor que Free cuando exista incertidumbre. 429/timeout/fallo de configuración→REVIEW, sin liberar reserva ni volver a invocar automáticamente.

Reutilizar ANTES de crear reporte la RPC existente `claim_report_submission(p_submission_id uuid,p_actor_id uuid,p_ip_hash text,p_actor_window_seconds integer,p_actor_max integer,p_ip_window_seconds integer,p_ip_max integer) → text`. Es service-only, aplica ventanas por actor/IP y devuelve `ok`, `duplicate`, `actor_limited` o `ip_limited`. No reemplazarla con la cuota del proveedor: protegen recursos distintos.

## Prueba local y pendientes (S10)

### Preparación exacta

El orquestador prepara `.moderacion-pruebas-local/supabase/config.toml` con `project_id = "ReportyModeracionPruebas"`, API `http://127.0.0.1:55321`, DB `postgresql://postgres:postgres@127.0.0.1:55322/postgres`, migraciones y catálogos sintéticos. Ese stack ya está preparado: **no volver a sembrar ni resetearlo**. Nunca usar copias de producción. El runner no instala dependencias, no inicia servicios y no lee `.env*`. Valida proyecto, configuración y destinos antes de acceder a DB/API. Captura claves y secreto JWT efímeros del CLI solo en memoria, sin imprimirlos.

```sh
node scripts/moderacion/verificar-rls.mjs --help
node scripts/moderacion/verificar-rls.mjs
psql 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' -X -v ON_ERROR_STOP=1 -f supabase/tests/moderacion_imagenes.sql
npx eslint scripts/moderacion/verificar-rls.mjs
```

Antes del comando psql, confirmar el mismo proyecto aislado que valida el runner. No lanzar `db:setup`: puede resetear y escribir fuera del alcance permitido. SQL usa una transacción con rollback; HTTP usa UUID/rutas únicos y limpieza en finally de objetos, bucket sintético, política permisiva de prueba, usuarios, reporte, cola y reserva. No ejecutar simultáneamente dos instancias del runner: exige ausencia de reservas ajenas para que el control global sea determinista.

### Evidencia observada

- RED reproducido: SQL falló con `Lectura legacy pública rota`. La fixture tenía `reporte_id` NULL; la política histórica exige un reporte no eliminado. No era una regresión de la migración.
- GREEN: SQL corregido terminó en `ROLLBACK`, exit 0. La fixture legacy usa un reporte visible y conserva `bucket/path` NULL; SELECT real bajo anon observa la foto.
- SQL adicional: propiedad inválida rechazada sin insertar, aprobación por token, confirmación atómica y doble confirmación sin duplicados; rechazo administrativo impide posterior aprobación/publicación; privilegios anon/authenticated/invitado, cuotas diarias/mensuales, duplicados, throttle y presupuesto decreciente.
- HTTP: PNG real subido por servicio al privado; servicio recupera exactamente sus bytes. Anon, permanente, invitado y sesión admin no pueden descargarlo por rutas public/authenticated, consultar cola ni ejecutar RPC privilegiadas. Los roles normales no pueden subir directamente a ninguno de los dos buckets, reemplazar objeto público ni insertar/actualizar metadatos. Se verifican contadores/decisión inalterados después de los rechazos.
- HTTP legacy: URL pública sigue devolviendo exactamente los bytes originales; fotos pendientes no aparecen en `fotos_reporte`.
- Dos conexiones HTTP concurrentes: reserva duplicada produce exactamente un true y una fila de dos operaciones; decisiones contradictorias de dos administradores DB producen exactamente un true y decisión/administrador/fecha persistidos del ganador. Servicio pasando un ciudadano como administrador recibe denegación.
- Aun agregando una política permisiva, ambos buckets protegidos bloquean escrituras directas; un bucket sintético ajeno permite upload autenticado y lectura pública. Esta comparación acotada no depende del historial Git.
- Runner HTTP y ESLint enfocado terminaron con exit 0; limpieza confirmó ausencia de objetos, identidades y reserva propios.

Limitaciones: estas pruebas no ejercitan Server Actions, autenticación de la aplicación ni proveedor real. Los JWT de usuario están firmados únicamente con el secreto del stack sintético y corresponden a identidades auth.users reales creadas localmente. Falta simular caída durante copia HTTP, recuperación operativa, limpieza productiva y carreras de eliminación del reporte. La prueba del bucket ajeno verifica aislamiento por bucket con política permisiva sintética, no todos los flujos históricos de buckets productivos.

### Cobertura asignada

- S4: cumplido en esta unidad DB; aislamiento HTTP privado, cierre de bypass y lectura legacy comprobados.
- S5: propiedad, deduplicación, confirmación CAS y contención de decisiones concurrentes comprobadas; validación de contenido, retención y recuperación del consumidor pendientes fuera de esta unidad.
- S7: autorización Admin DB y auditoría del ganador comprobadas; consultas/firmas privadas e interfaz corresponden a otra unidad.
- S8: cuotas globales, reserva concurrente única, throttle, consumo registrado y presupuesto decreciente comprobados; cuenta Free exclusiva y manejo del proveedor corresponden al consumidor.
- S9: migración incremental y contratos DB estables, aplicados en instancia sintética; aplicación/proveedor fuera del alcance.
- S10: pruebas SQL/HTTP DB pasadas; falta matriz integral de aplicación/proveedor, fallos de recuperación y carreras de eliminación.

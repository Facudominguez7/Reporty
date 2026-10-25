# Revisión administrativa de fotografías

## Acceso y frontera de publicación (S4, S7, S9)

Ingresar a **Dashboard → Revisar fotografías privadas** con una cuenta permanente cuyo rol **en DB sea Admin (1)**. El dashboard general no es exclusivo de administradores: la página `/dashboard/moderacion`, cada Server Action y cada GET de `/api/moderacion/imagenes/[id]` verifican nuevamente `auth.getUser()` y `getUserRoleContext`/`isAdminRole` antes de crear el cliente de servicio. Metadata editable, invitado, ciudadano, interesado y operador no conceden acceso. Ser Admin tampoco modifica las reglas de operación municipal existentes.

La página es dinámica, sin caché de datos e indicada como no indexable. Se consultan campos explícitos, veinte filas por página en orden `creado_at,id` ascendente. La vista inicial contiene pendientes, reclamadas y publicaciones interrumpidas; la vista **Auditoría y limpieza de terminales** contiene publicadas/rechazadas. Navegación acotada a 501 páginas por vista; si se supera este volumen, revisar operativamente antes de ampliar el límite. La paginación por desplazamiento puede cambiar de página si otra persona decide concurrentemente: actualizar y revisar el contexto, nunca asumir una posición como identidad.

El navegador recibe solo identificador de solicitud/reporte, fecha, decisión, estado y motivos traducidos desde códigos conocidos. No recibe hash, ruta privada, token de clasificación ni URL firmada. El preview usa `next/image` **sin optimización**, para no pasar por un optimizador público que pierda la sesión. Cada GET privado exige de nuevo Admin DB y entrega WebP con `Cache-Control: private, no-store, max-age=0`, `Vary: Cookie`, `X-Content-Type-Options: nosniff` y `X-Robots-Tag: noindex, nofollow`. Compartir el URL no comparte permisos. Sin sesión devuelve 401; con otro rol devuelve 403 antes de consultar la existencia del objeto. Los errores no contienen información de Storage.

Antes de entregar bytes o aprobar, se verifica tamaño ≤100 KiB, firma WebP y SHA-256 contra la evidencia canónica registrada por el pipeline. No se vuelve a clasificar ni normalizar la evidencia en esta unidad. Una carga marcada `carga_privada_pendiente` no demuestra que exista el archivo: si faltan los bytes, la aprobación falla cerrada, el preview muestra ausencia y solo queda habilitado el rechazo. Si el objeto realmente está y coincide, el servidor puede aprobarlo.

## Decisiones y recuperación explícita (S5, S7)

| Estado | Operación |
| --- | --- |
| REVIEW/pendiente | Revisar contexto, **Aprobar y publicar** o **Rechazar**. |
| REVIEW/reclamada | Solo si el trabajo se interrumpió, **Recuperar clasificación interrumpida**; luego decidir normalmente. |
| APPROVED/publicando | **Reintentar publicación sin reclasificar**. No intentar rechazar esta aprobación durable. |
| Publicada/rechazada | **Reintentar limpieza privada**, conservando fila y auditoría. |

Las decisiones usan exclusivamente `decidir_imagen_moderacion`, con `p_administrador` obtenido de la sesión verificada; la RPC valida Admin DB y registra fecha/actor. Un CAS false comunica conflicto y no llama a publicación ni limpieza. Los botones se deshabilitan durante la acción y el resultado se anuncia mediante región de estado. Las acciones revalidan administración, reporte, mapa, listados, dashboard y mis reportes; no cambian estado municipal, puntos ni emails.

La recuperación de reclamos **no es automática ni se basa en un vencimiento supuesto**. Primero confirmar que no hay trabajo activo. La acción Admin lee el token original exclusivamente en servidor y decide REVIEW mediante la RPC original, con `p_administrador:null` como exige ese contrato, agregando `reclamo_recuperado_por_administracion`. SQL borra el token al devolver a pendiente; un clasificador tardío ya no puede decidir ni publicar con él. La aprobación/rechazo humano posterior registra el actor y fecha finales. El motivo identifica una recuperación administrativa pero el schema actual no registra el actor individual de esa recuperación intermedia; no confundirlo con la auditoría de la decisión final.

Aprobación y reintento llaman únicamente `publicarImagenModerada`; rechazo y limpieza llaman únicamente `limpiarImagenModerada`. No existe otro uploader público, llamada a Sightengine ni reserva de cuota en estas acciones. Los contratos durables y las carreras SQL se describen en [base de datos](moderacion-base-datos.md); la copia/confirmación/limpieza recuperables en [flujo](moderacion-flujo.md).

## Retención y operación manual

La retención de rechazadas es **borrado privado inmediato**, conservando permanentemente la fila de auditoría; no borrar filas ni reservas. Si Storage falla se conserva la decisión, se informa limpieza pendiente y se permite reintentar desde terminales. Todas las terminales son inspeccionables, incluso si también falló la escritura del motivo de recuperación. El helper compartido conserva motivos históricos de fallo aunque un reintento posterior borre correctamente: el mensaje de la acción es el resultado actual, un motivo antiguo no demuestra que todavía exista un objeto.

Si los reintentos fallan, una persona con acceso operativo autorizado debe comprobar la decisión terminal y su ruta durable en DB, corregir permisos/disponibilidad de Storage y volver a ejecutar la limpieza administrativa. Como último recurso, eliminar **solo ese objeto privado terminal verificado** desde herramientas administrativas de Storage, sin retirar la auditoría ni tocar evidencia pendiente. No usar rutas tomadas del navegador ni borrar por prefijo global. Para `limpieza_publica_pendiente`, revisar el contrato de huérfanos del publicador y reintentar ese helper: la limpieza privada no borra copias públicas. No hay cron, pago, nuevas dependencias ni cambios de schema en esta unidad.

## Evidencia y comprobación del padre (S10)

Pruebas unitarias cubren denegación previa al servicio (roles 2/3/4/5, rol ausente, metadata Admin falsificada, sesión ausente/anónima y errores de rol), UUID inválido, selección explícita/paginación, preview limitado y hash, headers/status HTTP reales del handler, actor verificado en RPC, CAS perdedor, recuperación del token original y decisión posterior, reintento sin clasificación/cuota, carga ausente y fallo de limpieza visible. Las pruebas usan dobles de Auth/DB/Storage, no operaciones del proveedor. La fecha y la invalidación efectiva bajo concurrencia son garantías de la RPC ya probada en T1; estas pruebas verifican su invocación, no reemplazan aquellas pruebas multiconexión.

```sh
npm test -- lib/moderation/administracion.test.ts app/dashboard/moderacion/actions.test.ts app/dashboard/moderacion/page.test.ts 'app/api/moderacion/imagenes/[id]/route.test.ts'
npx eslint lib/moderation/administracion.server.ts lib/moderation/administracion.test.ts app/dashboard/moderacion/actions.ts app/dashboard/moderacion/actions.test.ts app/dashboard/moderacion/page.tsx app/dashboard/moderacion/page.test.ts app/dashboard/moderacion/cola-moderacion.tsx 'app/api/moderacion/imagenes/[id]/route.ts' 'app/api/moderacion/imagenes/[id]/route.test.ts' app/dashboard/page.tsx
npx tsc --noEmit
```

Comprobación pendiente del padre en navegador contra fixtures sintéticas existentes: abrir como Admin y como cada rol denegado; abrir el preview en una sesión sin permisos y verificar 401/403/no-store/nosniff; revisar por teclado/lector los estados y acciones; provocar conflicto entre dos revisores y verificar un solo ganador; recuperar un reclamo interrumpido, decidir y comprobar auditoría final; simular fallo de publicación y limpieza sin nueva llamada al proveedor. No resetear/resembrar el stack, no usar producción ni credenciales reales de Sightengine. Suite global/build y verificación independiente pertenecen al cierre del padre.

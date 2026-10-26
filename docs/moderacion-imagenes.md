# Operar la moderación de fotografías

La integración está preparada, **no desplegada**. Antes de habilitar fotografías, una persona debe confirmar la cuenta gratuita exclusiva y coordinar migración y despliegue en mantenimiento. Esta guía consolida S1–S12; los contratos detallados siguen en [proveedor](moderacion-proveedor.md), [base de datos](moderacion-base-datos.md), [flujo](moderacion-flujo.md) y [administración](moderacion-administracion.md). Sus notas de pendientes corresponden a cada etapa; el cierre observado se resume aquí.

## Ruta de activación manual (S8, S11, S12)

1. Crear o verificar una única cuenta **Sightengine Free**, sin suscripción paga, facturación automática ni otros consumidores. No multiplicar cuentas gratuitas. Confirmar en el panel el plan, límites, grupos de operaciones, uso previo y zona horaria de reinicio; no deducirlos de las credenciales.
2. Obtener las credenciales reales desde ese panel y guardarlas exclusivamente en la configuración de servidor de Hostinger. Nunca copiarlas a navegador, logs, documentación ni variables `NEXT_PUBLIC_*`. No usar valores simulados en producción.
3. Solo después de la comprobación humana, establecer `SIGHTENGINE_PLAN_FREE_CONFIRMADO=true`. Sin esa cadena exacta o sin credenciales, no se llama al proveedor y la fotografía queda para revisión privada cuando el almacenamiento funciona.
4. Confirmar espacio/egreso disponibles en Supabase Free, capacidad de atención de la cola y compatibilidad nativa de Node/sharp en Hostinger. Reducir presupuestos si las ventanas o el consumo no coinciden; ante incertidumbre, mantener llamadas deshabilitadas.
5. Acordar una ventana de mantenimiento para aplicar la migración incremental y activar el backend compatible como una sola operación coordinada. **Esta entrega no autoriza ejecutarla en producción.**

| Variable exclusivamente servidor | Valor o significado |
| --- | --- |
| `SIGHTENGINE_API_USER` | Identificador real de la cuenta verificada. |
| `SIGHTENGINE_API_SECRET` | Secreto real, nunca público ni registrado. |
| `SIGHTENGINE_PLAN_FREE_CONFIRMADO` | `true` únicamente tras verificar manualmente Free y ausencia de facturación automática. |
| `MODERACION_UMBRAL_REVISION` | Predeterminado `0.5`. Indicadores ambiguos, armas, lesiones o violencia alcanzándolo requieren REVIEW. |
| `MODERACION_UMBRAL_RECHAZO` | Predeterminado `0.9`. Sexo explícito o contenido gráfico extremo alcanzándolo producen REJECTED. |

Los umbrales deben ser finitos, >0 y ≤1, con revisión menor que rechazo; una configuración inválida falla cerrada. Armas solas nunca rechazan. Las probabilidades **no son certezas**: existen falsos positivos y falsos negativos. Véanse los campos exactos y las reglas completas en [proveedor](moderacion-proveedor.md).

## Arquitectura auditada y cambios (S1–S6, S9)

Antes: selección y optimización en `app/reportes/nuevo/page.tsx` → acción autenticada/claim UUID por actor e IP → caso de uso/rol → reporte → uploader público y metadatos → puntos. Se identificaron escritura directa autenticada en Storage/`fotos_reporte` y miniatura cliente no ligada al original.

Ahora: navegador optimiza → sesión, claim y rol DB autorizan → reporte creado → servidor valida y decodifica los bytes, normaliza y calcula hash → cola durable privada → reserva global → una clasificación → decisión CAS → solo aprobación copia original y miniatura confiable al público y confirma metadatos. Revisión y fallo fotográfico conservan el reporte. **Actualización T2:** REJECTED automático o administrativo retira lógicamente el reporte, revierte sólo el premio de creación registrado y crea una advertencia privada al autor; el fallo del correo nunca restaura la baja. El contrato anterior de conservar reportes rechazados queda sustituido por [retiro y entrega segura](moderacion-retiro-contratos.md). El estado municipal no es la moderación. En el detalle público del reporte, una fotografía con decisión REVIEW muestra «Fotografía pendiente de revisión» para todos los visitantes. Solo se expone ese indicador; la imagen, sus rutas y los motivos permanecen privados. El aviso desaparece tras aprobar o rechazar la fotografía.

- `lib/moderation/sightengine.server.ts` usa fetch nativo y un contrato sustituible; no publica. No hay reintentos automáticos.
- `lib/moderation/imagenes-reporte.server.ts` autoriza propiedad, deduplica por reporte/hash y publica exclusivamente con aprobación/token durable. El uploader legacy quedó como reexport server-only, fuera del barrel cliente.
- La miniatura enviada por el navegador ya no se publica. `lib/media/preparar-imagen-reporte.server.ts` decodifica y recodifica sin metadatos; solo admite imágenes estáticas válidas.
- RLS restrictiva bloquea altas y cambios directos en ambos buckets y metadatos, incluso con políticas permisivas coexistentes; conserva los borrados públicos previamente autorizados. Solo el backend autorizado usa service role; esa clave nunca va al navegador.
- `reportes` conserva objetos y lecturas históricas, tanto `url` legacy como `bucket/path` canónicos. La cola no participa en mapas, listados, detalles ni miniaturas públicas. Las fotos históricas no se moderaron retroactivamente; sus URLs y cachés pueden seguir accesibles.

El [flujo detallado](moderacion-flujo.md) enumera contratos, mensajes, validaciones, carreras y recuperación; no hay transacción distribuida entre PostgreSQL y Storage.

## Supabase y Hostinger: orden seguro (S4, S5, S9, S11)

Migración inicial: [`20261025144223_moderacion_imagenes.sql`](../supabase/migrations/20261025144223_moderacion_imagenes.sql). El retiro T1 y la entrega T2 requieren además `20261026122648_moderacion_retiro_reporte.sql`, `20261026124436_moderacion_aviso_entrega_segura.sql` y su corrección `20261026124905_moderacion_aviso_entrega_segura.sql`, junto con el backend compatible. No entregar SQL de retiro con el consumidor antiguo de puntos. Es incremental: no editar migraciones aplicadas. Crea cola, reservas/RPC y bucket privado `reportes-pendientes`, con RLS y revocación de grants para PUBLIC/anon/authenticated; preserva lectura pública histórica de `reportes`. Ver [contrato SQL](moderacion-base-datos.md).

**No dejar un despliegue antiguo activo con las nuevas RLS restrictivas:** su uploader público dejaría de funcionar y podría perder fotografías. Tampoco habilitar el nuevo backend sin migración: falla cerrado, pero las fotografías no se retienen si no puede crear cola/almacenamiento. Suspender envíos durante mantenimiento, preparar el artefacto compatible, coordinar migración y activación, y comprobar permisos/retención antes de reabrir. Si algo falla, mantener mantenimiento y recuperar hacia una versión compatible; **nunca relajar políticas públicas como rollback**.

El `package.json` actual declara Next.js 16 y React 19 (la descripción de stack antigua en AGENTS.md quedó desactualizada). Hostinger debe usar el alojamiento Node existente y una versión Node compatible con Next y los binarios nativos de `sharp 0.35.5`, dependencia directa fijada. La secuencia de instalación/artefacto/arranque es `npm ci`, `npm run build`, `npm start`; no se ejecutó en Hostinger en esta entrega. Verificar allí arquitectura, bibliotecas nativas, memoria y CPU: el resultado local no demuestra compatibilidad remota.

El decode está acotado a `1536²` píxeles; original canónico y miniatura pesan cada uno ≤100 KiB, miniatura ≤384 px. No hay modelos pesados ni transformaciones pagas. NSFWJS fue evaluado y no instalado: aumenta payload/latencia y puede omitirse en navegador; no sirve como barrera de seguridad. No se investigaron proveedores alternativos.

## Costo cero condicionado y vigilancia (S8)

Según las fuentes oficiales enlazadas en [proveedor](moderacion-proveedor.md), Free ofrece 2000 operaciones/mes, 500/día y 1 solicitud/segundo. Para imagen estática, `nudity-2.1` consume un grupo y `weapon,gore-2.0,violence` otro: **2 operaciones**, máximo teórico 1000 fotos/mes y 250/día. Cuentas legacy anteriores a 2025 pueden tener otra contabilidad. Confirmar condiciones actuales en el panel antes de activar.

La DB reserva conservadoramente dos operaciones, serializa globalmente, deduplica y usa calendarios UTC. Nunca devuelve presupuesto por timeout o consumo incierto; el contador observado no reemplaza la reserva. La cuota del proveedor es de toda la cuenta: consumos externos, zona horaria distinta o grupos diferentes invalidan el cálculo local. Usar cuenta exclusiva, alinear ventanas y reducir/desactivar presupuestos ante diferencias. Un exceso observado exige detener llamadas e investigar. Un 429 deja REVIEW privado, sin reintentos ni publicación insegura.

Supabase Free también limita almacenamiento, egreso e inactividad: verificar sus límites actuales en el panel, sin asumir cifras no comprobadas. Pendientes consumen capacidad; revisar manualmente cola, reservas, uso del proveedor, objetos terminales y espacio disponible. No hay cron pago ni transformaciones pagas. El software **no puede garantizar el estado de facturación de una cuenta externa**: USD 0 depende de la configuración Free humana y de no habilitar cargos.

## Revisión y recuperación administrativa (S5, S7)

Entrar en `/dashboard/moderacion` desde Dashboard con Admin permanente, rol DB 1. Página, acciones y proxy `/api/moderacion/imagenes/[id]` vuelven a validar sesión y rol antes del servicio. El proxy comprueba hash/bytes y devuelve contenido `private, no-store`, con `nosniff`, `Vary: Cookie` y `noindex`; no entrega rutas privadas ni URLs firmadas al navegador. Sin sesión: 401; otro rol: 403 en preview y redirección a `/dashboard` en página. No basta metadata editable ni una sesión invitada.

| Estado durable | Operación manual |
| --- | --- |
| REVIEW/pendiente | Revisar contexto y motivo; aprobar/publicar o rechazar. |
| REVIEW/reclamada interrumpida | Confirmar que no hay trabajo activo y recuperar a pendiente; no repetir una llamada incierta. |
| APPROVED/publicando | Reintentar publicación con el mismo token; no reclasificar, reservar ni rechazar esa aprobación durable. |
| Publicada/rechazada | Reintentar limpieza privada desde auditoría de terminales. |
| Carga privada pendiente o ausente | Inspeccionar evidencia; no prometer retención ni aprobar bytes inexistentes. |

Rechazo retira el reporte atómicamente, revierte su premio registrado y encola la advertencia exclusivamente al autor con correo registrado; invitados reciben la advertencia en pantalla. Luego intenta eliminar el original privado, conservando auditoría. La cola de terminales permite reintentar avisos dentro de ventana o conciliar aceptación verificada, sin mostrar destinatarios. Decisiones finales registran administrador/fecha; la recuperación intermedia no registra individualmente su actor en el schema actual. CAS evita ganadores contradictorios. Conservar filas y reservas; no borrar evidencia pendiente. Véanse [administración](moderacion-administracion.md) y [recuperación del flujo](moderacion-flujo.md) para conflictos, huérfanos aprobados y limpieza manual acotada.

**Riesgo operativo:** si DB y Storage fallan simultáneamente puede fallar también el registro del motivo de limpieza. Inspeccionar terminales y rutas durables, restaurar servicio y reintentar; no inferir éxito por ausencia de aviso. No existe atomicidad distribuida ni limpieza automática garantizada. La cola requiere atención humana sostenida.

## Matriz de los doce casos solicitados (S10)

Las pruebas automatizadas simulan Sightengine: **no consumieron solicitudes reales del proveedor**. No son doce ejemplos clasificados por el proveedor real. Los nombres siguientes son rutas relativas al repositorio.

| Caso | Archivo de prueba / evidencia | Nivel demostrado |
| --- | --- | --- |
| 1. Imagen segura | `lib/moderation/decision.test.ts`, `lib/moderation/imagenes-reporte.integration.test.ts` | Decisión unitaria; publicación SQL/Auth/Storage local real con proveedor simulado. |
| 2. Pornografía explícita | `lib/moderation/decision.test.ts`, `lib/moderation/imagenes-reporte.test.ts` | Respuesta simulada: rechazo y ausencia de publicación. |
| 3. Arma legítima | `lib/moderation/decision.test.ts`, `lib/moderation/imagenes-reporte.test.ts` | Respuesta simulada: REVIEW, no rechazo automático; legitimidad exige contexto humano. |
| 4. Violencia gráfica | `lib/moderation/decision.test.ts` | Umbrales simulados de gráfico extremo/revisión, no diagnóstico real. |
| 5. Ambigüedad | `lib/moderation/decision.test.ts`, `lib/moderation/sightengine.test.ts` | Indicadores ambiguos o incompletos simulados → REVIEW. |
| 6. API no disponible | `lib/moderation/sightengine.test.ts`, `lib/moderation/imagenes-reporte.test.ts` | Red/timeout simulados, sin reintento y sin publicación. |
| 7. Cuota agotada | `lib/moderation/sightengine.test.ts`, `supabase/tests/moderacion_imagenes.sql` | 429 simulado y presupuestos SQL reales locales. |
| 8. Upload directo | `supabase/tests/moderacion_imagenes.sql`, `scripts/moderacion/verificar-rls.mjs` | Grants/RLS y HTTP Storage real local, incluso política permisiva coexistente. |
| 9. Aprobación no autorizada | `app/dashboard/moderacion/actions.test.ts`, `supabase/tests/moderacion_imagenes.sql` | Guard simulado y rol DB real; navegador normal denegado. |
| 10. Pendientes nunca públicos | `lib/moderation/imagenes-reporte.integration.test.ts`, `scripts/moderacion/verificar-rls.mjs`, `app/api/moderacion/imagenes/[id]/route.test.ts` | SQL/Storage/Auth local reales y handler simulado; navegador preview privado autorizado. |
| 11. Reintentos/duplicados | `lib/moderation/imagenes-reporte.test.ts`, `scripts/moderacion/verificar-rls.mjs` | Recuperación unitaria, reserva/decisiones concurrentes locales; navegador recupera sin nueva reserva. |
| 12. Reportes existentes | `supabase/tests/moderacion_imagenes.sql`, `scripts/moderacion/verificar-rls.mjs` | Lectura legacy y bytes HTTP reales locales; siete comparaciones diferenciales temporales complementarias. |

## Comandos y resultados ya observados (S10, S12)

Referencia de reproducción, **no ejecutada nuevamente en esta unidad documental**. Para SQL/HTTP/opt-in se requiere el stack sintético previamente preparado `ReportyModeracionPruebas`, API 55321/DB 55322; confirmar destino según [preparación segura](moderacion-base-datos.md). No iniciar/resetear/resembrar ni usar producción.

| Comando exacto | Resultado observado previamente |
| --- | --- |
| `npm test` | Exit 0; log temporal perdido tras cambio de sesión: no se dispone del conteo total final. |
| `npx tsc --noEmit` | Exit 0. |
| `npm run lint` | Exit 1: mismo error preexistente en `components/location-picker-map.tsx:69`, `react-hooks/set-state-in-effect`, y seis advertencias. No corregido: fuera de alcance. |
| `npm run build` | Exit 0 con configuración sintética, sin Sightengine habilitado; no reemplaza TypeScript/ESLint ni prueba despliegue. |
| `psql 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' -X -v ON_ERROR_STOP=1 -f supabase/tests/moderacion_imagenes.sql` | Exit 0, transacción termina en ROLLBACK. |
| `node scripts/moderacion/verificar-rls.mjs` | Exit 0; HTTP bytes, permisos, cuotas, carreras y limpieza locales. |
| `MODERACION_INTEGRACION_LOCAL=1 npm test -- lib/moderation/imagenes-reporte.integration.test.ts` | Un caso opt-in pasó con SQL/Storage/Auth reales locales y Sightengine simulado; omitido por defecto. |

Resultados enfocados previos: 36 pruebas de proveedor, 60 de pipeline y 30 administrativas; siete comparaciones diferenciales en scratch temporal. Sus comandos y límites están en las guías detalladas. No sumarlos como conteo de suite final ni afirmar que scratch sea un entregable permanente.

Navegador contra build de producción **local**, puerto 3133: cuatro fixtures sintéticas, tres publicadas y una rechazada; tres decisiones humanas con actor/fecha, seis derivados públicos, cuatro originales privados eliminados y cero reservas nuevas. Se comprobaron recuperación/reintento, previews privados y denegaciones normal 403/redirect dashboard y anónimo 401. Limpieza por teclado con Enter comprobada; no equivale a auditoría integral de accesibilidad. Fixtures propias limpiadas y servidor local detenido. No hubo llamadas reales a Sightengine.

## Entrega, límites y próxima decisión (S11, S12)

La cadena conserva cuatro commits: `5bac26e` (proveedor, 325 líneas), `06ab288` (SQL/seguridad, 844), `0b2737b` (pipeline, 1239) y `5589ecf` (administración, 524). Los tres últimos superan el objetivo de revisión de 400 líneas; acumulado 2927 líneas autorales sin lockfile, mayor que la previsión inicial. Se informa el exceso, sin atribuirle aprobación o excepción. Esta unidad añade únicamente esta guía; el inventario técnico por etapa está en las cuatro guías enlazadas.

No hubo pushes, PRs, merges, despliegues ni SQL remoto. El lint global sigue bloqueado por el error preexistente; build verde no lo resuelve. Restan comprobación manual de recursos/binarios en Hostinger, cuenta Free/ventanas exclusivas, capacidad Supabase y atención operativa. La clasificación no garantiza ausencia de errores ni sanea imágenes históricas/cachés.

**Próxima decisión humana:** mantener la integración deshabilitada o autorizar primero la configuración Free y un plan de mantenimiento coordinado; migración productiva y despliegue requieren autorización explícita separada. No activar por el solo hecho de que pasen las pruebas locales.

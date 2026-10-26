# Creación y publicación de fotografías moderadas

## Alcance y arquitectura (S1, S9)

Esta guía integra creación, validación, publicación y retiro por rechazo. El contrato de [retiro y avisos](moderacion-retiro-contratos.md) sustituye la regla anterior de conservar reportes rechazados. No cambia estados municipales. `PENDIENTE` del reporte **no** es una decisión de moderación.

Flujo anterior auditado: `app/reportes/nuevo/page.tsx` optimizaba la fotografía y generaba una miniatura; `actions.ts` validaba ambas antes de consultar la sesión; `create-report.ts` verificaba el rol, creaba el reporte, llamaba a `subirImagenReporte` y acreditaba puntos. La subida legacy escribía directamente en `reportes` y `fotos_reporte`, con compatibilidad de columnas antiguas.

Flujo actual:

1. El navegador conserva la optimización existente (100 KiB, 1536 px). Ya no envía la miniatura para publicación.
2. La acción valida texto, ubicación y UUID; verifica `auth.getUser`, reclama el envío con los controles existentes por actor/IP y pasa la identidad de sesión al caso de uso.
3. El caso de uso consulta el rol DB (`getUserRoleContext`/`canCreateReports`). Solo después comprueba tamaño, MIME y los encabezados con el validador compartido, sin cambiar su contrato. No lee miniaturas del cliente.
4. Se crea el reporte con `crearReporte`. La fotografía pasa al módulo confiable; REVIEW y fallo fotográfico conservan el reporte. REJECTED retira lógicamente el reporte y revierte sólo el premio de creación registrado. La creación usa exclusivamente `acreditar_puntos_reporte` después de autorizar, sin fallback agregado; invitados y premios repetidos no acreditan.
5. El módulo verifica nuevamente el propietario y `deleted_at` en DB. `sharp` decodifica todos los píxeles, rechaza truncamiento, advertencias, dimensiones excesivas y múltiples cuadros. `limitInputPixels=1536²` limita el decode. Recodifica desde píxeles sin metadatos a WebP; original y miniatura quedan individualmente en ≤100 KiB, miniatura en ≤384 px. No instala modelos. `sharp 0.35.5`, ya presente transitivamente, queda declarado como dependencia directa y fijado.
6. Calcula SHA-256 del original canónico e inserta REVIEW en `moderacion_imagenes` **antes** del proveedor. UNIQUE(reporte_id,hash) recupera el resultado persistido sin nueva reserva, carga ni clasificación. El original se guarda en `reportes-pendientes/<propietario>/<id>`.
7. Reclama la fila por RPC, reserva dos operaciones y llama una sola vez a `moderarImagen`. Configuración ausente, error, cuota agotada, consumo incierto o anomalía de registro conservan REVIEW. Las reservas nunca se reembolsan. Consumo conocido se registra por RPC y en el contador informativo; más de dos operaciones reduce ambos presupuestos a cero y obliga REVIEW. SQL no acepta consumo mayor al reservado: el contador informativo y motivos conservan esa anomalía.
8. Decide mediante CAS con el token original. Solo APPROVED/publicando obtiene el nuevo token durable y puede publicar. REVIEW no produce ningún objeto público. REJECTED retira el reporte, revierte su premio registrado y crea el aviso privado en la misma transacción; después intenta advertir al autor y limpiar el privado. Fallos de correo o Storage nunca restauran el reporte.
9. Publica en `reportes/<id>/<token>` y `<id>/<token>-miniatura`; la miniatura se deriva exclusivamente del original canónico privado. La confirmación RPC inserta atómicamente los metadatos en `fotos_reporte`. Ningún otro camino de creación inserta esas filas.

La subida pública legacy fue retirada; `database/queries/reportes/nuevo/subir-imagen.ts` es únicamente un reexport `server-only` del publicador confiable. El barrel usado por el navegador no exporta esa función. Las lecturas canónicas y legacy permanecen intactas: la cola privada no participa en mapas, listados, detalles ni miniaturas públicas.

## Contratos reutilizables (S4, S5, S6)

Módulo `lib/moderation/imagenes-reporte.server.ts`, exclusivamente servidor:

- `moderarYGuardarImagenReporte(supabase, { reporteId, propietarioId, image })`: requiere cliente de servicio y propietario obtenido de sesión validada, no de un UUID arbitrario del cliente. Verifica propiedad DB. No acepta miniatura confiable del navegador.
- `publicarImagenModerada(supabase, id)`: requiere autorización previa del llamador (la futura acción administrativa debe verificar Admin DB). No es una Server Action expuesta. Solo procesa APPROVED/publicando o recupera limpieza de publicada; no clasifica ni reserva cuota.
- `limpiarImagenModerada(supabase, id): Promise<string[]>`: solo borra privados terminales publicada/rechazada. Puede reintentarse sin proveedor ni cuota. Nunca borra evidencia pendiente.
- `ResultadoImagenReporte = { estado: APPROVED | REJECTED | REVIEW | ERROR_PRIVADO, publicada: boolean, motivos: string[], advertencias: string[] }`. Motivos devueltos son texto fijo seguro, advertencias son códigos internos saneados. No devuelve UUID de cola, ruta privada, URL firmada, respuesta cruda o credenciales.
- `prepararImagenReporte(File): Promise<{ original: Buffer; miniatura: Buffer }>` es la frontera de bytes, también `server-only`.

El resultado del caso de uso conserva `reportId`, `imageUploaded`, `pointsAwarded`, `isGuest` y agrega `imageModeration` (null sin foto). `imageUploaded` solo es true tras observar publicación confirmada. El navegador muestra procesamiento discreto y una advertencia específica para revisión, rechazo, fallo privado o publicación pendiente, sin anunciar éxito ni ofrecer el detalle si el reporte fue retirado. Invitados reciben en pantalla la advertencia completa, sin exigirles correo. REVIEW conserva el aviso de revisión privada. Nunca pide volver a enviar su texto.

## Recuperación y limpieza, sin cron pagado (S5, S8)

| Situación durable | Acción permitida |
| --- | --- |
| REVIEW/pendiente con original privado | Revisión humana posterior; no reintentar proveedor automáticamente. |
| REVIEW/reclamada interrumpida | Operador autorizado lee el token original y ejecuta `decidir_imagen_moderacion` con REVIEW para devolverla a pendiente; nunca repetir una llamada de consumo incierto. |
| `carga_privada_pendiente` | No prometer que la foto está almacenada. La fila conserva ruta y auditoría; inspección operativa puede verificar el objeto. No hay nueva clasificación automática en un duplicado. |
| APPROVED/publicando | Reintentar `publicarImagenModerada` con el mismo id/token. Sin reclasificar ni reservar. |
| Publicada o rechazada con privado remanente | Reintentar `limpiarImagenModerada`; borrado inmediato es la política de retención de rechazadas. |
| Reporte eliminado durante copia | El publicador borra copias aprobadas huérfanas, conservando fila/auditoría; errores quedan como `limpieza_publica_pendiente`. Reintentar el publicador tras corregir Storage. |

La ausencia de objetos acepta el `statusCode/status=404` explícito del SDK. También reconoce el formato real observado en Storage local: `StorageUnknownError` con `originalError` Response HTTP400 cuyo JSON contiene conjuntamente `statusCode:"404"`, `error:"not_found"` y `code:"NoSuchKey"`. La lectura se limita a 4 KiB y 500 ms; JSON inválido, cuerpos mayores, errores de red y HTTP403/5xx no habilitan ninguna carga. No se registra ni devuelve el mensaje remoto.

Antes de reutilizar un objeto público se descarga y compara tamaño y SHA-256 con los bytes esperados. Ante mismatch o error distinto de 404 no se sobrescribe ni confirma. Todas las cargas usan `upsert:false`; si otra carga gana la carrera, se verifican sus bytes. El original privado debe coincidir con el hash durable antes de copiarse. La miniatura regenerada debe coincidir también cuando ya existe: una actualización de encoder que cambie bytes puede requerir intervención, nunca sobrescritura ciega.

Un fallo de copia/confirmación conserva APPROVED/publicando, el token y el privado para recuperación. La limpieza de huérfanos vuelve a comprobar el estado **después** de observar la eliminación lógica: jamás borra objetos de una confirmación ganadora. Esto presupone que no se revierte concurrentemente el borrado lógico durante esa limpieza. PostgreSQL y Storage no comparten transacción; no se afirma atomicidad distribuida.

Los fallos de borrado privado se registran en motivos (`limpieza_privada_pendiente`) y se devuelven como advertencias. Si DB tampoco acepta la auditoría se devuelve `auditoria_pendiente`; la fila terminal y su ruta determinista permiten detectar el remanente al revisar filas terminales. No retirar filas ni reservas durante limpieza normal. Si falla la reducción de presupuesto, se registra `presupuesto_requiere_revision` cuando DB lo permite: detener operativamente el proveedor hasta verificar presupuesto. No hay un mecanismo distribuido que pueda confirmar un cambio mientras DB está inaccesible.

Requisitos operativos externos: [contrato DB](moderacion-base-datos.md) y [proveedor](moderacion-proveedor.md). Cuenta exclusiva Free confirmada, sin facturación automática, presupuestos alineados y permisos privados son indispensables. Esta unidad no toca producción ni realiza llamadas reales a Sightengine.

## Evidencia y diferencias intencionales (S10)

Pruebas enfocadas: imágenes JPEG/PNG/WebP reales generadas por sharp, truncadas/inválidas, EXIF real, animación, límites antes de `arrayBuffer`, contratos de validadores/URL legacy; propiedad; orden cola→cuota→API→decisión→copia; rechazo, armas/revisión, indisponibilidad/configuración/cuota; duplicados; miniatura falsificada; errores de carga, registro y decisión; recuperación de copia/confirmación, mismatch, carreras de confirmación/borrado y limpieza recuperable. Todas las llamadas al proveedor y Supabase están simuladas; no sustituyen las pruebas SQL/HTTP independientes de T1 ni una verificación futura de navegador.

Comparación diferencial sintética: fuentes de `06ab2880857f3edf8c6de80a5c7a24fd33eec191` copiadas exclusivamente a `.moderacion-pruebas-local/comparacion-base-06ab288/`. Los tests del scratch no leen Git ni secretos. Siete casos pasaron: sin foto, invitado, rol no autorizado, sesión ausente, imagen segura y dos archivos inválidos autenticados. Se compara el contrato anterior excluyendo únicamente el campo aditivo `imageModeration`.

Diferencias intencionales respecto de esa base:

- Fotografías antes publicadas directamente ahora requieren aprobación; REVIEW/fallo de proveedor conservan reporte sin foto pública. Desde T2, REJECTED retira el reporte y revierte sólo el premio registrado; el diferencial histórico anterior no cubre este cambio intencional.
- Sesión, claim y rol tienen precedencia sobre errores de imagen; evita trabajo costoso no autorizado. Los mensajes de archivo inválido autenticado permanecen iguales en los casos diferenciales.
- Las miniaturas externas se ignoran incluso si son inválidas o vienen sin original; se generan exclusivamente en servidor.
- Archivos con encabezado aparentemente válido pero decode completo inválido ya no pueden publicarse; el reporte ya creado se conserva con fallo de fotografía.
- La normalización elimina metadatos y cambia los bytes/formato a WebP; deduplicación usa esos bytes, no el nombre original.
- La cola y tokens son durables; el usuario recibe estado seguro, nunca identificadores privados.

Comandos de verificación autorizados:

```sh
npm test -- lib/media/preparar-imagen-reporte.test.ts lib/moderation/imagenes-reporte.test.ts lib/use-cases/reportes/create-report.test.ts app/reportes/nuevo/actions.test.ts
npm test -- .moderacion-pruebas-local/comparacion-base-06ab288/comparacion.test.ts
npx eslint lib/media/preparar-imagen-reporte.server.ts lib/media/preparar-imagen-reporte.test.ts lib/moderation/imagenes-reporte.server.ts lib/moderation/imagenes-reporte.test.ts lib/use-cases/reportes/create-report.ts lib/use-cases/reportes/create-report.test.ts app/reportes/nuevo/actions.ts app/reportes/nuevo/actions.test.ts app/reportes/nuevo/page.tsx database/queries/reportes/nuevo/subir-imagen.ts database/queries/reportes/nuevo/index.ts
npx tsc --noEmit
```

### Regresión del SDK y pipeline real local

`lib/moderation/imagenes-reporte.integration.test.ts` queda omitido por defecto. Activación exacta, contra el stack sintético ya preparado (no inicia, resetea ni vuelve a sembrar):

```sh
MODERACION_INTEGRACION_LOCAL=1 npm test -- lib/moderation/imagenes-reporte.integration.test.ts
```

El test verifica primero el proyecto `ReportyModeracionPruebas` y puertos 55321/55322 en la configuración autorizada; captura `supabase status` programáticamente, exige API/DB exactas y solo después usa las claves locales en memoria. No lee `.env`, no imprime claves y bloquea destinos HTTP ajenos y redirecciones. Crea usuario/sesión/reporte sintéticos y usa Auth, SQL y Storage reales; únicamente Sightengine está simulado. Comprueba publicación y bytes/hash del original, miniatura real, metadatos, eliminación privada, una reserva/consumo de dos operaciones y deduplicación sin otra llamada. También comprueba REVIEW privado sin filas ni objetos públicos. Limpia exclusivamente sus usuarios, sesiones, reportes, cola, reservas y objetos en `finally`, con verificaciones de ausencia.

RED observado antes de corregir: el test unitario del formato HTTP400/JSON404 y el pipeline local fallaron porque una imagen APPROVED devolvía `publicada:false`. GREEN posterior: pipeline real publicado y deduplicado, REVIEW privado y limpieza comprobados. Las pruebas unitarias conservan los 51 casos anteriores y agregan formatos estructurados y negativos, lectura excesiva, JSON inválido, red y lectura bloqueada.

No se ejecuta build ni suite completa en esta unidad; corresponden al orquestador. ESLint enfocado conserva dos advertencias preexistentes de la página (dependencia de useEffect e img). La interfaz administrativa y autorización de sus acciones corresponden a T3. La unidad supera la recomendación de 400 líneas para mantener juntos frontera de publicación, pruebas de fallos y contrato de recuperación; no se omiten controles para reducir el diff.

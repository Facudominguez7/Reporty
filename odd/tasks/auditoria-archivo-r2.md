# Archivo histórico de auditoría en Cloudflare R2
Objetivo: mover a Cloudflare R2 los eventos de `public.audit_events` con más de 180 días, preservando trazabilidad, integridad y privacidad, sin cambiar los triggers de captura ni el comportamiento del panel. Base: `d8dbb39`. Rama: `feat/auditoria-archivo-r2`; entrega: commits por unidad de trabajo, push/PR son decisión del dueño.
Checks: `npm test` (Vitest), `npm run lint`, `npx tsc --noEmit`, `npm run build` (no es señal de calidad, `next.config.mjs` ignora ESLint y TypeScript en el build: se usa solo para detectar roturas de bundling). Migraciones: aplicar en el Supabase local (`supabase start` ya corriendo, proyecto `Reporty`) y pgTAP de `supabase/tests/`.

## Specs

S1. Dependencia y transporte (L1 §3): «Implementá una integración segura con Cloudflare R2 utilizando su API compatible con S3 y el SDK oficial de AWS para JavaScript. Dependencia prevista: `@aws-sdk/client-s3`». Región `auto`, endpoint oficial de Cloudflare, bucket privado, sin acceso público, credenciales solo server-side, «No utilizar variables `NEXT_PUBLIC_` para secretos», permisos mínimos del token, validación de configuración y conectividad, manejo de errores y reintentos controlados.

S2. Variables de entorno (L1 §3, verbatim):
```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=reporty-audit-archive
AUDIT_ARCHIVE_CRON_SECRET=
AUDIT_HOT_DAYS=180
```

S3. Retención (L1 §4): PostgreSQL conserva «los últimos 180 días»; R2 archiva «eventos con más de 180 días»; el panel mantiene filtros por usuario, acción y período; los archivos son privados y consultables por administradores autorizados; «No establecer eliminación automática de archivos históricos sin una política de conservación aprobada». La política «No aplicar esta política a `historial_estados`, `evidencias_reparacion`, `verificaciones_reparacion` ni a otras tablas de negocio».

S4. Formato (L1 §5): JSON Lines comprimido con GZIP, extensión `*.jsonl.gz`, ruta
```text
reporty-audit-archive/
  audit/
    v1/
      2026/
        11/
          audit-{primer_id}-{ultimo_id}-{hash}.jsonl.gz
```
Cada evento conserva: ID original, fecha y hora UTC, identificador del actor, identificador del reporte, título del reporte, tipo de acción y versión del formato. Compresión GZIP y hash SHA-256 de integridad. «Evitar duplicación de archivos y nombres incompatibles ante reintentos».

S5. Privacidad del bucket (L1 §3, §9): bucket privado clase Standard, sin acceso público, archivos con identificadores personales que «deben permanecer privados», sin descargas anónimas, credenciales aisladas del cliente.

S6. Proceso de archivado (L1 §6): seleccionar eventos anteriores al límite, lotes acotados, orden determinístico por fecha e ID, generar JSONL, comprimir, hash, subir, «Descargar y verificar su integridad antes de confirmar el archivado», registrar el lote en PostgreSQL, «Eliminar exclusivamente los registros confirmados y verificados». Reglas críticas verbatim: «Nunca eliminar registros antes de verificar el archivo remoto», «No confiar únicamente en el ETag de R2 como checksum», «Si falla R2, PostgreSQL conserva los eventos», «Si el proceso se interrumpe, debe poder reanudarse», «Evitar ejecuciones concurrentes sobre los mismos eventos», «Garantizar idempotencia», «No modificar los triggers existentes de captura», «No bloquear innecesariamente las operaciones normales», «Evitar archivos completos cargados en memoria si el volumen crece», «Registrar errores sin exponer datos personales ni secretos».

S7. Tabla de control (L1 §6): `audit_archives` con «Identificador del lote, Fecha de ejecución, Rango de eventos, Cantidad de registros, Primera y última fecha, Ruta del archivo R2, Tamaño comprimido, Hash SHA-256, Estado del proceso, Fecha de verificación, Fecha de eliminación de origen».

S8. Ejecución (L1 §7): «archivado programado semanal, con capacidad de ejecución manual»; elegir el mecanismo más simple y seguro disponible (en este repo no hay cron: no existe `vercel.json` ni ruta de cron); endpoint interno con runtime Node.js, autenticación por secreto, rechazo de no autorizados, métodos HTTP apropiados, sin ejecución por usuarios públicos, «No depender de una solicitud HTTP prolongada para procesar volúmenes grandes», modo `dry-run` que «permita comprobar qué registros se archivarían sin modificar ni eliminar datos». Supabase Cron + Vault queda documentado como alternativa, no aplicado.

S9. Panel (L1 §8): conservar la visualización reciente y agregar la sección «Historial archivado» con consulta de períodos archivados, «Filtrar por rango de fechas», archivos disponibles, cantidad de eventos, tamaño comprimido, «Descargar archivos de auditoría con autorización administrativa» y «Recuperar registros históricos sin restaurarlos permanentemente a la tabla principal». «Los archivos nunca deben exponerse mediante URLs públicas», «Toda consulta o descarga debe pasar por autorización del lado del servidor». Además: «Corregir también las descripciones de los nuevos eventos incorporados por las migraciones de evidencias de reparación» y usar `gentle:design` con el sistema visual existente.

S10. Seguridad (L1 §9): autorización administrativa server-side, RLS y privilegios mínimos, «Protección contra IDOR», aislamiento de credenciales, «Validación estricta de parámetros y rutas de objetos», «Ausencia de datos sensibles en logs», «Protección contra eliminación accidental», auditoría de las operaciones de archivado y recuperación «evitando ciclos recursivos de generación de eventos».

S11. Pruebas (L1 §10): unitarias y de integración para los 15 puntos enumerados (conexión/config, JSONL, gzip, SHA-256, archivado correcto, fallo de subida, fallo de verificación, interrupción entre subida y eliminación, reintentos sin duplicados, concurrencia, exclusión de recientes, recuperación histórica, autorización admin, accesos no autorizados, compatibilidad con la auditoría existente), con mocks o servicios locales, sin credenciales reales ni consumo de R2. Verificar TypeScript, ESLint, Vitest, pruebas de integración y build de producción.

S12. Despliegue (L1 §11): migraciones nuevas sin editar las aplicadas, nada destructivo en producción sin validación, orden «Implementar → Probar localmente → `dry-run` → validar almacenamiento y recuperación reales en R2 → verificar permisos y hashes → confirmar que los registros nuevos siguen ingresando». «Habilitar la eliminación automática únicamente después de comprobar el proceso completo». Primera ejecución sin elegibles es «un resultado válido, no un error».

S13. Entregables (L1 §12): cliente R2 reutilizable, servicio de archivado, servicio de recuperación, migraciones, programación automática, integración administrativa, pruebas, configuración de entorno, documentación de despliegue y recuperación ante errores, y «Métricas básicas de eventos archivados, espacio liberable y tamaño ocupado en R2».

S14. Restricción principal (L1, verbatim): «implementar una solución segura, gratuita dentro de las cuotas disponibles, mantenible e idempotente, sin perder auditoría ni alterar el comportamiento funcional de Reporty», y «No limitarse a proponer una arquitectura. Implementar el código, las migraciones y las pruebas necesarias, realizando las operaciones permitidas con las herramientas disponibles».

S15. Hechos del repositorio (verificados): `audit_events` nace en `20261027150338_admin_audit.sql` con cuatro acciones y triggers `audit_*` sobre `reportes`, `comentarios_reporte`, `votos_reparado`, `votos_no_existe`; `20261106120000_evidencia_reparacion.sql:919-923` amplía el catálogo con siete acciones `evidence_*` que el panel no describe. `audit_events` revoca todo a `service_role` salvo `select`: toda escritura nueva debe pasar por RPC `security definer`. Autorización admin única: `verificarEsAdmin` (`database/queries/admin/verificar-admin.ts:13`). No hay cron, ni `.env.example`, ni validación central de entorno. Vitest corre en `environment: "node"` con `@` y `server-only` aliasados (`vitest.config.mts`).

## Tasks

- T1 — S7, S10, S15 — migración `supabase/migrations/20261110120000_auditoria_archivo_r2.sql`: `audit_archives`, `audit_archive_claims`, RPCs `private.*` (reclamar/confirmar subida/verificar/eliminar origen/fallar/métricas/registrar evento de archivo), RLS y grants mínimos, ampliación del catálogo de acciones con `audit_archive_*`. Verificación: aplicar en Supabase local + pgTAP.
- T2 — S1, S2, S4, S5 — `lib/auditoria-archivo/`: `configuracion.ts`, `cliente-r2.ts`, `serializacion.ts`, `rutas-objeto.ts` con tests (JSONL, gzip, SHA-256, rutas, configuración, cliente).
- T3 — S6 — `lib/auditoria-archivo/servicio-archivado.ts`: reclamo, subida, verificación por descarga, purga opcional, reanudación, idempotencia, concurrencia, dry-run. Tests de los escenarios 5-11.
- T4 — S9, S10 — `lib/auditoria-archivo/servicio-recuperacion.ts` + `database/queries/admin/admin-audit-archivo.ts`: listado, filtros por rango, recuperación sin restaurar, autorización admin e IDOR. Tests 12-14.
- T5 — S8 — `app/api/cron/auditoria-archivo/route.ts` (Node runtime, Bearer con `timingSafeEqual`, GET = dry-run, POST = ejecución real) y descarga autorizada `app/api/admin/auditoria/archivo/[id]/descarga/route.ts`. Tests de autorización y métodos.
- T6 — S9 — panel: catálogo único de acciones `lib/auditoria/acciones.ts` (arregla las descripciones `evidence_*`), sección «Historial archivado» en `/admin/auditoria`, página de lote `app/admin/auditoria/archivo/[id]/page.tsx`, dry-run manual desde el panel. Tests 15 y de UI.
- T7 — S9 — `design/historial-auditoria-archivada/` con `gentle:design` y canvas abierto.
- T8 — S13 — `docs/auditoria-archivo-r2.md` (bucket, credenciales, cron semanal, runbook de recuperación y de errores, límites y cuotas) y `.env.example` sin secretos.
- T9 — S11, S12 — verificación final: `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build`.

## Log

- L1 (pedido original, verbatim): «en una rama nueva: # Implementar Cloudflare R2 para el almacenamiento histórico de auditoría en Reporty» + el pliego completo de 12 secciones transcripto en S1-S14 (contexto, investigación, integración R2, política de retención, formato, proceso de archivado, ejecución automática, integración administrativa, seguridad y privacidad, pruebas obligatorias, despliegue y validación, entregables).
- L2 (exploración): `audit_events` solo admite `select` para `service_role` y no tiene triggers propios, así que la auditoría de las operaciones de archivo se hace por RPC `security definer` sobre acciones nuevas `audit_archive_*`, sin recursión.
- L3 (decisión, programación): no hay cron en el repo (`docs/moderacion-flujo.md:35` descarta cron pagado). Se implementa un endpoint `/api/cron/auditoria-archivo` con secreto `AUDIT_ARCHIVE_CRON_SECRET` y un lote acotado por invocación; el dueño lo agenda desde Hostinger (cron del panel con `curl`) o Supabase Cron + Vault, ambas documentadas. La ejecución manual real es el mismo endpoint; el panel expone solo `dry-run`.
- L4 (decisión, purga): la eliminación de origen queda detrás de `AUDIT_ARCHIVE_PURGE_ENABLED=false` por defecto. Un lote verificado con la purga apagada queda en estado `verificado` con sus reclamos intactos y se purga en una corrida posterior, sin volver a subir el archivo.

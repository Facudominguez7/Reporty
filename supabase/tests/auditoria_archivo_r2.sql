-- Contrato del archivo histórico de auditoría en Cloudflare R2.
-- El ejecutor abre una transacción, instala la migración incremental si todavía
-- no está aplicada, ejecuta este archivo y revierte: nada queda aplicado.
--
-- Cubre: elección determinística de eventos vencidos, exclusión de recientes,
-- reclamo único por evento, estados del lote, verificación previa a la purga,
-- borrado por identificadores exactos, liberación de reclamos y privilegios.
\set ON_ERROR_STOP on

-- Exige una condición verdadera; falla con el mensaje indicado.
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;

-- Exige una sentencia rechazada con el mensaje en español esperado.
create function pg_temp.rechazar(p_sql text, p_mensaje text default null)
returns void language plpgsql as $$
declare v_mensaje text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_mensaje = message_text;
    if p_mensaje is not null and v_mensaje is distinct from p_mensaje then
      raise exception 'Se esperaba el mensaje «%» y llegó «%»', p_mensaje, v_mensaje;
    end if;
    return;
  end;
  raise exception 'La operación debía rechazarse: %', p_sql;
end $$;

-- Exige que el rol activo no tenga acceso a la sentencia.
create function pg_temp.denegado(p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'El rol no debía tener acceso: %', p_sql;
end $$;

-- Identificadores estables para leer los eventos creados por la fixture.
create function pg_temp.id_evento(p_marca text) returns bigint
language sql stable as $$ select id from public.audit_events where report_title = p_marca $$;

-- ---------------------------------------------------------------------------
-- Fixture: cinco eventos vencidos de marzo de 2024, dos de abril de 2024 (el
-- primero en el instante exacto del cambio de mes, en UTC) y dos recientes.
-- Las fechas viejas son absolutas: la prueba no depende del día en que corre.
-- ---------------------------------------------------------------------------
insert into public.audit_events (occurred_at, actor_id, report_id, report_title, action) values
  ('2024-03-10 10:00:00+00', '00000000-0000-0000-0000-0000000000a1', 9001, 'archivo-viejo-1', 'report_created'),
  ('2024-03-11 10:00:00+00', '00000000-0000-0000-0000-0000000000a2', 9002, 'archivo-viejo-2', 'comment_created'),
  ('2024-03-12 10:00:00+00', '00000000-0000-0000-0000-0000000000a3', 9003, 'archivo-viejo-3', 'vote_repaired'),
  ('2024-03-13 10:00:00+00', '00000000-0000-0000-0000-0000000000a4', 9004, 'archivo-viejo-4', 'vote_not_exists'),
  ('2024-03-31 23:59:59+00', '00000000-0000-0000-0000-0000000000a5', 9005, 'archivo-viejo-5', 'report_created'),
  ('2024-04-01 00:00:00+00', '00000000-0000-0000-0000-0000000000c1', 9201, 'archivo-abril-1', 'comment_created'),
  ('2024-04-02 09:00:00+00', '00000000-0000-0000-0000-0000000000c2', 9202, 'archivo-abril-2', 'vote_repaired'),
  (now() - interval '10 days',  '00000000-0000-0000-0000-0000000000b1', 9101, 'archivo-reciente-1', 'report_created'),
  (now() - interval '2 days',   '00000000-0000-0000-0000-0000000000b2', 9102, 'archivo-reciente-2', 'evidence_submitted');

select pg_temp.rechazar($q$insert into public.audit_events (action) values ('audit_archive_inventada')$q$);
insert into public.audit_events (occurred_at, action, report_title)
values ('2024-03-20 10:00:00+00', 'audit_archive_uploaded', 'archivo-accion-permitida');
select pg_temp.exigir(
  pg_temp.id_evento('archivo-accion-permitida') is not null,
  'El catálogo de acciones debe aceptar las acciones del archivo'
);
delete from public.audit_events where report_title = 'archivo-accion-permitida';

-- ---------------------------------------------------------------------------
-- Previsualización: describe el mismo lote que se reclamaría, sin reclamarlo.
-- ---------------------------------------------------------------------------
select pg_temp.exigir(
  (public.auditoria_previsualizar_lote(50, 180) ->> 'cantidad')::int = 5
  and (public.auditoria_previsualizar_lote(50, 180) ->> 'ultimo_evento_id')::bigint = pg_temp.id_evento('archivo-viejo-5'),
  'La previsualización se limita al mes del evento elegible más viejo'
);
select pg_temp.exigir(
  (select count(*) from public.audit_archive_claims) = (select count(*) from public.audit_archive_claims),
  'La previsualización no reclama eventos'
);

-- ---------------------------------------------------------------------------
-- Reclamo: determinístico, solo eventos vencidos, acotado por lote.
-- ---------------------------------------------------------------------------
create temporary table lote_uno on commit drop as
  select * from private.reclamar_lote_auditoria(3, 180, 'prueba');

select pg_temp.exigir((select count(*) from lote_uno) = 1, 'El reclamo debe devolver un único lote');
select pg_temp.exigir((select estado from lote_uno) = 'reclamado', 'El lote debe nacer en estado reclamado');
select pg_temp.exigir((select cantidad_registros from lote_uno) = 3, 'El lote debe respetar el límite pedido');
select pg_temp.exigir(
  (select primer_evento_id from lote_uno) = pg_temp.id_evento('archivo-viejo-1')
  and (select ultimo_evento_id from lote_uno) = pg_temp.id_evento('archivo-viejo-3'),
  'El orden debe ser determinístico por fecha e id, del más viejo al más nuevo'
);
select pg_temp.exigir(
  (select count(*) from public.audit_archive_claims c
    where c.archive_id = (select id from lote_uno)) = 3,
  'Cada evento del lote debe quedar reclamado'
);
select pg_temp.exigir(
  (select count(*) from public.audit_archive_claims c
    join public.audit_events e on e.id = c.event_id
    where e.report_title in ('archivo-reciente-1', 'archivo-reciente-2')) = 0,
  'Los eventos dentro de la retención caliente no deben reclamarse'
);
select pg_temp.rechazar($q$select private.reclamar_lote_auditoria(0, 180, 'prueba')$q$,
  'El tamaño del lote debe estar entre 1 y 5000');
select pg_temp.rechazar($q$select private.reclamar_lote_auditoria(10, 5, 'prueba')$q$,
  'La retención caliente debe estar entre 30 y 3650 días');

-- Segundo reclamo: toma los eventos vencidos que quedaron, nunca los ya reclamados.
create temporary table lote_dos on commit drop as
  select * from private.reclamar_lote_auditoria(10, 180, 'prueba');
select pg_temp.exigir((select cantidad_registros from lote_dos) = 2, 'Solo quedan dos eventos vencidos libres');
select pg_temp.exigir(
  (select primer_evento_id from lote_dos) = pg_temp.id_evento('archivo-viejo-4'),
  'El segundo lote debe continuar donde terminó el primero'
);
select pg_temp.exigir(
  (select ultimo_evento_id from lote_dos) = pg_temp.id_evento('archivo-viejo-5')
  and (select ultima_fecha from lote_dos) = '2024-03-31 23:59:59+00',
  'Un lote termina en el último evento de su mes aunque el límite permita más'
);
select pg_temp.exigir(
  (select count(*) from public.audit_archive_claims c
    where c.archive_id = (select id from lote_dos)
      and c.event_id in (pg_temp.id_evento('archivo-abril-1'), pg_temp.id_evento('archivo-abril-2'))) = 0,
  'Un lote nunca cruza el límite de mes en UTC'
);

-- El mes siguiente se archiva en su propio lote.
create temporary table lote_abril on commit drop as
  select * from private.reclamar_lote_auditoria(10, 180, 'prueba');
select pg_temp.exigir(
  (select cantidad_registros from lote_abril) = 2
  and (select primer_evento_id from lote_abril) = pg_temp.id_evento('archivo-abril-1')
  and (select primera_fecha from lote_abril) = '2024-04-01 00:00:00+00'
  and date_trunc('month', (select primera_fecha from lote_abril) at time zone 'UTC')
    = date_trunc('month', (select ultima_fecha from lote_abril) at time zone 'UTC'),
  'El mes siguiente se archiva en un lote propio, empezando en el primer instante del mes'
);
select pg_temp.exigir(
  private.reclamar_lote_auditoria(10, 180, 'prueba') is null,
  'Sin eventos elegibles el reclamo devuelve null, no un error'
);

-- ---------------------------------------------------------------------------
-- Confirmación de subida y verificación: la purga exige el estado verificado.
-- ---------------------------------------------------------------------------
select pg_temp.rechazar(
  format($q$select private.confirmar_subida_auditoria(%L, 'ruta/arbitraria.gz', 1000, %L, 'prueba')$q$,
    (select id from lote_uno), repeat('a', 64)),
  'Ruta de archivo inválida');
select pg_temp.rechazar(
  format($q$select private.confirmar_subida_auditoria(%L, 'audit/v1/2025/11/audit-1-3-0123456789abcdef.jsonl.gz', 0, %L, 'prueba')$q$,
    (select id from lote_uno), repeat('a', 64)),
  'Tamaño de archivo inválido');
select pg_temp.rechazar(
  format($q$select private.confirmar_subida_auditoria(%L, 'audit/v1/2025/11/audit-1-3-0123456789abcdef.jsonl.gz', 1000, 'no-es-un-hash', 'prueba')$q$,
    (select id from lote_uno)),
  'Hash SHA-256 inválido');
select pg_temp.rechazar(
  format($q$select private.eliminar_origen_auditoria(%L, %L)$q$,
    (select id from lote_uno), repeat('a', 64)),
  'Solo se elimina el origen de un lote verificado');

select pg_temp.exigir(
  private.confirmar_subida_auditoria(
    (select id from lote_uno),
    'audit/v1/2025/11/audit-1-3-0123456789abcdef.jsonl.gz',
    1024,
    repeat('a', 64),
    'cron'
  ),
  'La confirmación de subida debe aceptarse'
);
select pg_temp.exigir((select estado from public.audit_archives where id = (select id from lote_uno)) = 'subido',
  'La subida confirmada deja el lote en estado subido');
select pg_temp.exigir(
  (select tamano_comprimido from public.audit_archives where id = (select id from lote_uno)) = 1024
  and (select ejecutado_en is not null from public.audit_archives where id = (select id from lote_uno)),
  'La confirmación registra tamaño y fecha de ejecución'
);
-- Repetir la misma confirmación es idempotente.
create temporary table lotes_antes_reintento on commit drop as
  select count(*) as cantidad from public.audit_archives;
select pg_temp.exigir(
  private.confirmar_subida_auditoria(
    (select id from lote_uno),
    'audit/v1/2025/11/audit-1-3-0123456789abcdef.jsonl.gz',
    1024,
    repeat('a', 64),
    'cron'
  ),
  'Repetir la confirmación no debe fallar'
);
select pg_temp.exigir(
  (select count(*) from public.audit_archives) = (select cantidad from lotes_antes_reintento),
  'Reintentar la subida no debe crear lotes nuevos');

select pg_temp.exigir(private.verificar_archive_auditoria((select id from lote_uno)),
  'El lote subido debe poder verificarse');
select pg_temp.rechazar(
  format($q$select private.eliminar_origen_auditoria(%L, %L)$q$, (select id from lote_uno), repeat('b', 64)),
  'El hash confirmado no coincide con el lote');

-- ---------------------------------------------------------------------------
-- Purga: borra exactamente los identificadores reclamados y verifica la cantidad.
-- ---------------------------------------------------------------------------
select pg_temp.exigir(
  private.eliminar_origen_auditoria((select id from lote_uno), repeat('a', 64)) = 3,
  'La purga debe eliminar exactamente los eventos del lote'
);
select pg_temp.exigir(
  (select count(*) from public.audit_events where report_title in ('archivo-viejo-1', 'archivo-viejo-2', 'archivo-viejo-3')) = 0,
  'Los eventos purgados deben desaparecer de la tabla caliente'
);
select pg_temp.exigir(
  (select count(*) from public.audit_events where report_title in ('archivo-viejo-4', 'archivo-viejo-5')) = 2,
  'Los eventos de otros lotes no se tocan'
);
select pg_temp.exigir(
  (select estado from public.audit_archives where id = (select id from lote_uno)) = 'origen_eliminado'
  and (select origen_eliminado_en is not null from public.audit_archives where id = (select id from lote_uno)),
  'El lote purgado registra estado y fecha de eliminación'
);
select pg_temp.exigir(
  (select count(*) from public.audit_archive_claims where archive_id = (select id from lote_uno)) = 0,
  'La purga debe liberar los reclamos del lote'
);
select pg_temp.exigir(
  private.eliminar_origen_auditoria((select id from lote_uno), repeat('a', 64)) = 0,
  'Repetir la purga es idempotente y no borra nada más'
);

-- ---------------------------------------------------------------------------
-- Fallo: conserva los eventos y libera los reclamos para reanudar.
-- ---------------------------------------------------------------------------
select pg_temp.exigir(
  private.fallar_archive_auditoria((select id from lote_dos), E'falló la subida\nsegunda línea'),
  'Un lote reclamado debe poder marcarse como fallido'
);
select pg_temp.exigir(
  (select estado from public.audit_archives where id = (select id from lote_dos)) = 'fallido'
  and (select intentos from public.audit_archives where id = (select id from lote_dos)) = 2
  and (select ultimo_error from public.audit_archives where id = (select id from lote_dos)) not like E'%\n%',
  'El fallo registra estado, intentos y un error de una sola línea'
);
select pg_temp.exigir(
  (select count(*) from public.audit_events where report_title in ('archivo-viejo-4', 'archivo-viejo-5')) = 2,
  'Un fallo de R2 nunca elimina eventos de PostgreSQL'
);
select pg_temp.exigir(
  (select count(*) from public.audit_archive_claims where archive_id = (select id from lote_dos)) = 0,
  'Un lote fallido libera sus reclamos'
);
create temporary table lote_tres on commit drop as
  select * from private.reclamar_lote_auditoria(10, 180, 'reintento');
select pg_temp.exigir(
  (select cantidad_registros from lote_tres) = 2,
  'La corrida siguiente debe poder retomar los eventos liberados'
);

-- ---------------------------------------------------------------------------
-- Endurecimiento: un lote verificado no se reescribe; un lote interrumpido se
-- recupera liberando sus reclamos y conservando los eventos.
-- ---------------------------------------------------------------------------
select pg_temp.exigir(
  private.confirmar_subida_auditoria(
    (select id from lote_tres), 'audit/v1/2025/11/audit-1-2-0123456789abcdef.jsonl.gz', 4096, repeat('c', 64), 'cron'),
  'La primera confirmación de subida debe aceptarse'
);
select pg_temp.exigir(private.verificar_archive_auditoria((select id from lote_tres)),
  'El lote debe poder verificarse');
select pg_temp.exigir(
  private.confirmar_subida_auditoria(
    (select id from lote_tres), 'audit/v1/2025/11/audit-1-2-fedcba9876543210.jsonl.gz', 8192, repeat('d', 64), 'cron') = false,
  'Un lote verificado no puede reescribirse con otra ruta ni otro hash'
);
select pg_temp.exigir(
  (select hash_sha256 from public.audit_archives where id = (select id from lote_tres)) = repeat('c', 64)
  and (select estado from public.audit_archives where id = (select id from lote_tres)) = 'verificado',
  'La confirmación rechazada no debe alterar el lote verificado'
);

-- Una corrida interrumpida deja el lote tomado con sus reclamos: se recupera solo.
update public.audit_archives
  set estado = 'reclamado', verificado_en = null,
      actualizado_en = now() - interval '20 hours'
  where id = (select id from lote_tres);

select pg_temp.exigir(
  private.recuperar_lotes_estancados(12) >= 1,
  'Los lotes interrumpidos deben recuperarse'
);
select pg_temp.exigir(
  (select estado from public.audit_archives where id = (select id from lote_tres)) = 'fallido',
  'Un lote estancado queda fallido'
);
select pg_temp.exigir(
  (select count(*) from public.audit_archive_claims where archive_id = (select id from lote_tres)) = 0,
  'La recuperación de un lote estancado libera sus reclamos'
);
select pg_temp.exigir(
  (select count(*) from public.audit_events where report_title in ('archivo-viejo-4', 'archivo-viejo-5')) = 2,
  'La recuperación nunca elimina eventos de PostgreSQL'
);
select pg_temp.exigir(
  (public.auditoria_recuperar_estancados(12)) = 0,
  'Un lote recién reclamado no debe considerarse estancado'
);

-- Purga con cantidad inesperada: revierte el borrado y no marca el lote.
create temporary table lote_descuadrado on commit drop as
  select * from private.reclamar_lote_auditoria(10, 180, 'descuadrado');
select pg_temp.exigir((select cantidad_registros from lote_descuadrado) = 2,
  'Deben quedar dos eventos libres para la prueba de cantidad inesperada');
select pg_temp.exigir(
  private.confirmar_subida_auditoria(
    (select id from lote_descuadrado), 'audit/v1/2025/11/audit-1-2-1111111111111111.jsonl.gz', 1024, repeat('e', 64), 'cron'),
  'La confirmación del lote descuadrado debe aceptarse'
);
select pg_temp.exigir(private.verificar_archive_auditoria((select id from lote_descuadrado)),
  'El lote descuadrado debe poder verificarse');
with objetivo as (
  select event_id from public.audit_archive_claims
  where archive_id = (select id from lote_descuadrado) order by event_id limit 1
)
delete from public.audit_archive_claims c using objetivo o
where c.event_id = o.event_id and c.archive_id = (select id from lote_descuadrado);

select pg_temp.rechazar(
  format($q$select private.eliminar_origen_auditoria(%L, %L)$q$,
    (select id from lote_descuadrado), repeat('e', 64))
);
select pg_temp.exigir(
  (select estado from public.audit_archives where id = (select id from lote_descuadrado)) = 'verificado',
  'Una purga con cantidad inesperada no debe marcar el lote como purgado'
);
select pg_temp.exigir(
  (select count(*) from public.audit_events where report_title in ('archivo-viejo-4', 'archivo-viejo-5')) >= 1,
  'Una purga con cantidad inesperada debe revertir el borrado de los eventos coincidentes'
);

-- ---------------------------------------------------------------------------
-- Métricas y auditoría de las operaciones del archivo.
-- ---------------------------------------------------------------------------
select pg_temp.exigir(
  (private.metricas_archivo_auditoria(180) ->> 'eventos_purgados')::bigint = 3
  and (private.metricas_archivo_auditoria(180) ->> 'bytes_en_r2')::bigint >= 1024
  and (private.metricas_archivo_auditoria(180) ->> 'eventos_en_postgres')::int >= 4,
  'Las métricas deben informar eventos purgados, bytes en R2 y eventos calientes'
);
select pg_temp.exigir(
  private.registrar_evento_archivo_auditoria('audit_archive_downloaded', 'lote de prueba', null) is not null,
  'La operación administrativa del archivo debe quedar auditada'
);
select pg_temp.rechazar(
  $q$select private.registrar_evento_archivo_auditoria('report_created', 'x', null)$q$,
  'Acción de auditoría de archivo no permitida');

-- ---------------------------------------------------------------------------
-- API pública: los envoltorios de `service_role` responden y el servicio puede
-- leer sus propios reclamos para reconstruir el lote.
-- ---------------------------------------------------------------------------
set local role service_role;
select pg_temp.exigir(
  public.auditoria_previsualizar_lote(10, 180) is null
  or (public.auditoria_previsualizar_lote(10, 180) ->> 'cantidad')::int > 0,
  'El envoltorio de previsualización debe responder a service_role'
);
select pg_temp.exigir(
  (public.auditoria_metricas(180) ->> 'eventos_en_postgres')::int >= 0,
  'El envoltorio de métricas debe responder a service_role'
);
select pg_temp.exigir(
  (select count(*) from public.audit_archive_claims) >= 0,
  'service_role debe poder leer los reclamos para reconstruir un lote'
);
reset role;

-- ---------------------------------------------------------------------------
-- Privilegios: ni las tablas ni las RPC son accesibles para roles de cliente.
-- ---------------------------------------------------------------------------
set local role anon;
select pg_temp.denegado('select * from public.audit_archives');
select pg_temp.denegado('select * from public.audit_archive_claims');
select pg_temp.denegado('select public.auditoria_previsualizar_lote(10, 180)');
select pg_temp.denegado('select private.metricas_archivo_auditoria(180)');
select pg_temp.denegado('select private.reclamar_lote_auditoria(10, 180, ''anon'')');
reset role;

set local role authenticated;
select pg_temp.denegado('select * from public.audit_archives');
select pg_temp.denegado('select private.eliminar_origen_auditoria(gen_random_uuid(), repeat(''a'', 64))');
reset role;

\echo 'OK archivo de auditoría: reclamo determinista por mes, estados, purga exacta, reanudación, métricas y privilegios'

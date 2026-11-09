-- Archivo histórico de auditoría en Cloudflare R2.
--
-- Retención caliente: `public.audit_events` conserva los últimos AUDIT_HOT_DAYS
-- (180 por defecto) y el resto se archiva en un bucket privado como JSON Lines
-- comprimido con GZIP. Este archivo agrega solo estructura nueva: no toca los
-- triggers de captura, ni las políticas RLS, ni los privilegios de
-- `public.audit_events`.
--
-- El proceso es reanudable e idempotente porque cada evento reclamado tiene una
-- fila en `public.audit_archive_claims` (clave primaria por `event_id`): un
-- evento reclamado por un lote en curso no se puede reclamar dos veces, y un
-- lote fallido libera sus reclamos para que la próxima corrida lo retome.

-- ============================================================================
-- Lotes de archivo
-- ============================================================================

create table public.audit_archives (
  id uuid primary key default gen_random_uuid(),
  -- reclamado -> subido -> verificado -> origen_eliminado; `fallido` libera reclamos.
  estado text not null default 'reclamado'
    check (estado in ('reclamado', 'subido', 'verificado', 'origen_eliminado', 'fallido')),
  -- Quién disparó la corrida: `cron`, `manual` o el identificador de quien la pidió.
  ejecutor text check (ejecutor is null or char_length(ejecutor) <= 100),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Fecha de ejecución del lote: se fija cuando la subida quedó confirmada.
  ejecutado_en timestamptz,
  primer_evento_id bigint not null,
  ultimo_evento_id bigint not null,
  cantidad_registros integer not null check (cantidad_registros > 0),
  primera_fecha timestamptz not null,
  ultima_fecha timestamptz not null,
  -- Ruta del objeto en el bucket privado; la forma se validó para impedir rutas arbitrarias.
  ruta_objeto text check (
    ruta_objeto is null
    or ruta_objeto ~ '^audit/v1/[0-9]{4}/[0-9]{2}/audit-[0-9]+-[0-9]+-[a-f0-9]{16}\.jsonl\.gz$'
  ),
  tamano_comprimido bigint check (tamano_comprimido is null or (tamano_comprimido > 0 and tamano_comprimido <= 1073741824)),
  hash_sha256 text check (hash_sha256 is null or hash_sha256 ~ '^[a-f0-9]{64}$'),
  verificado_en timestamptz,
  origen_eliminado_en timestamptz,
  intentos integer not null default 1 check (intentos between 1 and 100),
  -- Mensaje operativo del último fallo, sin datos personales ni secretos.
  ultimo_error text check (ultimo_error is null or char_length(ultimo_error) <= 500),
  constraint audit_archives_rango_check check (primer_evento_id <= ultimo_evento_id),
  constraint audit_archives_fechas_check check (primera_fecha <= ultima_fecha),
  -- La ruta, el tamaño y el hash existen juntos o no existen: una subida a medias no se confirma.
  constraint audit_archives_subida_completa check (
    (ruta_objeto is null and tamano_comprimido is null and hash_sha256 is null)
    or (ruta_objeto is not null and tamano_comprimido is not null and hash_sha256 is not null)
  ),
  constraint audit_archives_verificado_check check (estado <> 'verificado' or verificado_en is not null),
  constraint audit_archives_eliminado_check check (estado <> 'origen_eliminado' or origen_eliminado_en is not null)
);

create index audit_archives_periodo_idx on public.audit_archives (primera_fecha, ultima_fecha);
create index audit_archives_estado_idx on public.audit_archives (estado, creado_en desc);

-- Un evento reclamado por un lote en curso no puede reclamarse otra vez.
create table public.audit_archive_claims (
  event_id bigint primary key,
  archive_id uuid not null references public.audit_archives (id) on delete cascade,
  reclamado_en timestamptz not null default now()
);

create index audit_archive_claims_archive_idx on public.audit_archive_claims (archive_id);

alter table public.audit_archives enable row level security;
alter table public.audit_archive_claims enable row level security;

-- Privilegios mínimos: lectura del catálogo de lotes para el panel (con el cliente
-- de servicio después de validar el rol) y nada de escritura directa. Toda mutación
-- pasa por las RPC privadas de más abajo.
revoke all on public.audit_archives from public, anon, authenticated, service_role;
revoke all on public.audit_archive_claims from public, anon, authenticated, service_role;
grant select on public.audit_archives to service_role;

comment on table public.audit_archives is
'Lotes de auditoría archivados en Cloudflare R2: rango de eventos, ruta privada, hash de integridad y estado del proceso.';
comment on table public.audit_archive_claims is
'Reclamo por evento: impide que dos corridas archiven el mismo evento y habilita reanudar lotes fallidos.';

-- ============================================================================
-- Catálogo de acciones: operaciones administrativas del archivo de auditoría
-- ============================================================================

-- `audit_events` no tiene triggers propios, así que registrar estas acciones no
-- genera ciclos recursivos de auditoría.
alter table public.audit_events drop constraint audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (action in (
  'report_created', 'comment_created', 'vote_repaired', 'vote_not_exists',
  'evidence_submitted', 'evidence_confirmed', 'evidence_challenged',
  'evidence_challenge_resolved', 'evidence_approved', 'evidence_rejected', 'evidence_reverted',
  'audit_archive_uploaded', 'audit_archive_verified', 'audit_archive_purged', 'audit_archive_downloaded'));

-- ============================================================================
-- RPC: reclamar un lote acotado de eventos vencidos
-- ============================================================================

create or replace function private.reclamar_lote_auditoria(
  p_limite integer,
  p_dias_retencion integer,
  p_ejecutor text
) returns public.audit_archives
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archivo public.audit_archives;
begin
  if p_limite is null or p_limite < 1 or p_limite > 5000 then
    raise exception 'El tamaño del lote debe estar entre 1 y 5000';
  end if;
  if p_dias_retencion is null or p_dias_retencion < 30 or p_dias_retencion > 3650 then
    raise exception 'La retención caliente debe estar entre 30 y 3650 días';
  end if;

  -- Serializa las corridas concurrentes: la segunda no reclama nada y no falla.
  if not pg_try_advisory_xact_lock(hashtext('reporty:auditoria:archivo')) then
    return null;
  end if;

  with candidatos as materialized (
    select e.id, e.occurred_at
    from public.audit_events e
    where e.occurred_at < now() - make_interval(days => p_dias_retencion)
      and not exists (
        select 1 from public.audit_archive_claims c where c.event_id = e.id
      )
    order by e.occurred_at asc, e.id asc
    limit p_limite
  ), creado as (
    insert into public.audit_archives (
      primer_evento_id, ultimo_evento_id, cantidad_registros, primera_fecha, ultima_fecha, ejecutor
    )
    select min(id), max(id), count(*)::integer, min(occurred_at), max(occurred_at),
           left(coalesce(p_ejecutor, 'desconocido'), 100)
    from candidatos
    having count(*) > 0
    returning *
  ), reclamados as (
    insert into public.audit_archive_claims (archive_id, event_id)
    select creado.id, candidatos.id
    from creado cross join candidatos
    on conflict (event_id) do nothing
    returning event_id
  )
  select * into v_archivo from creado;

  return v_archivo;
end;
$$;

comment on function private.reclamar_lote_auditoria(integer, integer, text) is
'Reclama hasta p_limite eventos más viejos que p_dias_retencion, en orden determinístico por fecha e id, y devuelve el lote creado (null si no hay elegibles o si otra corrida tiene el bloqueo).';

-- ============================================================================
-- RPC: confirmar la subida (todavía sin verificar)
-- ============================================================================

create or replace function private.confirmar_subida_auditoria(
  p_archive_id uuid,
  p_ruta text,
  p_tamano bigint,
  p_hash text,
  p_ejecutor text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmado boolean := false;
begin
  if p_ruta is null or p_ruta !~ '^audit/v1/[0-9]{4}/[0-9]{2}/audit-[0-9]+-[0-9]+-[a-f0-9]{16}\.jsonl\.gz$' then
    raise exception 'Ruta de archivo inválida';
  end if;
  if p_tamano is null or p_tamano < 1 or p_tamano > 1073741824 then
    raise exception 'Tamaño de archivo inválido';
  end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Hash SHA-256 inválido';
  end if;

  update public.audit_archives
    set estado = case when estado = 'reclamado' then 'subido' else estado end,
        ruta_objeto = p_ruta,
        tamano_comprimido = p_tamano,
        hash_sha256 = p_hash,
        ejecutado_en = coalesce(ejecutado_en, now()),
        ejecutor = coalesce(left(p_ejecutor, 100), ejecutor),
        actualizado_en = now()
  where id = p_archive_id
    and estado in ('reclamado', 'subido', 'verificado')
  returning true into v_confirmado;

  return coalesce(v_confirmado, false);
end;
$$;

comment on function private.confirmar_subida_auditoria(uuid, text, bigint, text, text) is
'Registra la ruta, el tamaño y el hash del objeto subido. Repetir la misma confirmación no cambia el estado.';

-- ============================================================================
-- RPC: marcar el lote como verificado después de releerlo desde R2
-- ============================================================================

create or replace function private.verificar_archive_auditoria(p_archive_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verificado boolean := false;
begin
  update public.audit_archives
    set estado = 'verificado',
        verificado_en = coalesce(verificado_en, now()),
        actualizado_en = now()
  where id = p_archive_id
    and estado in ('subido', 'verificado')
  returning true into v_verificado;

  return coalesce(v_verificado, false);
end;
$$;

comment on function private.verificar_archive_auditoria(uuid) is
'Marca el lote como verificado: solo se llama después de descargar el objeto y comprobar su hash de extremo a extremo.';

-- ============================================================================
-- RPC: eliminar el origen, exclusivamente para un lote verificado
-- ============================================================================

create or replace function private.eliminar_origen_auditoria(
  p_archive_id uuid,
  p_hash text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archivo public.audit_archives;
  v_borrados integer := 0;
begin
  select * into v_archivo from public.audit_archives where id = p_archive_id for update;
  if v_archivo.id is null then
    raise exception 'El lote de archivo no existe';
  end if;
  -- Idempotencia: repetir la purga de un lote ya purgado no hace nada.
  if v_archivo.estado = 'origen_eliminado' then
    return 0;
  end if;
  if v_archivo.estado <> 'verificado' then
    raise exception 'Solo se elimina el origen de un lote verificado';
  end if;
  if p_hash is null or p_hash is distinct from v_archivo.hash_sha256 then
    raise exception 'El hash confirmado no coincide con el lote';
  end if;

  -- Se borran los identificadores exactos reclamados por este lote, nunca un rango de fechas.
  delete from public.audit_events e
  using public.audit_archive_claims c
  where c.archive_id = v_archivo.id
    and e.id = c.event_id;
  get diagnostics v_borrados = row_count;

  if v_borrados <> v_archivo.cantidad_registros then
    raise exception 'Se esperaban % eventos y se eliminaron %', v_archivo.cantidad_registros, v_borrados;
  end if;

  delete from public.audit_archive_claims where archive_id = v_archivo.id;
  update public.audit_archives
    set estado = 'origen_eliminado',
        origen_eliminado_en = now(),
        actualizado_en = now()
  where id = v_archivo.id;

  return v_borrados;
end;
$$;

comment on function private.eliminar_origen_auditoria(uuid, text) is
'Elimina de public.audit_events exactamente los eventos reclamados por un lote verificado cuyo hash coincide. Si la cantidad no coincide, revierte todo.';

-- ============================================================================
-- RPC: liberar un lote fallido para poder reanudarlo
-- ============================================================================

create or replace function private.fallar_archive_auditoria(
  p_archive_id uuid,
  p_error text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marcado boolean := false;
begin
  update public.audit_archives
    set estado = 'fallido',
        intentos = least(intentos + 1, 100),
        ultimo_error = left(regexp_replace(coalesce(p_error, 'error desconocido'), '[[:cntrl:]]+', ' ', 'g'), 500),
        actualizado_en = now()
  where id = p_archive_id
    and estado in ('reclamado', 'subido', 'verificado')
  returning true into v_marcado;

  -- Los eventos vuelven a ser elegibles: PostgreSQL los conserva.
  delete from public.audit_archive_claims where archive_id = p_archive_id;

  return coalesce(v_marcado, false);
end;
$$;

comment on function private.fallar_archive_auditoria(uuid, text) is
'Marca el lote como fallido, guarda un error operativo acotado y libera los reclamos para reanudar en la próxima corrida.';

-- ============================================================================
-- RPC: métricas del archivo
-- ============================================================================

create or replace function private.metricas_archivo_auditoria(p_dias_retencion integer)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lotes', (select count(*) from public.audit_archives),
    'lotes_fallidos', (select count(*) from public.audit_archives where estado = 'fallido'),
    'lotes_pendientes_purga', (select count(*) from public.audit_archives where estado = 'verificado'),
    'eventos_archivados', (select coalesce(sum(cantidad_registros), 0)::bigint
      from public.audit_archives where estado in ('verificado', 'origen_eliminado')),
    'eventos_purgados', (select coalesce(sum(cantidad_registros), 0)::bigint
      from public.audit_archives where estado = 'origen_eliminado'),
    'bytes_en_r2', (select coalesce(sum(tamano_comprimido), 0)::bigint
      from public.audit_archives where estado in ('subido', 'verificado', 'origen_eliminado')),
    'elegibles', (select count(*) from public.audit_events e
      where e.occurred_at < now() - make_interval(days => greatest(coalesce(p_dias_retencion, 180), 30))
        and not exists (select 1 from public.audit_archive_claims c where c.event_id = e.id)),
    'eventos_en_postgres', (select count(*) from public.audit_events),
    'espacio_tabla_bytes', pg_total_relation_size('public.audit_events')
  );
$$;

comment on function private.metricas_archivo_auditoria(integer) is
'Métricas básicas del archivo de auditoría: eventos archivados, bytes en R2, elegibles pendientes y tamaño de la tabla caliente.';

-- ============================================================================
-- RPC: auditar las operaciones administrativas del archivo
-- ============================================================================

create or replace function private.registrar_evento_archivo_auditoria(
  p_accion text,
  p_detalle text,
  p_actor uuid
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_accion is null or p_accion not in (
    'audit_archive_uploaded', 'audit_archive_verified',
    'audit_archive_purged', 'audit_archive_downloaded'
  ) then
    raise exception 'Acción de auditoría de archivo no permitida';
  end if;

  insert into public.audit_events (actor_id, action, report_title)
  values (p_actor, p_accion, nullif(left(coalesce(p_detalle, ''), 200), ''))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function private.registrar_evento_archivo_auditoria(text, text, uuid) is
'Registra en public.audit_events una operación administrativa del archivo. `report_title` lleva un detalle neutro (identificador del lote), sin datos personales.';

-- ============================================================================
-- Privilegios: RPC reservadas a service_role
-- ============================================================================

revoke all on function private.reclamar_lote_auditoria(integer, integer, text),
  private.confirmar_subida_auditoria(uuid, text, bigint, text, text),
  private.verificar_archive_auditoria(uuid),
  private.eliminar_origen_auditoria(uuid, text),
  private.fallar_archive_auditoria(uuid, text),
  private.metricas_archivo_auditoria(integer),
  private.registrar_evento_archivo_auditoria(text, text, uuid)
  from public, anon, authenticated;

grant execute on function private.reclamar_lote_auditoria(integer, integer, text),
  private.confirmar_subida_auditoria(uuid, text, bigint, text, text),
  private.verificar_archive_auditoria(uuid),
  private.eliminar_origen_auditoria(uuid, text),
  private.fallar_archive_auditoria(uuid, text),
  private.metricas_archivo_auditoria(integer),
  private.registrar_evento_archivo_auditoria(text, text, uuid)
  to service_role;

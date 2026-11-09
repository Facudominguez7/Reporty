-- API del archivo histórico de auditoría para el servidor.
--
-- PostgREST solo expone el esquema `public`, así que las RPC de implementación
-- viven en `private` y acá se publican envoltorios mínimos, ejecutables
-- únicamente por `service_role`. Ningún rol de cliente (`anon`, `authenticated`)
-- puede reclamar, subir, verificar ni purgar lotes.

create or replace function public.auditoria_reclamar_lote(
  p_limite integer,
  p_dias_retencion integer,
  p_ejecutor text
) returns public.audit_archives
language sql
security definer
set search_path = ''
as $$
  select private.reclamar_lote_auditoria(p_limite, p_dias_retencion, p_ejecutor);
$$;

create or replace function public.auditoria_confirmar_subida(
  p_archive_id uuid,
  p_ruta text,
  p_tamano bigint,
  p_hash text,
  p_ejecutor text
) returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.confirmar_subida_auditoria(p_archive_id, p_ruta, p_tamano, p_hash, p_ejecutor);
$$;

create or replace function public.auditoria_verificar_lote(p_archive_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.verificar_archive_auditoria(p_archive_id);
$$;

create or replace function public.auditoria_eliminar_origen(p_archive_id uuid, p_hash text)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.eliminar_origen_auditoria(p_archive_id, p_hash);
$$;

create or replace function public.auditoria_fallar_lote(p_archive_id uuid, p_error text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.fallar_archive_auditoria(p_archive_id, p_error);
$$;

create or replace function public.auditoria_metricas(p_dias_retencion integer default 180)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.metricas_archivo_auditoria(p_dias_retencion);
$$;

create or replace function public.auditoria_registrar_evento(
  p_accion text,
  p_detalle text,
  p_actor uuid
) returns bigint
language sql
security definer
set search_path = ''
as $$
  select private.registrar_evento_archivo_auditoria(p_accion, p_detalle, p_actor);
$$;

-- Previsualización del `dry-run`: qué se archivaría, sin reclamar ni modificar nada.
create or replace function public.auditoria_previsualizar_lote(
  p_limite integer,
  p_dias_retencion integer
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  with candidatos as materialized (
    select e.id, e.occurred_at
    from public.audit_events e
    where e.occurred_at < now() - make_interval(
        days => greatest(coalesce(p_dias_retencion, 180), 30))
      and not exists (
        select 1 from public.audit_archive_claims c where c.event_id = e.id
      )
    order by e.occurred_at asc, e.id asc
    limit least(greatest(coalesce(p_limite, 1000), 1), 5000)
  )
  select case when count(*) = 0 then null else jsonb_build_object(
    'cantidad', count(*),
    'primer_evento_id', min(id),
    'ultimo_evento_id', max(id),
    'primera_fecha', min(occurred_at),
    'ultima_fecha', max(occurred_at)
  ) end
  from candidatos;
$$;

-- El servicio lee los reclamos para reconstruir los eventos de un lote por
-- identificadores exactos. Sin este permiso el archivado no puede leer su propio lote.
grant select on public.audit_archive_claims to service_role;

comment on function public.auditoria_previsualizar_lote(integer, integer) is
'Describe el próximo lote archivable sin reclamarlo: cantidad, rango de eventos y rango de fechas.';

revoke all on function public.auditoria_reclamar_lote(integer, integer, text),
  public.auditoria_confirmar_subida(uuid, text, bigint, text, text),
  public.auditoria_verificar_lote(uuid),
  public.auditoria_eliminar_origen(uuid, text),
  public.auditoria_fallar_lote(uuid, text),
  public.auditoria_metricas(integer),
  public.auditoria_registrar_evento(text, text, uuid),
  public.auditoria_previsualizar_lote(integer, integer)
  from public, anon, authenticated;

grant execute on function public.auditoria_reclamar_lote(integer, integer, text),
  public.auditoria_confirmar_subida(uuid, text, bigint, text, text),
  public.auditoria_verificar_lote(uuid),
  public.auditoria_eliminar_origen(uuid, text),
  public.auditoria_fallar_lote(uuid, text),
  public.auditoria_metricas(integer),
  public.auditoria_registrar_evento(text, text, uuid),
  public.auditoria_previsualizar_lote(integer, integer)
  to service_role;

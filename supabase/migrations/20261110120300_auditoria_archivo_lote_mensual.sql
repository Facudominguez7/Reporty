-- Lotes de archivo acotados a un mes calendario (UTC).
--
-- La ruta del objeto se arma con el año y el mes del primer evento del lote
-- (`audit/v1/AAAA/MM/...`). Si un lote cruzaba meses, sus eventos posteriores
-- quedaban en la carpeta de un mes que no era el suyo. Desde esta migración el
-- reclamo y la previsualización toman eventos de un único mes: el del evento
-- elegible más viejo. El mes siguiente se archiva en la corrida siguiente.
--
-- No cambia el formato, ni los estados, ni los lotes ya archivados.

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
  v_limite_retencion timestamptz;
  v_mas_viejo timestamptz;
  v_inicio_mes timestamptz;
  v_fin_mes timestamptz;
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

  v_limite_retencion := now() - make_interval(days => p_dias_retencion);

  select e.occurred_at into v_mas_viejo
  from public.audit_events e
  where e.occurred_at < v_limite_retencion
    and not exists (select 1 from public.audit_archive_claims c where c.event_id = e.id)
  order by e.occurred_at asc, e.id asc
  limit 1;

  if v_mas_viejo is null then
    return null;
  end if;

  -- Mes calendario en UTC, el mismo que usa la ruta del objeto.
  v_inicio_mes := date_trunc('month', v_mas_viejo at time zone 'UTC') at time zone 'UTC';
  v_fin_mes := (date_trunc('month', v_mas_viejo at time zone 'UTC') + interval '1 month') at time zone 'UTC';

  with candidatos as materialized (
    select e.id, e.occurred_at
    from public.audit_events e
    where e.occurred_at < v_limite_retencion
      and e.occurred_at >= v_inicio_mes
      and e.occurred_at < v_fin_mes
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
'Reclama hasta p_limite eventos más viejos que p_dias_retencion, todos del mismo mes calendario UTC (el del evento elegible más viejo), en orden por fecha e id. Devuelve null si no hay elegibles o si otra corrida tiene el bloqueo.';

create or replace function public.auditoria_previsualizar_lote(
  p_limite integer,
  p_dias_retencion integer
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  with limite as (
    select now() - make_interval(days => greatest(coalesce(p_dias_retencion, 180), 30)) as retencion
  ), mas_viejo as (
    select e.occurred_at
    from public.audit_events e, limite l
    where e.occurred_at < l.retencion
      and not exists (select 1 from public.audit_archive_claims c where c.event_id = e.id)
    order by e.occurred_at asc, e.id asc
    limit 1
  ), mes as (
    select date_trunc('month', occurred_at at time zone 'UTC') at time zone 'UTC' as inicio,
           (date_trunc('month', occurred_at at time zone 'UTC') + interval '1 month') at time zone 'UTC' as fin
    from mas_viejo
  ), candidatos as materialized (
    select e.id, e.occurred_at
    from public.audit_events e, limite l, mes m
    where e.occurred_at < l.retencion
      and e.occurred_at >= m.inicio
      and e.occurred_at < m.fin
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

comment on function public.auditoria_previsualizar_lote(integer, integer) is
'Describe el próximo lote archivable sin reclamarlo: mismo corte por mes calendario UTC que el reclamo.';

revoke all on function public.auditoria_previsualizar_lote(integer, integer) from public, anon, authenticated;
grant execute on function public.auditoria_previsualizar_lote(integer, integer) to service_role;

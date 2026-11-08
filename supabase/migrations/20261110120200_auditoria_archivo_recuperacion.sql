-- Endurecimiento del archivo de auditoría en R2 tras la verificación independiente.
--
-- 1. La confirmación de subida ya no puede reescribir la ruta ni el hash de un
--    lote verificado: la integridad deja de depender de que el llamador respete
--    el protocolo.
-- 2. Una corrida interrumpida deja el lote en `reclamado` o `subido` con sus
--    reclamos tomados. La recuperación de lotes estancados los marca `fallido` y
--    libera los reclamos, así el trabajo se reanuda sin intervención manual.

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
        ejecutor = coalesce(nullif(left(coalesce(p_ejecutor, ''), 100), ''), ejecutor),
        actualizado_en = now()
  where id = p_archive_id
    and (
      -- Primera confirmación del lote reclamado.
      estado = 'reclamado'
      -- Reintento idempotente de la misma subida.
      or (estado = 'subido' and ruta_objeto = p_ruta and hash_sha256 = p_hash)
    )
  returning true into v_confirmado;

  return coalesce(v_confirmado, false);
end;
$$;

comment on function private.confirmar_subida_auditoria(uuid, text, bigint, text, text) is
'Registra la ruta, el tamaño y el hash de la primera subida y acepta solo repeticiones idénticas mientras el lote no esté verificado.';

-- ============================================================================
-- RPC: recuperar lotes estancados
-- ============================================================================

create or replace function private.recuperar_lotes_estancados(p_horas integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recuperados integer := 0;
begin
  if p_horas is null or p_horas < 1 or p_horas > 168 then
    raise exception 'La antigüedad para lotes estancados debe estar entre 1 y 168 horas';
  end if;

  with estancados as (
    update public.audit_archives
      set estado = 'fallido',
          intentos = least(intentos + 1, 100),
          ultimo_error = 'Lote estancado: la corrida no terminó en ' || p_horas || ' horas',
          actualizado_en = now()
    where estado in ('reclamado', 'subido')
      and actualizado_en < now() - make_interval(hours => p_horas)
    returning id
  ), liberados as (
    delete from public.audit_archive_claims c
    using estancados e
    where c.archive_id = e.id
    returning c.event_id
  )
  select count(*) into v_recuperados from estancados;

  return v_recuperados;
end;
$$;

comment on function private.recuperar_lotes_estancados(integer) is
'Marca fallidos los lotes reclamados o subidos que quedaron sin avanzar y libera sus reclamos para que la próxima corrida los retome.';

create or replace function public.auditoria_recuperar_estancados(p_horas integer default 12)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.recuperar_lotes_estancados(p_horas);
$$;

comment on function public.auditoria_recuperar_estancados(integer) is
'Recupera lotes de archivo interrumpidos: los marca fallidos y libera los eventos reclamados.';

revoke all on function private.recuperar_lotes_estancados(integer),
  public.auditoria_recuperar_estancados(integer)
  from public, anon, authenticated;

grant execute on function private.recuperar_lotes_estancados(integer),
  public.auditoria_recuperar_estancados(integer)
  to service_role;

-- Registro durable de la cancelación al aceptar una impugnación (S7).
-- La actividad, la evidencia y la auditoría comparten la transacción del RPC;
-- una resolución repetida nunca escribe una segunda actividad.

-- Resolución administrativa de una impugnación: aceptarla rechaza la evidencia;
-- descartarla reevalúa el umbral de confirmaciones (S5, S8).
create or replace function public.resolver_impugnacion_reparacion(
  p_verificacion_id uuid, p_administrador_id uuid, p_decision text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_reporte bigint; v_evidencia uuid; v_tipo text; v_estado_verificacion text;
  v_reporte_estado integer; v_evidencia_estado text;
  v_confirmaciones integer; v_impugnaciones integer; v_pendientes integer;
  v_cerrado boolean := false; v_repetida boolean := false;
begin
  if p_verificacion_id is null or p_administrador_id is null or p_decision is null
    or p_decision not in ('aceptada','descartada') then
    raise exception using errcode = 'PRE11', message = 'Resolución de impugnación inválida';
  end if;
  select e.reporte_id into v_reporte from public.verificaciones_reparacion v
    join public.evidencias_reparacion e on e.id = v.evidencia_id where v.id = p_verificacion_id;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Impugnación no disponible';
  end if;
  -- Orden de bloqueo fijo: reporte, evidencia, verificación.
  select estado_id into v_reporte_estado from public.reportes
    where id = v_reporte and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Reporte no disponible para resolver la impugnación';
  end if;
  select evidencia_id, tipo, estado into v_evidencia, v_tipo, v_estado_verificacion
    from public.verificaciones_reparacion where id = p_verificacion_id for update;
  select estado into v_evidencia_estado from public.evidencias_reparacion
    where id = v_evidencia for update;
  if v_tipo <> 'impugnacion' then
    raise exception using errcode = 'PRE07', message = 'La verificación indicada no es una impugnación';
  end if;
  if not private.es_administrador(p_administrador_id) then
    raise exception using errcode = 'PRE08', message = 'Administrador no autorizado';
  end if;
  if v_estado_verificacion <> 'pendiente' then
    if v_estado_verificacion = p_decision then
      v_repetida := true;
    else
      raise exception using errcode = 'PRE07', message = 'La impugnación ya fue resuelta';
    end if;
  else
    update public.verificaciones_reparacion set estado = p_decision,
      resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
      motivo_resolucion = nullif(btrim(coalesce(p_motivo,'')),'')
      where id = p_verificacion_id;
    if p_decision = 'aceptada' then
      if v_evidencia_estado <> 'en_verificacion' then
        raise exception using errcode = 'PRE09', message = 'La evidencia ya fue resuelta';
      end if;
      update public.evidencias_reparacion set estado = 'rechazada',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(nullif(btrim(coalesce(p_motivo,'')),''),
          'Impugnación aceptada por administración')
        where id = v_evidencia and estado = 'en_verificacion';
      v_evidencia_estado := 'rechazada';
      -- La actividad se registra sin cambiar el estado y dentro de la transacción.
      insert into public.historial_estados(reporte_id, estado_anterior_id, estado_nuevo_id, usuario_id, comentario)
      values (v_reporte, v_reporte_estado, v_reporte_estado, p_administrador_id,
        case when nullif(btrim(coalesce(p_motivo,'')),'') is null then
          'Administración aceptó la impugnación y canceló la revisión de reparado.'
        else
          'Administración aceptó la impugnación y canceló la revisión de reparado. Motivo: ' || btrim(p_motivo)
        end);
    end if;
    perform private.registrar_auditoria_evidencia(
      'evidence_challenge_resolved', p_administrador_id, v_reporte);
  end if;
  select (r->>'confirmaciones')::integer, (r->>'impugnaciones')::integer,
         (r->>'impugnaciones_pendientes')::integer
    into v_confirmaciones, v_impugnaciones, v_pendientes
    from (select private.resumen_verificaciones(v_evidencia) as r) s;
  -- Al descartar la impugnación, la reparación puede alcanzar el umbral.
  if not v_repetida and v_evidencia_estado = 'en_verificacion' and v_pendientes = 0
    and v_confirmaciones >= public.umbral_confirmaciones_reparacion() then
    update public.evidencias_reparacion set estado = 'validada', resuelta_at = clock_timestamp(),
      resuelta_por = p_administrador_id,
      motivo_resolucion = format('Reparación validada por %s confirmaciones', v_confirmaciones)
    where id = v_evidencia and estado = 'en_verificacion';
    if found then
      v_evidencia_estado := 'validada';
      -- El cierre por comunidad se registra en historial_estados, no como
      -- aprobación administrativa.
      v_cerrado := private.cerrar_reporte_por_reparacion(v_reporte, p_administrador_id,
        format('Reparación validada por %s confirmaciones de usuarios', v_confirmaciones));
    end if;
  end if;
  select estado_id into v_reporte_estado from public.reportes where id = v_reporte;
  return jsonb_build_object('verificacion_id', p_verificacion_id, 'decision', p_decision,
    'repetida', v_repetida, 'evidencia_estado', v_evidencia_estado,
    'reporte_estado_id', v_reporte_estado, 'cerrado', v_cerrado,
    'confirmaciones', v_confirmaciones, 'impugnaciones', v_impugnaciones,
    'impugnaciones_pendientes', v_pendientes);
end;
$$;
comment on function public.resolver_impugnacion_reparacion(uuid, uuid, text, text) is
'Resuelve una impugnación pendiente: aceptarla rechaza la evidencia; descartarla reevalúa el umbral.';

revoke all on function public.resolver_impugnacion_reparacion(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.resolver_impugnacion_reparacion(uuid,uuid,text,text)
  to service_role;

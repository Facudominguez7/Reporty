-- Registro durable de la cancelación de la revisión de reparado (S3, S4).
-- La actividad se escribe en la misma transacción que la evidencia y su auditoría;
-- un reintento de una resolución ya rechazada no agrega una segunda fila.

-- Decisión administrativa sobre la evidencia: aprobar (Reparado), rechazar o
-- revertir una validada (vuelve a Pendiente, historial y −5 puntos) (S8).
create or replace function public.resolver_evidencia_reparacion_admin(
  p_evidencia_id uuid, p_administrador_id uuid, p_accion text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_reporte bigint; v_evidencia public.evidencias_reparacion%rowtype;
  v_reporte_estado integer; v_autor uuid; v_cerrado boolean := false;
  v_evidencia_estado text; v_revertido boolean := false; v_repetida boolean := false;
  v_confirmaciones integer; v_impugnaciones integer; v_pendientes integer;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')),'');
begin
  if p_evidencia_id is null or p_administrador_id is null or p_accion is null
    or p_accion not in ('aprobar','rechazar','revertir') then
    raise exception using errcode = 'PRE11', message = 'Acción administrativa inválida';
  end if;
  select reporte_id into v_reporte from public.evidencias_reparacion where id = p_evidencia_id;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Evidencia de reparación no disponible';
  end if;
  -- Orden de bloqueo fijo: reporte, evidencia, verificación.
  select estado_id, usuario_id into v_reporte_estado, v_autor from public.reportes
    where id = v_reporte and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Reporte no disponible para resolver la evidencia';
  end if;
  select * into v_evidencia from public.evidencias_reparacion
    where id = p_evidencia_id for update;
  if not private.es_administrador(p_administrador_id) then
    raise exception using errcode = 'PRE08', message = 'Administrador no autorizado';
  end if;
  if p_accion = 'aprobar' and v_reporte_estado = 3 then
    raise exception using errcode = 'PRE05', message = 'El reporte ya está cerrado';
  end if;
  if p_accion = 'aprobar' then
    if v_evidencia.estado = 'validada' then
      v_repetida := true;
    elsif v_evidencia.estado = 'informada' then
      -- Aprobar exige la foto ya publicada: la reparación se valida sobre la
      -- evidencia que la comunidad puede ver (S8, S11).
      raise exception using errcode = 'PRE12',
        message = 'La evidencia todavía no tiene foto publicada: no se puede aprobar la reparación';
    elsif v_evidencia.estado <> 'en_verificacion' then
      raise exception using errcode = 'PRE09',
        message = 'La evidencia rechazada o revertida no se puede aprobar';
    else
      update public.evidencias_reparacion set estado = 'validada',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(v_motivo, 'Aprobada por administración')
        where id = p_evidencia_id;
      -- La evidencia aprobada no deja impugnaciones abiertas: quedan descartadas
      -- con el administrador y la fecha de resolución (S8).
      update public.verificaciones_reparacion set estado = 'descartada',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(v_motivo, 'Evidencia aprobada por administración')
        where evidencia_id = p_evidencia_id and tipo = 'impugnacion' and estado = 'pendiente';
      v_cerrado := private.cerrar_reporte_por_reparacion(v_reporte, p_administrador_id,
        coalesce(v_motivo, 'Reparación aprobada por administración'));
      perform private.registrar_auditoria_evidencia('evidence_approved', p_administrador_id, v_reporte);
    end if;
  elsif p_accion = 'rechazar' then
    if v_evidencia.estado = 'rechazada' then
      v_repetida := true;
    elsif v_evidencia.estado in ('validada','revertida') then
      raise exception using errcode = 'PRE09',
        message = 'Revertí la validación antes de rechazar la evidencia';
    else
      update public.evidencias_reparacion set estado = 'rechazada',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(v_motivo, 'Rechazada por administración')
        where id = p_evidencia_id;
      -- La evidencia rechazada deja sus impugnaciones pendientes como aceptadas
      -- con el administrador y la fecha de resolución (S8).
      update public.verificaciones_reparacion set estado = 'aceptada',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(v_motivo, 'Evidencia rechazada por administración')
        where evidencia_id = p_evidencia_id and tipo = 'impugnacion' and estado = 'pendiente';
      -- La actividad se registra sin cambiar el estado y dentro de la transacción.
      insert into public.historial_estados(reporte_id, estado_anterior_id, estado_nuevo_id, usuario_id, comentario)
      values (v_reporte, v_reporte_estado, v_reporte_estado, p_administrador_id,
        coalesce(v_motivo, 'Un administrador canceló la revisión de reparado.'));
      perform private.registrar_auditoria_evidencia('evidence_rejected', p_administrador_id, v_reporte);
    end if;
  else
    if v_evidencia.estado = 'revertida' then
      v_repetida := true;
    elsif v_evidencia.estado <> 'validada' then
      raise exception using errcode = 'PRE09',
        message = 'Solo se puede revertir una evidencia validada';
    else
      update public.evidencias_reparacion set estado = 'revertida',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(v_motivo, 'Revertida por administración')
        where id = p_evidencia_id;
      if v_reporte_estado = 2 then
        update public.reportes set estado_id = 1 where id = v_reporte;
        if v_autor is not null then
          perform public.adjust_profile_points_atomic(v_autor, -5, 'Reparación revertida por administración');
        end if;
        insert into public.historial_estados(reporte_id, estado_anterior_id, estado_nuevo_id, usuario_id, comentario)
        values (v_reporte, 2, 1, p_administrador_id,
          coalesce(v_motivo, 'Reparación revertida por administración'));
        v_revertido := true;
      end if;
      perform private.registrar_auditoria_evidencia('evidence_reverted', p_administrador_id, v_reporte);
    end if;
  end if;
  select (r->>'confirmaciones')::integer, (r->>'impugnaciones')::integer,
         (r->>'impugnaciones_pendientes')::integer
    into v_confirmaciones, v_impugnaciones, v_pendientes
    from (select private.resumen_verificaciones(p_evidencia_id) as r) s;
  select estado into v_evidencia_estado from public.evidencias_reparacion where id = p_evidencia_id;
  select estado_id into v_reporte_estado from public.reportes where id = v_reporte;
  return jsonb_build_object('evidencia_id', p_evidencia_id, 'accion', p_accion,
    'repetida', v_repetida, 'evidencia_estado', v_evidencia_estado,
    'reporte_estado_id', v_reporte_estado, 'cerrado', v_cerrado, 'revertido', v_revertido,
    'confirmaciones', v_confirmaciones, 'impugnaciones', v_impugnaciones,
    'impugnaciones_pendientes', v_pendientes);
end;
$$;
comment on function public.resolver_evidencia_reparacion_admin(uuid, uuid, text, text) is
'Aprueba, rechaza o revierte una evidencia; aprobar exige foto publicada, resuelve las impugnaciones pendientes y revertir devuelve el reporte a Pendiente y descuenta los cinco puntos.';

revoke all on function public.resolver_evidencia_reparacion_admin(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.resolver_evidencia_reparacion_admin(uuid,uuid,text,text)
  to service_role;

-- Cierre por el autor del reporte.
--
-- Cuando la evidencia de reparación la informa el mismo autor del reporte, la
-- publicación de su foto (ya aprobada por moderación) valida la evidencia y cierra
-- el reporte como Reparado, sin esperar la verificación de la comunidad.
--   * La foto sigue pasando por moderación: hasta que se publica, nada cambia.
--   * Este cierre no suma puntos: los +5 de «reporte reparado» quedan para las
--     reparaciones que valida la comunidad o la administración.
--   * La evidencia de cualquier otra cuenta sigue el flujo comunitario de siempre.

create function private.cerrar_reparacion_del_autor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_autor_reporte uuid; v_estado integer;
begin
  -- Mismo orden de bloqueo que las RPC: la publicación ya bloqueó el reporte en
  -- validar_propietario_moderacion; después la evidencia.
  select r.usuario_id, r.estado_id into v_autor_reporte, v_estado
    from public.reportes r
    where r.id = new.reporte_id and r.deleted_at is null
    for update;
  if not found or v_estado is distinct from 1
    or v_autor_reporte is distinct from new.autor_id then
    return null;
  end if;
  -- La evidencia se resuelve antes de cerrar el reporte para que el trigger
  -- resolver_evidencia_al_cerrar_reporte ya no la encuentre activa.
  update public.evidencias_reparacion set estado = 'validada',
    resuelta_at = clock_timestamp(),
    resuelta_por = new.autor_id,
    motivo_resolucion = 'Reparación informada por el autor del reporte'
  where id = new.id and estado = 'en_verificacion';
  if not found then return null; end if;
  update public.reportes set estado_id = 2 where id = new.reporte_id;
  insert into public.historial_estados(reporte_id, estado_anterior_id, estado_nuevo_id, usuario_id, comentario)
  values (new.reporte_id, v_estado, 2, new.autor_id, 'Reparación informada por el autor del reporte');
  return null;
end;
$$;
comment on function private.cerrar_reparacion_del_autor() is
'Cierra como Reparado, sin puntos, el reporte cuya evidencia publicada informó su propio autor.';
revoke all on function private.cerrar_reparacion_del_autor() from public, anon, authenticated;

create trigger cerrar_reparacion_del_autor
  after update of estado on public.evidencias_reparacion
  for each row
  when (old.estado = 'informada' and new.estado = 'en_verificacion')
  execute function private.cerrar_reparacion_del_autor();

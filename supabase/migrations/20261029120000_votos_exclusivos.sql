-- Los pares históricos no tienen zona horaria comparable: se informan sin modificarlos.
create view public.votos_exclusivos_ambiguos as
select n.reporte_id, n.usuario_id, n.created_at as fecha_no_existe,
       r.created_at as fecha_reparado
from public.votos_no_existe n
join public.votos_reparado r on r.reporte_id=n.reporte_id and r.usuario_id=n.usuario_id;
revoke all on public.votos_exclusivos_ambiguos from public, anon, authenticated;
grant select on public.votos_exclusivos_ambiguos to service_role;
comment on view public.votos_exclusivos_ambiguos is 'Pares históricos sin orden temporal demostrable; no se modifican automáticamente.';

-- El bloqueo de reporte existente serializa también las escrituras legacy.
create function private.impedir_votos_contradictorios() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_table_name='votos_no_existe' then
    if exists(select 1 from public.votos_reparado where reporte_id=new.reporte_id and usuario_id=new.usuario_id) then
      raise exception 'Existe un voto contrario';
    end if;
  else
    if exists(select 1 from public.votos_no_existe where reporte_id=new.reporte_id and usuario_id=new.usuario_id) then
      raise exception 'Existe un voto contrario';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.impedir_votos_contradictorios() from public, anon, authenticated;
-- El nombre ordena este trigger después de lock_report_before_vote_*.
create trigger z_impedir_votos_contradictorios before insert on public.votos_no_existe
for each row execute function private.impedir_votos_contradictorios();
create trigger z_impedir_votos_contradictorios before insert on public.votos_reparado
for each row execute function private.impedir_votos_contradictorios();

-- Registra o cambia un voto bajo bloqueo del reporte; solo service_role puede invocarla.
create function public.registrar_voto_exclusivo(p_reporte_id bigint, p_usuario_id uuid, p_tipo text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_autor uuid; v_estado integer; v_borrado timestamptz;
  v_no boolean; v_si boolean; v_cambio boolean; v_primero boolean; v_total integer;
  v_reparados integer; v_cerrado boolean := false;
begin
  if p_tipo is null or p_tipo not in ('no_existe','reparado') or p_usuario_id is null then
    raise exception 'Voto inválido';
  end if;
  select usuario_id,estado_id,deleted_at into v_autor,v_estado,v_borrado
    from public.reportes where id=p_reporte_id for update;
  if not found or v_borrado is not null or v_estado in (2,3) then
    raise exception 'Reporte cerrado o no disponible';
  end if;
  if p_tipo='no_existe' and v_autor=p_usuario_id then
    raise exception 'No podés votar no existe en tu propio reporte';
  end if;
  -- Todos los votos bloquean primero los perfiles distintos en orden global, antes
  -- de insertar (la FK también toma bloqueos) y antes de actualizar puntos.
  perform 1 from public.profiles where id in (p_usuario_id,v_autor) order by id for no key update;
  if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_usuario_id and (p.rol_id is null or p.rol_id not in (1,4,5)) and not coalesce(u.is_anonymous,false)) then
    raise exception 'Usuario no habilitado para votar';
  end if;
  select exists(select 1 from public.votos_no_existe where reporte_id=p_reporte_id and usuario_id=p_usuario_id),
         exists(select 1 from public.votos_reparado where reporte_id=p_reporte_id and usuario_id=p_usuario_id)
    into v_no,v_si;
  if v_no and v_si then raise exception using errcode = 'PVA01', message = 'Votos históricos ambiguos; requieren revisión'; end if;
  v_primero := not v_no and not v_si;
  v_cambio := (p_tipo='no_existe' and v_si) or (p_tipo='reparado' and v_no);
  if v_cambio then
    if v_no then delete from public.votos_no_existe where reporte_id=p_reporte_id and usuario_id=p_usuario_id;
    else delete from public.votos_reparado where reporte_id=p_reporte_id and usuario_id=p_usuario_id; end if;
  end if;
  if v_primero or v_cambio then
    if p_tipo='no_existe' then insert into public.votos_no_existe(reporte_id,usuario_id) values(p_reporte_id,p_usuario_id);
    else insert into public.votos_reparado(reporte_id,usuario_id) values(p_reporte_id,p_usuario_id); end if;
  end if;
  if v_primero then
    update public.profiles set puntos=coalesce(puntos,0)+1 where id=p_usuario_id returning puntos into v_total;
    if not found then raise exception 'Perfil inexistente'; end if;
  end if;
  select votos_reparado_count into v_reparados from public.reportes_vote_summary where reporte_id=p_reporte_id;
  if p_tipo='reparado' and v_reparados >= 5 then
    update public.reportes set estado_id=2 where id=p_reporte_id;
    if v_autor is not null then
      update public.profiles set puntos=coalesce(puntos,0)+5 where id=v_autor;
      if not found then raise exception 'Perfil del autor inexistente'; end if;
    end if;
    insert into public.historial_estados(reporte_id,estado_anterior_id,estado_nuevo_id,usuario_id,comentario)
      values(p_reporte_id,v_estado,2,p_usuario_id,format('Marcado como reparado por %s votos de usuarios',v_reparados));
    v_cerrado := true;
  end if;
  return jsonb_build_object('tipo',p_tipo,'primero',v_primero,'cambio',v_cambio,
    'estado_cambiado',v_cerrado,
    'votos_no_existe', (select votos_no_existe_count from public.reportes_vote_summary where reporte_id=p_reporte_id),
    'votos_reparado', v_reparados);
end $$;
revoke all on function public.registrar_voto_exclusivo(bigint,uuid,text) from public, anon, authenticated;
grant execute on function public.registrar_voto_exclusivo(bigint,uuid,text) to service_role;
comment on function public.registrar_voto_exclusivo(bigint,uuid,text) is 'Voto exclusivo serializado con premio atómico solo en el primer voto.';

-- A report photo waiting for human review stayed in the admin queue after its report was
-- deleted, and neither "Aprobar" nor "Rechazar" could resolve it: the ownership trigger only
-- allowed REJECTED -> REJECTED updates on deleted reports ("Propietario o reporte inválido").
--
-- 1. validar_propietario_moderacion: on a deleted report, any update that ends REJECTED /
--    rechazada (token cleared, publicado_at untouched) is allowed. Approval stays blocked.
-- 2. retirar_reporte_rechazado: a report that was already deleted has nothing to withdraw,
--    so rejecting its photo no longer reverts creation points nor queues a withdrawal email.
-- 3. New trigger: deleting a report rejects its photos still pending review, so they never
--    reach the queue.
-- 4. One-off cleanup of the rows already stuck in production.

create or replace function public.validar_propietario_moderacion()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare v_deleted timestamp; v_estado text;
begin
  if tg_op = 'UPDATE' and (new.id,new.reporte_id,new.propietario_id,new.hash_sha256,new.path_privado,
      new.destino,new.evidencia_id) is distinct from
      (old.id,old.reporte_id,old.propietario_id,old.hash_sha256,old.path_privado,
      old.destino,old.evidencia_id) then
    raise exception 'Identidad de evidencia inmutable';
  end if;
  if new.destino = 'evidencia_reparacion' then
    select deleted_at into v_deleted from public.reportes where id=new.reporte_id for update;
    if not found then raise exception 'Propietario o reporte inválido'; end if;
    select e.estado into v_estado from public.evidencias_reparacion e
      where e.id=new.evidencia_id and e.reporte_id=new.reporte_id
        and e.autor_id=new.propietario_id for update;
    if not found then raise exception 'Evidencia de reparación inválida'; end if;
    if tg_op = 'INSERT' then
      if v_deleted is not null or v_estado <> 'informada' then
        raise exception 'Evidencia de reparación inválida';
      end if;
    elsif v_deleted is not null and (new.decision <> 'REJECTED'
        or new.estado_publicacion <> 'rechazada') then
      raise exception 'Evidencia de reparación inválida';
    end if;
  else
    select deleted_at into v_deleted from public.reportes where id=new.reporte_id
      and usuario_id=new.propietario_id for update;
    if not found then raise exception 'Propietario o reporte inválido'; end if;
    if v_deleted is not null then
      if tg_op <> 'UPDATE' then raise exception 'Propietario o reporte inválido'; end if;
      -- A deleted report only accepts transitions that end rejected.
      if new.decision <> 'REJECTED' or new.estado_publicacion <> 'rechazada'
        or (new.token is not null and new.token is distinct from old.token)
        or new.publicado_at is distinct from old.publicado_at then
        raise exception 'Propietario o reporte inválido';
      end if;
    end if;
  end if;
  if new.path_privado <> new.propietario_id::text || '/' || new.id::text then
    raise exception 'Ruta privada inválida';
  end if;
  return new;
end;
$function$;

create or replace function moderacion_privada.retirar_reporte_rechazado()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_email text; v_invitado boolean; v_premio public.puntos_creacion_reporte%rowtype;
  v_ya_eliminado boolean;
begin
  if new.destino = 'evidencia_reparacion' then return new; end if;
  if new.decision <> 'REJECTED' or old.decision = 'REJECTED' then return new; end if;
  -- A report deleted before this rejection has nothing to withdraw: no point reversal and
  -- no withdrawal email for a report its owner (or an admin) already removed.
  select deleted_at is not null into v_ya_eliminado from public.reportes where id=new.reporte_id;
  if coalesce(v_ya_eliminado, false) then return new; end if;
  update public.reportes set deleted_at=coalesce(deleted_at,clock_timestamp())
    where id=new.reporte_id;
  update public.puntos_creacion_reporte set revertido_at=clock_timestamp()
    where reporte_id=new.reporte_id and revertido_at is null returning * into v_premio;
  if found then
    perform public.adjust_profile_points_atomic(v_premio.propietario_id,-v_premio.cantidad,
      'Retiro por fotografía rechazada');
  end if;
  select nullif(btrim(u.email),''), coalesce(u.is_anonymous,false) or p.rol_id=5
    into v_email,v_invitado from public.profiles p join auth.users u on u.id=p.id
    where p.id=new.propietario_id;
  insert into public.avisos_retiro_reporte(reporte_id,propietario_id,destinatario,estado,omision)
    values (new.reporte_id,new.propietario_id,
      case when v_invitado then null else v_email end,
      case when v_invitado or v_email is null then 'omitido' else 'pendiente' end,
      case when v_invitado then 'invitado' when v_email is null then 'sin_correo' end)
    on conflict (reporte_id) do nothing;
  return new;
end;
$function$;

-- Rejects the photos still waiting for a decision when their report is deleted.
create or replace function moderacion_privada.rechazar_fotos_de_reporte_eliminado()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.moderacion_imagenes
      set decision = 'REJECTED', estado_publicacion = 'rechazada', token = null,
        motivos = coalesce(motivos, '[]'::jsonb) || '["reporte_eliminado"]'::jsonb
      where reporte_id = new.id and estado_publicacion in ('pendiente', 'reclamada');
  end if;
  return null;
end;
$function$;

revoke all on function moderacion_privada.rechazar_fotos_de_reporte_eliminado() from public;

drop trigger if exists rechazar_fotos_de_reporte_eliminado on public.reportes;
create trigger rechazar_fotos_de_reporte_eliminado
  after update of deleted_at on public.reportes
  for each row execute function moderacion_privada.rechazar_fotos_de_reporte_eliminado();

-- One-off cleanup: photos already stuck on deleted reports.
update public.moderacion_imagenes m
  set decision = 'REJECTED', estado_publicacion = 'rechazada', token = null,
    motivos = coalesce(m.motivos, '[]'::jsonb) || '["reporte_eliminado"]'::jsonb
  from public.reportes r
  where r.id = m.reporte_id and r.deleted_at is not null
    and m.estado_publicacion in ('pendiente', 'reclamada');

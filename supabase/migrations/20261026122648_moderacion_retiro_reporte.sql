begin;

-- No se reconstruyen premios históricos a partir del saldo agregado.
create table public.puntos_creacion_reporte (
  reporte_id bigint primary key references public.reportes(id) on delete restrict,
  propietario_id uuid not null references public.profiles(id),
  cantidad integer not null check (cantidad = 10),
  otorgado_at timestamptz not null default clock_timestamp(),
  revertido_at timestamptz
);
create table public.avisos_retiro_reporte (
  reporte_id bigint primary key references public.reportes(id) on delete restrict,
  propietario_id uuid not null references public.profiles(id),
  destinatario text,
  estado text not null check (estado in ('pendiente','reclamado','enviado','omitido')),
  omision text check (omision in ('invitado','sin_correo')),
  creado_at timestamptz not null default clock_timestamp(),
  token uuid,
  reclamado_hasta timestamptz,
  intentos integer not null default 0 check (intentos >= 0),
  enviado_at timestamptz,
  check ((estado = 'omitido') = (omision is not null)),
  check (estado = 'omitido' or destinatario is not null),
  check ((estado = 'enviado') = (enviado_at is not null))
);
alter table public.puntos_creacion_reporte enable row level security;
alter table public.avisos_retiro_reporte enable row level security;
revoke all on public.puntos_creacion_reporte, public.avisos_retiro_reporte
  from public, anon, authenticated, service_role;
grant select on public.puntos_creacion_reporte to service_role;
grant select, update on public.avisos_retiro_reporte to service_role;

-- El reporte serializa premio y retiro; no se bloquea evidencia desde el premio.
create function moderacion_privada.acreditar_puntos_reporte(p_reporte_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_propietario uuid;
begin
  select usuario_id into v_propietario from public.reportes
    where id = p_reporte_id and deleted_at is null for update;
  if not found then return false; end if;
  perform 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=v_propietario and p.rol_id is distinct from 5
      and not coalesce(u.is_anonymous,false) for update of p;
  if not found then return false; end if;
  insert into public.puntos_creacion_reporte(reporte_id,propietario_id,cantidad)
    values (p_reporte_id,v_propietario,10) on conflict do nothing;
  if not found then return false; end if;
  perform public.adjust_profile_points_atomic(v_propietario,10,'Crear nuevo reporte');
  return true;
end;
$$;
create function public.acreditar_puntos_reporte(p_reporte_id bigint)
returns boolean language sql security invoker set search_path = '' as $$
  select moderacion_privada.acreditar_puntos_reporte(p_reporte_id);
$$;

-- Reusa el CAS existente: el trigger es parte de la misma sentencia/transacción.
-- Lee el autor incluso cuando el reporte ya no es visible, nunca un administrador.
create function moderacion_privada.retirar_reporte_rechazado()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_email text; v_invitado boolean; v_premio public.puntos_creacion_reporte%rowtype;
begin
  if new.decision <> 'REJECTED' or old.decision = 'REJECTED' then return new; end if;
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
$$;
create trigger retirar_reporte_rechazado after update of decision on public.moderacion_imagenes
  for each row execute function moderacion_privada.retirar_reporte_rechazado();

create or replace function public.validar_propietario_moderacion()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_deleted timestamp;
begin
  if tg_op = 'UPDATE' and (new.id,new.reporte_id,new.propietario_id,new.hash_sha256,new.path_privado)
    is distinct from (old.id,old.reporte_id,old.propietario_id,old.hash_sha256,old.path_privado) then
    raise exception 'Identidad de evidencia inmutable';
  end if;
  select deleted_at into v_deleted from public.reportes where id=new.reporte_id
    and usuario_id=new.propietario_id for update;
  if not found then raise exception 'Propietario o reporte inválido'; end if;
  if v_deleted is not null then
    -- Solo mantenimiento de evidencia ya rechazada; nunca tokens ni publicación.
    if tg_op <> 'UPDATE' then raise exception 'Propietario o reporte inválido'; end if;
    if old.decision <> 'REJECTED' or new.decision <> 'REJECTED'
      or old.estado_publicacion <> 'rechazada' or new.estado_publicacion <> 'rechazada'
      or new.token is distinct from old.token
      or new.publicado_at is distinct from old.publicado_at then
      raise exception 'Propietario o reporte inválido';
    end if;
  end if;
  if new.path_privado <> new.propietario_id::text || '/' || new.id::text then
    raise exception 'Ruta privada inválida';
  end if;
  return new;
end;
$$;

-- Reclamo por reporte: token CAS y lease de 5 minutos. El proveedor debe usar la
-- clave estable 'retiro-reporte/<reporte_id>', NO el token de intento.
create function public.reclamar_aviso_retiro(p_reporte_id bigint)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_token uuid := gen_random_uuid();
begin
  update public.avisos_retiro_reporte set estado='reclamado',token=v_token,
    reclamado_hasta=clock_timestamp()+interval '5 minutes',intentos=intentos+1
    where reporte_id=p_reporte_id and (estado='pendiente' or
      (estado='reclamado' and reclamado_hasta < clock_timestamp()));
  if not found then return null; end if;
  return v_token;
end;
$$;
create function public.confirmar_aviso_retiro(p_reporte_id bigint,p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.avisos_retiro_reporte set estado='enviado',enviado_at=clock_timestamp(),
    reclamado_hasta=null where reporte_id=p_reporte_id and estado='reclamado'
      and token=p_token and p_token is not null;
  return found;
end;
$$;
revoke all on function moderacion_privada.acreditar_puntos_reporte(bigint),
  moderacion_privada.retirar_reporte_rechazado(), public.acreditar_puntos_reporte(bigint),
  public.reclamar_aviso_retiro(bigint), public.confirmar_aviso_retiro(bigint,uuid)
  from public, anon, authenticated;
grant execute on function moderacion_privada.acreditar_puntos_reporte(bigint),
  public.acreditar_puntos_reporte(bigint),public.reclamar_aviso_retiro(bigint),
  public.confirmar_aviso_retiro(bigint,uuid) to service_role;
commit;

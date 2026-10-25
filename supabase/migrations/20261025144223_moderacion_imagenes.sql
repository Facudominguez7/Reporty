-- Frontera incremental: las fotografías históricas no se reclasifican.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reportes-pendientes', 'reportes-pendientes', false, 102400,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 102400,
  allowed_mime_types = excluded.allowed_mime_types;

-- RESTRICTIVE impide que otra política permisiva reabra estos buckets.
create policy moderacion_storage_insert on storage.objects as restrictive
for insert to public with check (bucket_id not in ('reportes', 'reportes-pendientes'));
create policy moderacion_storage_update on storage.objects as restrictive
for update to public using (bucket_id not in ('reportes', 'reportes-pendientes'))
with check (bucket_id not in ('reportes', 'reportes-pendientes'));
create policy moderacion_storage_delete on storage.objects as restrictive
for delete to public using (bucket_id <> 'reportes-pendientes');
create policy moderacion_storage_read on storage.objects as restrictive
for select to public using (bucket_id <> 'reportes-pendientes');

revoke insert, update on public.fotos_reporte from public, anon, authenticated;
drop policy if exists fotos_reporte_owner_insert on public.fotos_reporte;
create policy moderacion_metadata_insert on public.fotos_reporte as restrictive
for insert to public with check (false);
create policy moderacion_metadata_update on public.fotos_reporte as restrictive
for update to public using (false) with check (false);

create table public.moderacion_imagenes (
  id uuid primary key,
  reporte_id bigint not null references public.reportes(id) on delete restrict,
  propietario_id uuid not null references public.profiles(id),
  hash_sha256 text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  path_privado text not null unique,
  decision text not null default 'REVIEW' check (decision in ('REVIEW','APPROVED','REJECTED')),
  motivos jsonb not null default '[]'::jsonb check (jsonb_typeof(motivos) = 'array'),
  operaciones integer not null default 0 check (operaciones >= 0),
  administrador_id uuid references public.profiles(id),
  revisado_at timestamptz,
  publicado_at timestamptz,
  creado_at timestamptz not null default now(),
  estado_publicacion text not null default 'pendiente'
    check (estado_publicacion in ('pendiente','reclamada','publicando','publicada','rechazada')),
  token uuid,
  unique (reporte_id, hash_sha256),
  check ((estado_publicacion = 'publicada') = (publicado_at is not null)),
  check (estado_publicacion <> 'rechazada' or decision = 'REJECTED')
);
comment on table public.moderacion_imagenes is
'Cola privada independiente de fotos_reporte; únicamente el backend confiable consulta o modifica evidencias.';
create index moderacion_imagenes_propietario on public.moderacion_imagenes(propietario_id);
create index moderacion_imagenes_administrador on public.moderacion_imagenes(administrador_id);

create table public.presupuesto_moderacion (
  id boolean primary key default true check (id),
  diario integer not null default 500 check (diario between 0 and 500),
  mensual integer not null default 2000 check (mensual between 0 and 2000)
);
insert into public.presupuesto_moderacion default values;
comment on table public.presupuesto_moderacion is
'Límites Free UTC; el servicio puede reducirlos mediante RPC, nunca elevarlos.';

create table public.reservas_moderacion (
  solicitud uuid primary key,
  operaciones integer not null check (operaciones > 0),
  creado_at timestamptz not null default clock_timestamp(),
  operaciones_reales integer check (operaciones_reales >= 0),
  registrado_at timestamptz
);
comment on table public.reservas_moderacion is
'Reservas conservadoras: no liberar por timeout ni fallo incierto; consumo real registrado separadamente.';
create index reservas_moderacion_fecha on public.reservas_moderacion(creado_at);

alter table public.moderacion_imagenes enable row level security;
alter table public.presupuesto_moderacion enable row level security;
alter table public.reservas_moderacion enable row level security;
revoke all on public.moderacion_imagenes, public.presupuesto_moderacion,
  public.reservas_moderacion from public, anon, authenticated;
grant select, insert, update, delete on public.moderacion_imagenes to service_role;
grant select, insert, update on public.reservas_moderacion to service_role;
-- El presupuesto no admite UPDATE directo desde service_role.
revoke all on public.presupuesto_moderacion from service_role;
grant select on public.presupuesto_moderacion to service_role;

create schema if not exists moderacion_privada;
revoke all on schema moderacion_privada from public, anon, authenticated;
grant usage on schema moderacion_privada to service_role;
create function moderacion_privada.reducir_presupuesto(p_diario integer, p_mensual integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(76230125);
  update public.presupuesto_moderacion set diario = p_diario, mensual = p_mensual
  where id and p_diario between 0 and diario and p_mensual between 0 and mensual;
  if not found then raise exception 'Solo se permite reducir el presupuesto'; end if;
end;
$$;
comment on function moderacion_privada.reducir_presupuesto(integer, integer) is
'Reduce irreversiblemente los límites operativos Free; definer fuera del esquema expuesto.';
revoke all on function moderacion_privada.reducir_presupuesto(integer,integer) from public, anon, authenticated;
grant execute on function moderacion_privada.reducir_presupuesto(integer,integer) to service_role;

create function public.reducir_presupuesto_moderacion(p_diario integer, p_mensual integer)
returns void language sql security invoker set search_path = '' as $$
  select moderacion_privada.reducir_presupuesto(p_diario, p_mensual);
$$;
comment on function public.reducir_presupuesto_moderacion(integer, integer) is
'Entrada de servicio para reducir límites Free sin conceder UPDATE directo sobre el presupuesto.';

create function public.reservar_operaciones_moderacion(p_solicitud uuid, p_operaciones integer default 2)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_ahora timestamptz;
  v_dia timestamptz;
  v_mes timestamptz;
  v_limites public.presupuesto_moderacion%rowtype;
begin
  if p_solicitud is null or p_operaciones is null or p_operaciones not between 1 and 500 then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(76230125);
  v_ahora := clock_timestamp();
  v_dia := date_trunc('day', v_ahora at time zone 'UTC') at time zone 'UTC';
  v_mes := date_trunc('month', v_ahora at time zone 'UTC') at time zone 'UTC';
  select * into strict v_limites from public.presupuesto_moderacion where id;
  if exists (select 1 from public.reservas_moderacion where solicitud = p_solicitud)
    or exists (select 1 from public.reservas_moderacion
               where creado_at > v_ahora - interval '1 second')
    or (select coalesce(sum(operaciones),0) from public.reservas_moderacion
        where creado_at >= v_dia) + p_operaciones > v_limites.diario
    or (select coalesce(sum(operaciones),0) from public.reservas_moderacion
        where creado_at >= v_mes) + p_operaciones > v_limites.mensual then
    return false;
  end if;
  insert into public.reservas_moderacion(solicitud, operaciones, creado_at)
  values (p_solicitud, p_operaciones, v_ahora);
  return true;
end;
$$;
comment on function public.reservar_operaciones_moderacion(uuid, integer) is
'Reserva atómica global Free (500/día, 2000/mes, una solicitud/segundo UTC); duplicados devuelven false.';

create function public.registrar_operaciones_moderacion(p_solicitud uuid, p_operaciones integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.reservas_moderacion set operaciones_reales = p_operaciones,
    registrado_at = clock_timestamp()
  where solicitud = p_solicitud and operaciones_reales is null
    and p_operaciones between 0 and operaciones;
  return found;
end;
$$;
comment on function public.registrar_operaciones_moderacion(uuid, integer) is
'Registra una vez el consumo observado sin reembolsar reservas; exceso inesperado exige detener el proveedor.';

-- El trigger también protege los INSERT directos del backend.
create function public.validar_propietario_moderacion()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.reportes where id = new.reporte_id
    and usuario_id = new.propietario_id and deleted_at is null for share;
  if not found then raise exception 'Propietario o reporte inválido'; end if;
  if new.path_privado <> new.propietario_id::text || '/' || new.id::text then
    raise exception 'Ruta privada inválida';
  end if;
  if tg_op = 'UPDATE' and (new.id, new.reporte_id, new.propietario_id,
      new.hash_sha256, new.path_privado) is distinct from
      (old.id, old.reporte_id, old.propietario_id, old.hash_sha256, old.path_privado) then
    raise exception 'Identidad de evidencia inmutable';
  end if;
  return new;
end;
$$;
comment on function public.validar_propietario_moderacion() is
'Verifica propiedad vigente y ruta canónica bajo bloqueo del reporte; identidad de evidencia inmutable.';
create trigger validar_propietario_moderacion before insert or update
on public.moderacion_imagenes for each row execute function public.validar_propietario_moderacion();

create function public.reclamar_imagen_moderacion(p_id uuid, p_propietario uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_token uuid := gen_random_uuid();
begin
  update public.moderacion_imagenes set token = v_token, estado_publicacion = 'reclamada'
  where id = p_id and propietario_id = p_propietario and estado_publicacion = 'pendiente';
  if not found then return null; end if;
  return v_token;
end;
$$;
comment on function public.reclamar_imagen_moderacion(uuid, uuid) is
'CAS de clasificación inicial; solo una reclamación durable por evidencia y propietario.';

create function public.decidir_imagen_moderacion(
  p_id uuid, p_token uuid, p_decision text, p_motivos jsonb, p_administrador uuid default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_fila public.moderacion_imagenes%rowtype;
begin
  select * into v_fila from public.moderacion_imagenes where id = p_id for update;
  if not found or p_decision is null or p_decision not in ('APPROVED','REJECTED','REVIEW') then
    return false;
  end if;
  if p_administrador is not null then
    perform 1 from public.profiles where id = p_administrador and rol_id = 1 for share;
    if not found then raise exception 'Administrador no autorizado'; end if;
    if v_fila.estado_publicacion <> 'pendiente' then return false; end if;
  elsif v_fila.estado_publicacion <> 'reclamada' or p_token is null
        or v_fila.token is distinct from p_token then
    return false;
  end if;
  update public.moderacion_imagenes set decision = p_decision, motivos = p_motivos,
    administrador_id = p_administrador,
    revisado_at = case when p_administrador is not null then clock_timestamp() else null end,
    estado_publicacion = case p_decision when 'APPROVED' then 'publicando'
      when 'REJECTED' then 'rechazada' else 'pendiente' end,
    token = case when p_decision = 'APPROVED' then gen_random_uuid() else null end
  where id = p_id;
  return true;
end;
$$;
comment on function public.decidir_imagen_moderacion(uuid, uuid, text, jsonb, uuid) is
'Decisión CAS por token original o Admin DB=1; publicando es irreversible por revisión concurrente, nunca expira automáticamente.';

create function public.confirmar_publicacion_moderacion(
  p_id uuid, p_token uuid, p_url text, p_thumbnail_url text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_fila public.moderacion_imagenes%rowtype;
begin
  select * into v_fila from public.moderacion_imagenes where id = p_id for update;
  if not found or v_fila.estado_publicacion <> 'publicando' or v_fila.decision <> 'APPROVED'
    or p_token is null or v_fila.token is distinct from p_token then return false; end if;
  -- El trigger vuelve a bloquear y validar el reporte antes de insertar metadatos.
  update public.moderacion_imagenes set estado_publicacion = 'publicada', publicado_at = clock_timestamp()
  where id = p_id;
  insert into public.fotos_reporte(reporte_id, url, bucket, path,
    thumbnail_url, thumbnail_bucket, thumbnail_path)
  values (v_fila.reporte_id, p_url, 'reportes', p_id::text || '/' || p_token::text,
    p_thumbnail_url, case when p_thumbnail_url is not null then 'reportes' end,
    case when p_thumbnail_url is not null then p_id::text || '/' || p_token::text || '-miniatura' end);
  return true;
end;
$$;
comment on function public.confirmar_publicacion_moderacion(uuid, uuid, text, text) is
'Confirma token CAS e inserta foto pública atómicamente; rutas deterministas para recuperar copias tras fallo.';

-- Ninguna RPC nueva hereda EXECUTE de PUBLIC ni grants predeterminados.
revoke all on function public.reducir_presupuesto_moderacion(integer,integer),
  public.reservar_operaciones_moderacion(uuid,integer),
  public.registrar_operaciones_moderacion(uuid,integer),
  public.validar_propietario_moderacion(),
  public.reclamar_imagen_moderacion(uuid,uuid),
  public.decidir_imagen_moderacion(uuid,uuid,text,jsonb,uuid),
  public.confirmar_publicacion_moderacion(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.reducir_presupuesto_moderacion(integer,integer),
  public.reservar_operaciones_moderacion(uuid,integer),
  public.registrar_operaciones_moderacion(uuid,integer),
  public.validar_propietario_moderacion(),
  public.reclamar_imagen_moderacion(uuid,uuid),
  public.decidir_imagen_moderacion(uuid,uuid,text,jsonb,uuid),
  public.confirmar_publicacion_moderacion(uuid,uuid,text,text) to service_role;
commit;

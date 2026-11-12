-- Admin publication of a pet photo always failed with "Los datos no corresponden a la
-- evidencia enviada": production runs with extra_float_digits = 0, so PostgREST returns
-- lat/lon rounded to 15 significant digits. The app reads them back and sends them to this
-- function, and the exact `IS DISTINCT FROM` comparison never matched the stored float8.
-- Coordinates are now compared with a tolerance of 1e-9 degrees (about 0.1 mm); every other
-- field keeps the exact comparison.

create or replace function moderacion_privada.crear_mascota_perdida(
  p_propietario_id uuid,
  p_foto_moderacion_id uuid,
  p_tipo_animal text,
  p_descripcion text,
  p_lat double precision,
  p_lon double precision,
  p_telefono text
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id bigint; v_path text; v_retirada_at timestamptz; v_foto public.mascotas_fotos_moderacion%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Solo el servicio confiable finaliza publicaciones'; end if;
  if not exists (
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=p_propietario_id and u.is_anonymous is false and p.rol_id is not null and p.rol_id <> 5
  ) then raise exception 'Se requiere una cuenta registrada'; end if;
  select * into v_foto from public.mascotas_fotos_moderacion
    where id=p_foto_moderacion_id and propietario_id=p_propietario_id
      and decision='APPROVED' and estado='aprobada' and estado_publicacion='publicada'
      and publish_token is null and aprobado_at is not null and path_publico is not null for update;
  if not found then raise exception 'Evidencia fotográfica aprobada requerida'; end if;
  if (v_foto.tipo_animal, v_foto.descripcion, v_foto.telefono)
      is distinct from (p_tipo_animal, p_descripcion, p_telefono)
    or p_lat is null or p_lon is null or v_foto.lat is null or v_foto.lon is null
    or abs(v_foto.lat - p_lat) > 1e-9 or abs(v_foto.lon - p_lon) > 1e-9 then
    raise exception 'Los datos no corresponden a la evidencia enviada';
  end if;
  select id, retirada_at into v_id, v_retirada_at from public.mascotas_perdidas where foto_moderacion_id=p_foto_moderacion_id;
  if found then
    if v_retirada_at is not null then raise exception 'Publicación retirada'; end if;
    return v_id;
  end if;
  if v_foto.mascota_id is not null then
    raise exception 'Evidencia fotográfica ya utilizada';
  end if;
  v_path := v_foto.path_publico;
  -- The stored coordinates are inserted, not the (possibly rounded) parameters.
  insert into public.mascotas_perdidas(propietario_id,foto_moderacion_id,foto_path,
    tipo_animal,descripcion,lat,lon,telefono)
    values (p_propietario_id,p_foto_moderacion_id,v_path,
      p_tipo_animal,p_descripcion,v_foto.lat,v_foto.lon,p_telefono) returning id into v_id;
  update public.mascotas_fotos_moderacion set mascota_id=v_id where id=p_foto_moderacion_id;
  insert into public.puntos_creacion_mascota(mascota_id,propietario_id,cantidad)
    values (v_id,p_propietario_id,10);
  perform public.adjust_profile_points_atomic(p_propietario_id,10,'Crear mascota perdida');
  return v_id;
end;
$function$;

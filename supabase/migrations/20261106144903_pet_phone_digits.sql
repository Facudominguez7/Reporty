-- Preserve legacy values on unrelated updates, but reject new or changed invalid numbers.
create function public.validar_telefono_mascota() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or new.telefono is distinct from old.telefono)
    and (new.telefono is null or new.telefono !~ '^[0-9]{1,40}$') then
    raise exception 'El teléfono debe contener solo números' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validar_telefono_mascota before insert or update on public.mascotas_perdidas
for each row execute function public.validar_telefono_mascota();
create trigger validar_telefono_mascota before insert or update on public.mascotas_fotos_moderacion
for each row execute function public.validar_telefono_mascota();

create or replace function moderacion_privada.editar_mascota_moderacion(
  p_mascota_id bigint, p_tipo_animal text, p_descripcion text,
  p_lat double precision, p_lon double precision, p_telefono text, p_estado text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=auth.uid() and p.rol_id=1 and u.is_anonymous is false
  ) then raise exception 'Se requiere administración'; end if;
  if p_tipo_animal not in ('perro','gato','otro')
    or p_descripcion is null or length(btrim(p_descripcion)) not between 1 and 5000
    or p_lat is null or p_lat not between -90 and 90
    or p_lon is null or p_lon not between -180 and 180
    or p_telefono is null or p_telefono !~ '^[0-9]{1,40}$'
    or p_estado not in ('perdida','encontrada') then
    raise exception 'Datos de mascota inválidos';
  end if;
  update public.mascotas_perdidas set tipo_animal=p_tipo_animal, descripcion=btrim(p_descripcion),
    lat=p_lat, lon=p_lon, telefono=p_telefono, estado=p_estado
    where id=p_mascota_id and retirada_at is null and moderacion_estado='aprobada';
  return found;
end;
$$;

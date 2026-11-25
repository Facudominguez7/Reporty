-- Reportes y mascotas perdidas cerca de un punto (#297).
--
-- La usa `POST /api/mapa/cerca` al abrir el mapa. La coordenada llega como parámetro y no se
-- guarda en ningún lado: la función es de solo lectura (stable). Es security invoker, así que la
-- RLS de cada tabla decide qué se ve; por eso no se concede a service_role, que la saltea. Como
-- es pública vía PostgREST, valida sus propios parámetros para acotar el trabajo que se puede pedir.

/**
 * Devuelve los reportes y las mascotas perdidas a menos de `radio_m` metros del punto, ordenados
 * por distancia. Los reportes salen con los estados pedidos y sin eliminados; las mascotas, solo
 * las perdidas que la RLS deja ver (aprobadas y vigentes). Como máximo 100 filas.
 *
 * Lanza `invalid_parameter_value` (PostgREST responde 400) si el punto no es válido, si el radio
 * no está entre 100 y 2000 m o si se piden más de 10 estados.
 */
create or replace function public.cerca_de(
  lat double precision,
  lon double precision,
  radio_m double precision,
  estados integer[] default array[1, 4, 2]
)
returns table (tipo text, id bigint, titulo text, metros double precision)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  punto extensions.geography;
begin
  if cerca_de.lat is null or cerca_de.lon is null
     or cerca_de.lat = 'NaN' or cerca_de.lon = 'NaN'
     or cerca_de.lat < -90 or cerca_de.lat > 90
     or cerca_de.lon < -180 or cerca_de.lon > 180 then
    raise exception 'Punto inválido' using errcode = 'invalid_parameter_value';
  end if;
  if cerca_de.radio_m is null or cerca_de.radio_m = 'NaN'
     or cerca_de.radio_m < 100 or cerca_de.radio_m > 2000 then
    raise exception 'El radio debe estar entre 100 y 2000 m' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(cardinality(cerca_de.estados), 0) > 10 then
    raise exception 'Demasiados estados' using errcode = 'invalid_parameter_value';
  end if;

  punto := extensions.st_setsrid(extensions.st_makepoint(cerca_de.lon, cerca_de.lat), 4326)::extensions.geography;

  return query
  select cercanos.tipo, cercanos.id, cercanos.titulo, cercanos.metros
  from (
    select 'reporte'::text as tipo, r.id, r.titulo, extensions.st_distance(r.ubicacion, punto) as metros
    from public.reportes r
    where r.deleted_at is null
      and r.estado_id = any(cerca_de.estados)
      -- ST_DWithin usa el índice GiST de ubicacion.
      and extensions.st_dwithin(r.ubicacion, punto, cerca_de.radio_m)
    union all
    select 'mascota'::text, m.id, m.tipo_animal, extensions.st_distance(m.ubicacion, punto)
    from public.mascotas_perdidas m
    -- La RLS de lectura pública agrega «vigente y aprobada»; con eso el planificador puede usar
    -- el índice parcial de ubicacion.
    where m.estado = 'perdida'
      and extensions.st_dwithin(m.ubicacion, punto, cerca_de.radio_m)
  ) cercanos
  order by cercanos.metros, cercanos.tipo, cercanos.id
  limit 100;
end
$$;

comment on function public.cerca_de(double precision, double precision, double precision, integer[]) is
  'Reportes y mascotas perdidas a menos de radio_m metros del punto, ordenados por distancia (#297). No guarda el punto.';

-- Supabase concede execute a anon, authenticated y service_role por privilegios por defecto.
revoke all on function public.cerca_de(double precision, double precision, double precision, integer[])
  from public, anon, authenticated, service_role;
grant execute on function public.cerca_de(double precision, double precision, double precision, integer[])
  to anon, authenticated;

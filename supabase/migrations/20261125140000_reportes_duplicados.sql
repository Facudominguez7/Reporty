-- Posibles duplicados de un reporte nuevo, medidos con PostGIS (#300).
--
-- La usa `buscarDuplicado` (database/queries/reportes/nuevo/buscar-cercanos.ts) al cargar un
-- reporte. Reemplaza el rectángulo de latitud y longitud y el cálculo por semiverseno que se
-- hacían en Next: la base filtra con ST_DWithin, que usa el índice GiST de `ubicacion`, y
-- devuelve la distancia ya medida. Las reglas para elegir qué duplicado mostrar siguen en
-- `clasificarDuplicado` (lib/reportes/duplicados.ts).
--
-- Devuelve el autor de cada reporte para saber si es propio, así que solo la ejecuta
-- service_role desde el servidor; anon y authenticated no.

/**
 * Devuelve los reportes Pendientes de la categoría pedida a menos de `radio_m` metros del punto,
 * sin los eliminados, ordenados por distancia y luego por id. Como máximo 50 filas.
 *
 * Lanza `invalid_parameter_value` si el punto no es válido, si falta la categoría o si el radio
 * no está entre 1 y 100 m.
 */
create or replace function public.reportes_duplicados_cerca(
  lat double precision,
  lon double precision,
  categoria_id integer,
  radio_m double precision
)
returns table (
  id bigint,
  usuario_id uuid,
  titulo text,
  descripcion text,
  created_at timestamp without time zone,
  metros double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  punto extensions.geography;
begin
  if reportes_duplicados_cerca.lat is null or reportes_duplicados_cerca.lon is null
     or reportes_duplicados_cerca.lat = 'NaN' or reportes_duplicados_cerca.lon = 'NaN'
     or reportes_duplicados_cerca.lat < -90 or reportes_duplicados_cerca.lat > 90
     or reportes_duplicados_cerca.lon < -180 or reportes_duplicados_cerca.lon > 180 then
    raise exception 'Punto inválido' using errcode = 'invalid_parameter_value';
  end if;
  if reportes_duplicados_cerca.categoria_id is null then
    raise exception 'Falta la categoría' using errcode = 'invalid_parameter_value';
  end if;
  if reportes_duplicados_cerca.radio_m is null or reportes_duplicados_cerca.radio_m = 'NaN'
     or reportes_duplicados_cerca.radio_m < 1 or reportes_duplicados_cerca.radio_m > 100 then
    raise exception 'El radio debe estar entre 1 y 100 m' using errcode = 'invalid_parameter_value';
  end if;

  punto := extensions.st_setsrid(
    extensions.st_makepoint(reportes_duplicados_cerca.lon, reportes_duplicados_cerca.lat), 4326
  )::extensions.geography;

  return query
  select r.id, r.usuario_id, r.titulo, r.descripcion, r.created_at,
         extensions.st_distance(r.ubicacion, punto) as metros
  from public.reportes r
  where r.categoria_id = reportes_duplicados_cerca.categoria_id
    and r.estado_id = 1 -- Pendiente
    and r.deleted_at is null
    -- ST_DWithin usa el índice GiST de ubicacion.
    and extensions.st_dwithin(r.ubicacion, punto, reportes_duplicados_cerca.radio_m)
  order by metros, r.id
  limit 50;
end
$$;

comment on function public.reportes_duplicados_cerca(double precision, double precision, integer, double precision) is
  'Reportes Pendientes de la categoría a menos de radio_m metros, ordenados por distancia (#300). Solo service_role: devuelve el autor.';

-- Supabase concede execute a anon, authenticated y service_role por privilegios por defecto.
revoke all on function public.reportes_duplicados_cerca(double precision, double precision, integer, double precision)
  from public, anon, authenticated, service_role;
grant execute on function public.reportes_duplicados_cerca(double precision, double precision, integer, double precision)
  to service_role;

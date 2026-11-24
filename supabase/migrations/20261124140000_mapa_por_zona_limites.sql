-- Límites de las funciones del mapa por zona (#281). Son públicas vía PostgREST, así que
-- alguien puede llamarlas sin pasar por las validaciones del endpoint. Validan sus propios
-- parámetros para acotar el trabajo que se puede pedir: la RLS protege los datos, no el costo.
-- Además, `anon` tiene statement_timeout de 3 s.

/**
 * Valida los parámetros del mapa por zona y lanza `invalid_parameter_value` (PostgREST
 * responde 400) si no corresponden. Devuelve true para usarse como condición dentro de las
 * funciones SQL: es inmutable, así que Postgres la evalúa una sola vez al planificar.
 */
create or replace function public.mapa_parametros_validos(
  oeste double precision,
  sur double precision,
  este double precision,
  norte double precision,
  celda double precision default 0.001,
  busqueda text default null,
  estados integer[] default '{}'
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if oeste is null or sur is null or este is null or norte is null
     or oeste = 'NaN' or sur = 'NaN' or este = 'NaN' or norte = 'NaN'
     or oeste >= este or sur >= norte
     or oeste < -180 or este > 180 or sur < -90 or norte > 90 then
    raise exception 'Zona inválida' using errcode = 'invalid_parameter_value';
  end if;
  -- Posadas entera mide menos de medio grado de lado.
  if este - oeste > 1 or norte - sur > 1 then
    raise exception 'La zona no puede superar 1 grado de lado' using errcode = 'invalid_parameter_value';
  end if;
  -- La celda del zoom máximo (18) mide unos 0,0007 grados.
  if celda is null or celda = 'NaN' or celda < 0.0001 or celda > 1 then
    raise exception 'Tamaño de celda inválido' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(busqueda) > 100 then
    raise exception 'La búsqueda no puede superar 100 caracteres' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(cardinality(estados), 0) > 10 then
    raise exception 'Demasiados estados' using errcode = 'invalid_parameter_value';
  end if;
  return true;
end
$$;

comment on function public.mapa_parametros_validos(double precision, double precision, double precision, double precision, double precision, text, integer[]) is
  'Valida zona, celda, búsqueda y estados del mapa por zona (#281); lanza invalid_parameter_value si no corresponden.';

revoke all on function public.mapa_parametros_validos(double precision, double precision, double precision, double precision, double precision, text, integer[]) from public;
grant execute on function public.mapa_parametros_validos(double precision, double precision, double precision, double precision, double precision, text, integer[])
  to anon, authenticated, service_role;

create or replace function public.reportes_en_zona(
  oeste double precision,
  sur double precision,
  este double precision,
  norte double precision
)
returns setof public.reportes
language sql
stable
security invoker
set search_path = ''
as $$
  select r.*
  from public.reportes r
  where public.mapa_parametros_validos(oeste, sur, este, norte)
    and r.deleted_at is null
    -- El índice GiST descarta por caja; lat/lon dejan el borde exacto del rectángulo.
    and r.ubicacion operator(extensions.&&)
        extensions.st_makeenvelope(oeste, sur, este, norte, 4326)::extensions.geography
    and r.lat between sur and norte
    and r.lon between oeste and este
$$;

create or replace function public.reportes_agrupados_en_zona(
  oeste double precision,
  sur double precision,
  este double precision,
  norte double precision,
  celda double precision,
  estados integer[],
  categoria integer default null,
  prioridad integer default null,
  busqueda text default null
)
returns table (
  lat double precision,
  lon double precision,
  cantidad integer,
  oeste double precision,
  sur double precision,
  este double precision,
  norte double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    avg(r.lat),
    avg(r.lon),
    count(*)::integer,
    min(r.lon),
    min(r.lat),
    max(r.lon),
    max(r.lat)
  from public.reportes_en_zona(
    reportes_agrupados_en_zona.oeste,
    reportes_agrupados_en_zona.sur,
    reportes_agrupados_en_zona.este,
    reportes_agrupados_en_zona.norte
  ) r
  where public.mapa_parametros_validos(
      reportes_agrupados_en_zona.oeste,
      reportes_agrupados_en_zona.sur,
      reportes_agrupados_en_zona.este,
      reportes_agrupados_en_zona.norte,
      celda,
      busqueda,
      estados
    )
    and r.estado_id = any (estados)
    and (categoria is null or r.categoria_id = categoria)
    and (prioridad is null or r.prioridad_id = prioridad)
    -- Misma búsqueda que el listado: título o descripción contienen el texto.
    and (busqueda is null or r.titulo ilike '%' || busqueda || '%' or r.descripcion ilike '%' || busqueda || '%')
  group by extensions.st_snaptogrid(r.ubicacion::extensions.geometry, celda)
$$;

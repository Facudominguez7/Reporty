-- Mapa por zona (#281): el mapa pide los reportes del área visible en lugar de los 100 más
-- nuevos de toda la ciudad. Usa la columna `ubicacion` y su índice GiST (#295).
-- Arquitectura: docs/arquitectura-mapa-postgis.html
--
-- Las dos funciones son security invoker: aplica la misma RLS de `reportes` (sin eliminados)
-- y no abren datos nuevos. Los estados que ve el mapa los fija el endpoint.

/**
 * Reportes vivos dentro del rectángulo oeste/sur/este/norte (grados, EPSG:4326).
 * Solo filtra por área: devuelve filas de `reportes`, así PostgREST encadena el mismo
 * `select` con relaciones y los mismos filtros que la consulta del listado.
 */
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
  where r.deleted_at is null
    -- El índice GiST descarta por caja; lat/lon dejan el borde exacto del rectángulo.
    and r.ubicacion operator(extensions.&&)
        extensions.st_makeenvelope(oeste, sur, este, norte, 4326)::extensions.geography
    and r.lat between sur and norte
    and r.lon between oeste and este
$$;

comment on function public.reportes_en_zona(double precision, double precision, double precision, double precision) is
  'Reportes vivos dentro de un rectángulo (oeste, sur, este, norte). Base del mapa por zona (#281).';

/**
 * Cantidad de reportes por celda de una grilla de `celda` grados dentro del rectángulo,
 * con los mismos filtros que la lista de puntos. Cada grupo trae el centro real de sus
 * reportes y sus límites, para que el mapa se acerque justo a esa área al tocarlo.
 */
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
  where r.estado_id = any (estados)
    and (categoria is null or r.categoria_id = categoria)
    and (prioridad is null or r.prioridad_id = prioridad)
    -- Misma búsqueda que el listado: título o descripción contienen el texto.
    and (busqueda is null or r.titulo ilike '%' || busqueda || '%' or r.descripcion ilike '%' || busqueda || '%')
  group by extensions.st_snaptogrid(r.ubicacion::extensions.geometry, celda)
$$;

comment on function public.reportes_agrupados_en_zona(double precision, double precision, double precision, double precision, double precision, integer[], integer, integer, text) is
  'Reportes agrupados por celda de grilla dentro de un rectángulo, con filtros de estado, categoría, prioridad y búsqueda (#281).';

revoke all on function public.reportes_en_zona(double precision, double precision, double precision, double precision) from public;
grant execute on function public.reportes_en_zona(double precision, double precision, double precision, double precision)
  to anon, authenticated, service_role;

revoke all on function public.reportes_agrupados_en_zona(double precision, double precision, double precision, double precision, double precision, integer[], integer, integer, text) from public;
grant execute on function public.reportes_agrupados_en_zona(double precision, double precision, double precision, double precision, double precision, integer[], integer, integer, text)
  to anon, authenticated, service_role;

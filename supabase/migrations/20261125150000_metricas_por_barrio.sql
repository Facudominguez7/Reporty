-- Métricas del panel de administración, calculadas en la base (#302).
--
-- Las usa la página /admin/metricas (database/queries/interesado/estadisticas-interesado.ts).
-- Antes Next traía todos los reportes y los agrupaba en JS en celdas de unos 100 m; con tantas
-- celdas ninguna juntaba más de un puñado de reportes y el panel no mostraba dónde se acumulan.
-- Ahora la base agrupa por barrio (los de la IDE de Posadas, #299) y por categoría y estado, y
-- devuelve solo los totales: ninguna fila individual llega al servidor de Next.
--
-- Las dos son security invoker: la RLS de `reportes` decide qué filas cuentan, igual que las
-- consultas anteriores con el cliente de la sesión.

/**
 * Devuelve una fila por barrio (con o sin reportes) y una fila sin barrio para los reportes que no
 * caen en ninguno. Cada reporte sin eliminar cuenta en el barrio que lo cubre; si dos se
 * superponen, en el más chico y luego el de menor id, igual que `territorio.barrio_de`.
 *
 * Cada fila trae el total, los pendientes, los reparados, los creados en los últimos 30 días y la
 * geometría del barrio simplificada (unos 10 m) como GeoJSON para el mapa; la fila sin barrio
 * trae `barrio_id`, `nombre` y `geojson` nulos. Ordena por total y luego por nombre.
 */
create or replace function public.reportes_por_barrio()
returns table (
  barrio_id text,
  nombre text,
  total integer,
  pendientes integer,
  reparados integer,
  ultimos_30_dias integer,
  geojson json
)
language sql
stable
security invoker
set search_path = ''
as $$
  with asignados as (
    select
      (select b.id
       from territorio.barrios b
       where extensions.st_covers(b.geom, r.ubicacion::extensions.geometry)
       order by extensions.st_area(b.geom), b.id
       limit 1) as barrio_id,
      r.estado_id,
      r.created_at
    from public.reportes r
    where r.deleted_at is null
  ),
  conteos as (
    select
      a.barrio_id,
      count(*)::integer as total,
      (count(*) filter (where a.estado_id = 1))::integer as pendientes, -- Pendiente
      (count(*) filter (where a.estado_id = 2))::integer as reparados,  -- Reparado
      (count(*) filter (where a.created_at > (now() - interval '30 days')::timestamp))::integer as ultimos_30_dias
    from asignados a
    group by a.barrio_id
  )
  select
    b.id,
    b.nombre,
    coalesce(c.total, 0),
    coalesce(c.pendientes, 0),
    coalesce(c.reparados, 0),
    coalesce(c.ultimos_30_dias, 0),
    extensions.st_asgeojson(extensions.st_simplifypreservetopology(b.geom, 0.0001), 5)::json
  from territorio.barrios b
  left join conteos c on c.barrio_id = b.id
  union all
  select null, null, c.total, c.pendientes, c.reparados, c.ultimos_30_dias, null
  from conteos c
  where c.barrio_id is null
  order by 3 desc, 2 nulls last
$$;

comment on function public.reportes_por_barrio() is
  'Reportes sin eliminar por barrio, con estado, últimos 30 días y geometría simplificada; una fila sin barrio para el resto (#302).';

/**
 * Devuelve una fila por categoría con reportes sin eliminar: el total y cuántos están Pendientes,
 * en Defensoría, Reparados y Rechazados, más la espera promedio de los pendientes en días (con un
 * decimal) y cuántos pendientes llevan más de 90 días. Ordena por la proporción pendiente.
 */
create or replace function public.reportes_por_categoria_y_estado()
returns table (
  categoria text,
  total integer,
  pendientes integer,
  defensoria integer,
  reparados integer,
  rechazados integer,
  espera_promedio_dias numeric,
  pendientes_mas_90_dias integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.nombre,
    count(*)::integer,
    (count(*) filter (where r.estado_id = 1))::integer, -- Pendiente
    (count(*) filter (where r.estado_id = 4))::integer, -- Tomado por Defensoría
    (count(*) filter (where r.estado_id = 2))::integer, -- Reparado
    (count(*) filter (where r.estado_id = 3))::integer, -- Rechazado
    round((avg(extract(epoch from (now()::timestamp - r.created_at)) / 86400) filter (where r.estado_id = 1))::numeric, 1),
    (count(*) filter (where r.estado_id = 1 and r.created_at < (now() - interval '90 days')::timestamp))::integer
  from public.reportes r
  join public.categorias c on c.id = r.categoria_id
  where r.deleted_at is null
  group by c.id, c.nombre
  order by (count(*) filter (where r.estado_id = 1))::numeric / count(*) desc, c.nombre
$$;

comment on function public.reportes_por_categoria_y_estado() is
  'Reportes sin eliminar por categoría y estado, con la espera de los pendientes (#302).';

-- Supabase concede execute a anon, authenticated y service_role por privilegios por defecto. El
-- panel de métricas solo lo ven operadores con sesión; service_role saltearía la RLS.
revoke all on function public.reportes_por_barrio() from public, anon, authenticated, service_role;
grant execute on function public.reportes_por_barrio() to authenticated;
revoke all on function public.reportes_por_categoria_y_estado() from public, anon, authenticated, service_role;
grant execute on function public.reportes_por_categoria_y_estado() to authenticated;

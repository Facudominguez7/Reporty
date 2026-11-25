-- Contrato transaccional de las métricas por barrio (#302); el ejecutor abre y revierte la
-- transacción. Cubre reportes_por_barrio: cuenta cada reporte en el barrio que lo cubre (si dos se
-- superponen, en el más chico, como territorio.barrio_de), separa pendientes, reparados y los de
-- los últimos 30 días, lista también los barrios sin reportes con su geometría y suma en una fila
-- sin barrio los que caen fuera de todos. Cubre reportes_por_categoria_y_estado: reparte cada
-- categoría por estado y mide la espera de los pendientes. Las dos dejan afuera los eliminados y
-- solo authenticated las ejecuta.
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;

/** Cuadrado de `lado` grados con la esquina suroeste en (lat, lon), como MultiPolygon 4326. */
create function pg_temp.cuadrado(lat double precision, lon double precision, lado double precision)
returns extensions.geometry language sql as $$
  select extensions.st_multi(extensions.st_makeenvelope(lon, lat, lon + lado, lat + lado, 4326))
$$;

insert into public.estados(id,nombre) values (1,'Pendiente'), (2,'Reparado'), (3,'Rechazado'), (4,'Tomado por Defensoría')
  on conflict (id) do nothing;
insert into public.categorias(id,nombre) values (-9,'Categoría de prueba');
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000030202','metricas@ejemplo.invalid');

-- Lejos de Posadas (latitud -40) para no mezclarse con los barrios reales de la base local.
-- «Prueba chico» está dentro de «Prueba grande»; «Prueba vacío» no tiene reportes.
with importacion as (
  insert into territorio.importaciones_barrios(fuente,version,fecha_fuente,licencia,atribucion,cantidad,importado_en)
  values ('prueba', '1', now(), 'ODbL', 'prueba', 3, now()) returning id
)
insert into territorio.barrios(id,nombre,geom,importacion_id)
select b.id, b.nombre, b.geom, importacion.id
from importacion, (values
  ('prueba-grande', 'Prueba grande', pg_temp.cuadrado(-40.10, -50.10, 0.10)),
  ('prueba-chico',  'Prueba chico',  pg_temp.cuadrado(-40.02, -50.02, 0.01)),
  ('prueba-vacio',  'Prueba vacío',  pg_temp.cuadrado(-41.00, -51.00, 0.05))
) as b(id, nombre, geom);

-- Lo que había fuera de todo barrio antes de la prueba (la base local tiene reportes reales).
create temp table antes as select total, pendientes from public.reportes_por_barrio() where barrio_id is null;

insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id,categoria_id,created_at,deleted_at) values
  -- En «Prueba grande»: dos pendientes (de hace 100 y 10 días) y un reparado de hace 5 días.
  (-930301, '10000000-0000-0000-0000-000000030202', 'G1', -40.05, -50.05, 1, -9, (now() - interval '100 days')::timestamp, null),
  (-930302, '10000000-0000-0000-0000-000000030202', 'G2', -40.06, -50.06, 1, -9, (now() - interval '10 days')::timestamp, null),
  (-930303, '10000000-0000-0000-0000-000000030202', 'G3', -40.07, -50.07, 2, -9, (now() - interval '5 days')::timestamp, null),
  -- Eliminado en «Prueba grande»: no cuenta en ninguna de las dos.
  (-930304, '10000000-0000-0000-0000-000000030202', 'G eliminado', -40.05, -50.05, 1, -9, now()::timestamp, now()),
  -- En «Prueba chico», que también está dentro de «Prueba grande»: cuenta solo en el chico.
  (-930305, '10000000-0000-0000-0000-000000030202', 'C1', -40.015, -50.015, 3, -9, (now() - interval '60 days')::timestamp, null),
  -- Fuera de todo barrio: un pendiente de hace 40 días y uno en Defensoría.
  (-930306, '10000000-0000-0000-0000-000000030202', 'F1', -45.00, -45.00, 1, -9, (now() - interval '40 days')::timestamp, null),
  (-930307, '10000000-0000-0000-0000-000000030202', 'F2', -45.01, -45.01, 4, -9, (now() - interval '40 days')::timestamp, null);

set local role authenticated;
create temp table barrios as select * from public.reportes_por_barrio();
create temp table categorias as select * from public.reportes_por_categoria_y_estado();
reset role;

select pg_temp.exigir(
  (select total = 3 and pendientes = 2 and reparados = 1 and ultimos_30_dias = 2 and nombre = 'Prueba grande'
   from barrios where barrio_id = 'prueba-grande'),
  'cuenta los reportes del barrio por estado y los de los últimos 30 días, sin los eliminados');
select pg_temp.exigir(
  (select total = 1 and pendientes = 0 and reparados = 0 from barrios where barrio_id = 'prueba-chico'),
  'si dos barrios se superponen, el reporte cuenta solo en el más chico');
select pg_temp.exigir(
  (select total = 0 and geojson->>'type' in ('Polygon', 'MultiPolygon') from barrios where barrio_id = 'prueba-vacio'),
  'los barrios sin reportes salen con cero y con su geometría para el mapa');
select pg_temp.exigir(
  (select b.total = a.total + 2 and b.pendientes = a.pendientes + 1 and b.nombre is null and b.geojson is null
   from barrios b, antes a where b.barrio_id is null),
  'los reportes fuera de todo barrio se suman en una fila sin barrio ni geometría');
select pg_temp.exigir(
  (select count(*) = 1 from barrios where barrio_id is null),
  'hay una sola fila sin barrio');

select pg_temp.exigir(
  (select total = 6 and pendientes = 3 and defensoria = 1 and reparados = 1 and rechazados = 1
   from categorias where categoria = 'Categoría de prueba'),
  'reparte cada categoría por estado, sin los eliminados');
select pg_temp.exigir(
  (select espera_promedio_dias = 50.0 and pendientes_mas_90_dias = 1 from categorias where categoria = 'Categoría de prueba'),
  'mide la espera promedio de los pendientes (100, 10 y 40 días) y cuenta los de más de 90');

select pg_temp.exigir(not has_function_privilege('anon', 'public.reportes_por_barrio()', 'execute'),
  'anon no ejecuta reportes_por_barrio');
select pg_temp.exigir(has_function_privilege('authenticated', 'public.reportes_por_barrio()', 'execute'),
  'authenticated ejecuta reportes_por_barrio');
select pg_temp.exigir(not has_function_privilege('anon', 'public.reportes_por_categoria_y_estado()', 'execute'),
  'anon no ejecuta reportes_por_categoria_y_estado');
select pg_temp.exigir(has_function_privilege('authenticated', 'public.reportes_por_categoria_y_estado()', 'execute'),
  'authenticated ejecuta reportes_por_categoria_y_estado');

select 'metricas_por_barrio: ok';

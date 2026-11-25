-- Contrato transaccional de los barrios (#299); el ejecutor abre y revierte la transacción.
-- Cubre: la importación transforma de EPSG:5348 a 4326 y registra fuente, fecha y atribución;
-- reimportar reemplaza los barrios y deja el registro de cada importación; un punto dentro de un
-- barrio devuelve ese barrio, uno fuera de todos devuelve nulo, y si dos se superponen gana el
-- más chico; el lote por reportes respeta la RLS y valida su tamaño; solo service_role importa.
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;

/** Indica si la consulta falla con invalid_parameter_value (PostgREST responde 400). */
create function pg_temp.rechaza(consulta text) returns boolean language plpgsql as $$
begin
  execute consulta;
  return false;
exception when invalid_parameter_value then
  return true;
end $$;

/**
 * Feature GeoJSON de un barrio cuadrado en EPSG:5348, como lo entrega el WFS de la IDE: un
 * cuadrado de `lado` metros centrado en el punto (lat, lon).
 */
create function pg_temp.barrio(id text, nombre text, lat double precision, lon double precision, lado double precision)
returns jsonb language sql as $$
  select jsonb_build_object(
    'type', 'Feature',
    'properties', jsonb_build_object('id', id, '_Barrio', nombre, 'Tipo', 'Regulados por Ordenanza', 'Delegacion', 'Centro', 'Ordenanza', 'ORD. prueba'),
    'geometry', extensions.st_asgeojson(extensions.st_multi(extensions.st_expand(
      extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326), 5348),
      lado / 2)))::jsonb)
$$;

/** Barrio del punto (lat, lon), con la misma conversión que usa la columna `ubicacion`. */
create function pg_temp.barrio_en(lat double precision, lon double precision) returns text language sql as $$
  select territorio.barrio_de(extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography)
$$;

-- Grande (2 km) centrado en (-27.45, -55.95); Chico (200 m) adentro del grande; Lejano aparte.
select pg_temp.exigir(
  public.importar_barrios(
    jsonb_build_array(
      pg_temp.barrio('1', 'Grande', -27.4500, -55.9500, 2000),
      pg_temp.barrio('2', 'Chico', -27.4500, -55.9500, 200),
      pg_temp.barrio('3', 'Lejano', -27.4000, -55.9000, 500)),
    'https://www.ide.posadas.gob.ar/geoserver/ows#geonode:Barrios_SMU0',
    'Barrios_SMU 2026 actualizado',
    '2026-06-17T15:24:00Z',
    'ODbL',
    'Secretaría de Movilidad Urbana, Dirección SIG-IDE, Municipalidad de Posadas (ODbL)') = 3,
  'la importación devuelve cuántos barrios cargó');

select pg_temp.exigir(
  (select count(*) = 3 and bool_and(extensions.st_srid(geom) = 4326) from territorio.barrios),
  'los barrios quedan guardados en EPSG:4326');
select pg_temp.exigir(
  (select fecha_fuente = '2026-06-17T15:24:00Z'::timestamptz and cantidad = 3 and licencia = 'ODbL'
     and atribucion like 'Secretaría de Movilidad Urbana%' and version = 'Barrios_SMU 2026 actualizado'
   from territorio.importaciones_barrios order by id desc limit 1),
  'la importación registra versión, fecha de la fuente, licencia, atribución y cantidad');

-- A 600 m al este del centro: dentro del grande, fuera del chico.
select pg_temp.exigir(pg_temp.barrio_en(-27.4500, -55.9440) = 'Grande', 'un punto dentro de un barrio devuelve ese barrio');
select pg_temp.exigir(pg_temp.barrio_en(-27.4500, -55.9500) = 'Chico', 'si dos barrios se superponen, gana el más chico');
select pg_temp.exigir(pg_temp.barrio_en(-27.3000, -55.8000) is null, 'un punto fuera de todos los barrios devuelve nulo');
select pg_temp.exigir(territorio.barrio_de(null) is null, 'sin ubicación no hay barrio');

-- Reimportar reemplaza todos los barrios y suma un registro de importación.
select pg_temp.exigir(
  public.importar_barrios(
    jsonb_build_array(pg_temp.barrio('3', 'Lejano renombrado', -27.4000, -55.9000, 500)),
    'https://www.ide.posadas.gob.ar/geoserver/ows#geonode:Barrios_SMU0', 'v2', '2026-07-01T00:00:00Z', 'ODbL',
    'Secretaría de Movilidad Urbana, Dirección SIG-IDE, Municipalidad de Posadas (ODbL)') = 1,
  'la reimportación devuelve cuántos barrios cargó');
select pg_temp.exigir((select count(*) from territorio.barrios) = 1, 'reimportar reemplaza los barrios anteriores');
select pg_temp.exigir((select count(*) from territorio.importaciones_barrios) >= 2, 'cada importación queda registrada');
select pg_temp.exigir(pg_temp.barrio_en(-27.4500, -55.9440) is null, 'tras reimportar, los límites viejos ya no cuentan');
select pg_temp.exigir(pg_temp.barrio_en(-27.4000, -55.9000) = 'Lejano renombrado', 'tras reimportar, el barrio sale con el nombre nuevo');

-- Datos inválidos: no se borra nada.
select pg_temp.exigir(pg_temp.rechaza($q$select public.importar_barrios('[]'::jsonb, 'f', 'v', now(), 'ODbL', 'a')$q$),
  'una importación vacía se rechaza');
select pg_temp.exigir(pg_temp.rechaza($q$select public.importar_barrios('[{"type":"Feature","properties":{"id":"9"},"geometry":null}]'::jsonb, 'f', 'v', now(), 'ODbL', 'a')$q$),
  'un barrio sin nombre o sin geometría se rechaza');
select pg_temp.exigir(pg_temp.rechaza($q$select public.importar_barrios('[{"type":"Feature","properties":{"id":"9","_Barrio":"Punto"},"geometry":{"type":"Point","coordinates":[6500000,6960000]}}]'::jsonb, 'f', 'v', now(), 'ODbL', 'a')$q$),
  'una geometría que no es polígono se rechaza en lugar de guardarse vacía');
select pg_temp.exigir((select count(*) from territorio.barrios) = 1, 'una importación rechazada no borra los barrios');

/** Indica si la consulta falla por cualquier motivo (la importación queda sin efecto). */
create function pg_temp.falla(consulta text) returns boolean language plpgsql as $$
begin
  execute consulta;
  return false;
exception when others then
  return true;
end $$;

select pg_temp.exigir(pg_temp.falla($q$select public.importar_barrios(jsonb_build_array(pg_temp.barrio('4', 'Bueno', -27.45, -55.95, 500), '{"type":"Feature","properties":{"id":"5","_Barrio":"Roto"},"geometry":{"type":"MultiPolygon","coordinates":"x"}}'::jsonb), 'f', 'v', now(), 'ODbL', 'a')$q$),
  'una geometría con coordenadas inválidas hace fallar la importación');
select pg_temp.exigir(pg_temp.falla($q$select public.importar_barrios(jsonb_build_array(pg_temp.barrio('4', 'Uno', -27.45, -55.95, 500), pg_temp.barrio('4', 'Otro', -27.40, -55.90, 500)), 'f', 'v', now(), 'ODbL', 'a')$q$),
  'un id repetido hace fallar la importación');
select pg_temp.exigir((select count(*) = 1 and min(nombre) = 'Lejano renombrado' from territorio.barrios),
  'una importación que falla a mitad de camino deja los barrios anteriores');

-- Lote por reportes: respeta la RLS de reportes y valida el tamaño.
insert into public.estados(id,nombre) values (1,'Pendiente') on conflict (id) do nothing;
insert into public.categorias(id,nombre) values (1,'Bache') on conflict (id) do nothing;
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000029901','barrios@ejemplo.invalid');
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id,categoria_id,deleted_at) values
  (-929901, '10000000-0000-0000-0000-000000029901', 'En Lejano', -27.4000, -55.9000, 1, 1, null),
  (-929902, '10000000-0000-0000-0000-000000029901', 'Afuera', -27.3000, -55.8000, 1, 1, null),
  (-929903, '10000000-0000-0000-0000-000000029901', 'Eliminado en Lejano', -27.4000, -55.9000, 1, 1, now());

set local role anon;
select pg_temp.exigir(
  (select jsonb_object_agg(reporte_id, barrio) from public.barrios_de_reportes(array[-929901, -929902, -929903]::bigint[]))
    = '{"-929901": "Lejano renombrado", "-929902": null}'::jsonb,
  'el lote devuelve el barrio de cada reporte visible, nulo si cae fuera, y nada de los que la RLS oculta');
select pg_temp.exigir(pg_temp.rechaza($q$select * from public.barrios_de_reportes(array(select generate_series(1, 101))::bigint[])$q$),
  'el lote rechaza más de 100 reportes');
reset role;

select pg_temp.exigir(not has_function_privilege('anon', 'public.importar_barrios(jsonb,text,text,timestamptz,text,text)', 'execute'),
  'anon no puede importar barrios');
select pg_temp.exigir(not has_function_privilege('authenticated', 'public.importar_barrios(jsonb,text,text,timestamptz,text,text)', 'execute'),
  'authenticated no puede importar barrios');
select pg_temp.exigir(has_function_privilege('service_role', 'public.importar_barrios(jsonb,text,text,timestamptz,text,text)', 'execute'),
  'service_role importa barrios');
select pg_temp.exigir(has_function_privilege('anon', 'public.barrios_de_reportes(bigint[])', 'execute'),
  'anon consulta el barrio de los reportes');
select pg_temp.exigir(not has_table_privilege('anon', 'territorio.barrios', 'insert'), 'anon no escribe barrios');

select 'territorio_barrios: ok';

-- Contrato transaccional del mapa por zona (#281); el ejecutor abre y revierte la transacción.
-- Cubre: un pendiente antiguo sigue visible en su zona con más de 100 reportes recientes en
-- otra área, los eliminados nunca salen, los grupos suman lo mismo que los puntos con los
-- mismos filtros y la consulta por zona usa el índice GiST.
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;

/** Devuelve el plan de una consulta como texto, para buscar el índice usado. */
create function pg_temp.plan(consulta text) returns text language plpgsql as $$
declare linea text; resultado text := '';
begin
  for linea in execute 'explain ' || consulta loop resultado := resultado || linea || E'\n'; end loop;
  return resultado;
end $$;

insert into public.roles(id,nombre) values (2,'Ciudadano') on conflict (id) do nothing;
insert into public.estados(id,nombre) values (1,'Pendiente'),(2,'Reparado'),(3,'Rechazado'),(4,'Tomado por Defensoría')
  on conflict (id) do nothing;
insert into public.categorias(id,nombre) values (1,'Bache'),(4,'Alumbrado') on conflict (id) do nothing;
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000028101','zona-autor@ejemplo.invalid');

-- 150 pendientes recientes en el centro de Posadas.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id,categoria_id,created_at)
select -928100 - g, '10000000-0000-0000-0000-000000028101', 'Reciente ' || g,
       -27.3700 + (g % 15) * 0.0004, -55.8960 + (g / 15) * 0.0004, 1, case when g % 2 = 0 then 1 else 4 end,
       now() - make_interval(mins => g)
from generate_series(1, 150) g;

-- En Itaembé Miní: un pendiente de mayo, uno reparado, uno rechazado y uno eliminado.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id,categoria_id,created_at,deleted_at) values
 (-928001,'10000000-0000-0000-0000-000000028101','Bache viejo',-27.4100,-55.9800,1,1,'2026-05-01',null),
 (-928002,'10000000-0000-0000-0000-000000028101','Luminaria reparada',-27.4105,-55.9805,2,4,'2026-06-01',null),
 (-928003,'10000000-0000-0000-0000-000000028101','Rechazado',-27.4110,-55.9810,3,1,'2026-06-02',null),
 (-928004,'10000000-0000-0000-0000-000000028101','Eliminado',-27.4115,-55.9815,1,1,'2026-06-03',now());

-- S1: con 150 reportes más nuevos en el centro, la zona de Itaembé Miní devuelve su pendiente de mayo.
select pg_temp.exigir(
  exists (select 1 from public.reportes_en_zona(-55.99, -27.42, -55.97, -27.40) where id = -928001),
  'El pendiente antiguo aparece en su zona');
select pg_temp.exigir(
  not exists (select 1 from public.reportes_en_zona(-55.99, -27.42, -55.97, -27.40) where id < -928100),
  'La zona no trae reportes de otra área');

-- S2: los eliminados nunca salen, ni como punto ni dentro de un grupo.
select pg_temp.exigir(
  not exists (select 1 from public.reportes_en_zona(-55.99, -27.42, -55.97, -27.40) where id = -928004),
  'Un eliminado no aparece en la zona');
select pg_temp.exigir(
  (select coalesce(sum(cantidad), 0) from public.reportes_agrupados_en_zona(
     -55.99, -27.42, -55.97, -27.40, 0.01, array[1,4,2])) = 2,
  'Los grupos cuentan pendiente y reparado, sin el rechazado ni el eliminado');

-- La zona es exacta: un punto apenas fuera del rectángulo no entra.
select pg_temp.exigir(
  not exists (select 1 from public.reportes_en_zona(-55.9799, -27.42, -55.97, -27.40) where id = -928001),
  'El borde oeste de la zona se respeta');

-- Grupos y puntos coinciden con los mismos filtros (estado, categoría y búsqueda).
select pg_temp.exigir(
  (select sum(cantidad) from public.reportes_agrupados_en_zona(
     -55.91, -27.38, -55.88, -27.36, 0.002, array[1,4,2], 1, null, null))
  = (select count(*) from public.reportes_en_zona(-55.91, -27.38, -55.88, -27.36)
     where estado_id = any (array[1,4,2]) and categoria_id = 1),
  'Grupos por categoría suman lo mismo que los puntos');
select pg_temp.exigir(
  (select sum(cantidad) from public.reportes_agrupados_en_zona(
     -55.91, -27.38, -55.88, -27.36, 0.002, array[1,4,2], null, null, 'Reciente 1'))
  = (select count(*) from public.reportes_en_zona(-55.91, -27.38, -55.88, -27.36)
     where estado_id = any (array[1,4,2]) and (titulo ilike '%Reciente 1%' or descripcion ilike '%Reciente 1%')),
  'Grupos con búsqueda suman lo mismo que los puntos');
select pg_temp.exigir(
  (select count(*) from public.reportes_agrupados_en_zona(
     -55.91, -27.38, -55.88, -27.36, 0.002, array[]::int[])) = 0,
  'Sin estados permitidos no hay grupos');

-- Cada grupo trae su centro real y sus límites, y el centro queda dentro de los límites.
select pg_temp.exigir(
  not exists (select 1 from public.reportes_agrupados_en_zona(-55.91, -27.38, -55.88, -27.36, 0.002, array[1,4,2]) g
              where g.lat not between g.sur and g.norte or g.lon not between g.oeste and g.este or g.cantidad < 1),
  'Centro y límites coherentes en cada grupo');
select pg_temp.exigir(
  (select count(*) > 1 from public.reportes_agrupados_en_zona(-55.91, -27.38, -55.88, -27.36, 0.002, array[1,4,2])),
  'Una celda más chica que el área divide en varios grupos');

-- S4: el público llama las funciones y la RLS sigue aplicando.
set local role anon;
select pg_temp.exigir(
  exists (select 1 from public.reportes_en_zona(-55.99, -27.42, -55.97, -27.40) where id = -928001),
  'anon consulta por zona');
select pg_temp.exigir(
  (select coalesce(sum(cantidad), 0) from public.reportes_agrupados_en_zona(
     -55.99, -27.42, -55.97, -27.40, 0.01, array[1,4,2])) = 2,
  'anon consulta grupos');
reset role;

-- S3: la consulta por zona usa el índice espacial. Con `set search_path` Postgres no expande
-- la función en línea y EXPLAIN solo muestra «Function Scan»: se planifica su cuerpo con
-- los parámetros reemplazados por valores. Los grupos leen a través de reportes_en_zona.
set local enable_seqscan = off;
select pg_temp.exigir(
  pg_temp.plan((
    select regexp_replace(regexp_replace(regexp_replace(regexp_replace(prosrc,
      '\moeste\M', '-55.99', 'g'), '\msur\M', '-27.42', 'g'), '\meste\M', '-55.97', 'g'), '\mnorte\M', '-27.40', 'g')
    from pg_proc where oid = 'public.reportes_en_zona(double precision,double precision,double precision,double precision)'::regprocedure
  )) like '%reportes_ubicacion_gist%',
  'la consulta de reportes_en_zona usa reportes_ubicacion_gist');
reset enable_seqscan;

\echo 'OK mapa por zona: pendiente antiguo visible, sin eliminados, grupos = puntos e índice GiST'

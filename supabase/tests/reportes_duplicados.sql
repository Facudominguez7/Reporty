-- Contrato transaccional de reportes_duplicados_cerca (#300); el ejecutor abre y revierte la
-- transacción. Cubre: con reportes a 20, 90 y 110 m se detectan los dos primeros, ordenados por
-- distancia y con los metros calculados por PostGIS; solo cuentan los Pendientes de la misma
-- categoría y sin eliminar; los parámetros inválidos se rechazan; solo service_role la ejecuta,
-- porque devuelve el autor de cada reporte.
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

/** Longitud del punto que queda `metros` al este de (-27.4313728, -55.9460344). */
create function pg_temp.lon_al_este(metros double precision) returns double precision language sql as $$
  select -55.9460344 + metros / (111320 * cos(radians(-27.4313728)))
$$;

insert into public.estados(id,nombre) values (1,'Pendiente'), (2,'Reparado') on conflict (id) do nothing;
insert into public.categorias(id,nombre) values (1,'Bache'), (4,'Alumbrado') on conflict (id) do nothing;
insert into auth.users(id,email) values
  ('10000000-0000-0000-0000-000000030001','duplicados-a@ejemplo.invalid'),
  ('10000000-0000-0000-0000-000000030002','duplicados-b@ejemplo.invalid');

insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id,categoria_id,deleted_at) values
  (-930001, '10000000-0000-0000-0000-000000030001', 'A 20 m',          -27.4313728, pg_temp.lon_al_este(20),  1, 1, null),
  (-930002, '10000000-0000-0000-0000-000000030002', 'A 90 m',          -27.4313728, pg_temp.lon_al_este(90),  1, 1, null),
  (-930003, '10000000-0000-0000-0000-000000030002', 'A 110 m',         -27.4313728, pg_temp.lon_al_este(110), 1, 1, null),
  (-930004, '10000000-0000-0000-0000-000000030002', 'Otra categoría',  -27.4313728, pg_temp.lon_al_este(10),  1, 4, null),
  (-930005, '10000000-0000-0000-0000-000000030002', 'Reparado',        -27.4313728, pg_temp.lon_al_este(10),  2, 1, null),
  (-930006, '10000000-0000-0000-0000-000000030002', 'Eliminado',       -27.4313728, pg_temp.lon_al_este(10),  1, 1, now());

-- Lo que ve el servidor (service_role), que es quien la llama.
set local role service_role;
create temp table encontrados as
  select * from public.reportes_duplicados_cerca(-27.4313728, -55.9460344, 1, 100)
  where id < -930000;
reset role;

select pg_temp.exigir(
  (select array_agg(id order by metros) from encontrados) = array[-930001, -930002]::bigint[],
  'con reportes a 20, 90 y 110 m se detectan los dos primeros, ordenados por distancia');
select pg_temp.exigir(
  (select bool_and(metros between case id when -930001 then 19 else 89 end and case id when -930001 then 21 else 91 end) from encontrados),
  'la distancia sale en metros calculada por PostGIS');
select pg_temp.exigir(
  (select usuario_id = '10000000-0000-0000-0000-000000030001' and titulo = 'A 20 m' and created_at is not null from encontrados where id = -930001),
  'cada reporte sale con su autor, título y fecha para clasificar el duplicado');
select pg_temp.exigir(
  not exists (select 1 from encontrados where id in (-930004, -930005, -930006)),
  'no cuentan otra categoría, los reportes que no están Pendientes ni los eliminados');

set local role service_role;
select pg_temp.exigir(
  (select count(*) from public.reportes_duplicados_cerca(-27.4313728, -55.9460344, 1, 50) where id < -930000) = 1,
  'el radio pedido acota la búsqueda');
select pg_temp.exigir(pg_temp.rechaza($q$select * from public.reportes_duplicados_cerca(-91, -55.9, 1, 100)$q$),
  'un punto inválido se rechaza');
select pg_temp.exigir(pg_temp.rechaza($q$select * from public.reportes_duplicados_cerca(-27.43, -55.9, 1, 101)$q$),
  'un radio de más de 100 m se rechaza');
select pg_temp.exigir(pg_temp.rechaza($q$select * from public.reportes_duplicados_cerca(-27.43, -55.9, null, 100)$q$),
  'sin categoría se rechaza');
reset role;

select pg_temp.exigir(
  not has_function_privilege('anon', 'public.reportes_duplicados_cerca(double precision,double precision,integer,double precision)', 'execute'),
  'anon no la ejecuta: devuelve el autor de cada reporte');
select pg_temp.exigir(
  not has_function_privilege('authenticated', 'public.reportes_duplicados_cerca(double precision,double precision,integer,double precision)', 'execute'),
  'authenticated no la ejecuta');
select pg_temp.exigir(
  has_function_privilege('service_role', 'public.reportes_duplicados_cerca(double precision,double precision,integer,double precision)', 'execute'),
  'service_role la ejecuta');

select 'reportes_duplicados: ok';

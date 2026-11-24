-- Contrato transaccional de la ubicación PostGIS (#295); el ejecutor abre y revierte la transacción.
-- Comprueba que `ubicacion` se deriva de lat/lon, que se actualiza sola, que las consultas por
-- zona pueden usar el índice GiST y que la vista pública de mascotas la expone sin perder
-- security_invoker.
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;

/** Devuelve el plan de una consulta como texto, para buscar el índice usado. */
create function pg_temp.plan(consulta text) returns text language plpgsql as $$
declare linea text; resultado text := '';
begin
  for linea in execute 'explain ' || consulta loop resultado := resultado || linea || E'\n'; end loop;
  return resultado;
end $$;

select pg_temp.exigir(
  (select n.nspname = 'extensions' from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'postgis'),
  'PostGIS instalado en el esquema extensions');

insert into public.roles(id,nombre) values (2,'Ciudadano') on conflict (id) do nothing;
insert into public.estados(id,nombre) values (1,'Abierto') on conflict (id) do nothing;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000029501','postgis-autor@ejemplo.invalid');
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-929501,'10000000-0000-0000-0000-000000029501','Centro de Posadas',-27.3706,-55.8965,1);

-- Las filas existentes y la nueva coinciden con su lat/lon.
select pg_temp.exigir(
  not exists (select 1 from public.reportes
              where extensions.st_y(ubicacion::extensions.geometry) <> lat
                 or extensions.st_x(ubicacion::extensions.geometry) <> lon
                 or ubicacion is null),
  'ubicacion de reportes coincide con lat/lon');
select pg_temp.exigir(
  (select extensions.st_srid(ubicacion::extensions.geometry) = 4326 from public.reportes where id = -929501),
  'ubicacion en SRID 4326');

-- Editar lat/lon actualiza la ubicación sin escribirla a mano.
update public.reportes set lat = -27.3800, lon = -55.9000 where id = -929501;
select pg_temp.exigir(
  (select extensions.st_y(ubicacion::extensions.geometry) = -27.3800
      and extensions.st_x(ubicacion::extensions.geometry) = -55.9000
   from public.reportes where id = -929501),
  'ubicacion sigue a lat/lon al editar');

-- No se puede escribir la ubicación directo.
do $$ begin
  update public.reportes set ubicacion = null where id = -929501;
  raise exception 'Escritura directa de ubicacion permitida';
exception when generated_always then null;
end $$;

-- La distancia en metros es real: el punto editado queda a ~1 km del centro.
select pg_temp.exigir(
  (select extensions.st_distance(ubicacion,
     extensions.st_setsrid(extensions.st_makepoint(-55.8965, -27.3706), 4326)::extensions.geography)
     between 1000 and 1100
   from public.reportes where id = -929501),
  'distancia en metros sobre geography');

-- Una consulta por zona de filas vivas puede usar el índice parcial.
set local enable_seqscan = off;
select pg_temp.exigir(
  pg_temp.plan($q$select id from public.reportes
    where deleted_at is null
      and ubicacion operator(extensions.&&)
          extensions.st_makeenvelope(-56.06, -27.59, -55.6, -27.32, 4326)::extensions.geography$q$)
    like '%reportes_ubicacion_gist%',
  'consulta por zona usa reportes_ubicacion_gist');
select pg_temp.exigir(
  pg_temp.plan($q$select id from public.reportes
    where deleted_at is null
      and extensions.st_dwithin(ubicacion,
          extensions.st_setsrid(extensions.st_makepoint(-55.8965, -27.3706), 4326)::extensions.geography, 500)$q$)
    like '%reportes_ubicacion_gist%',
  'consulta por radio usa reportes_ubicacion_gist');
reset enable_seqscan;
-- En mascotas, con pocas filas el planificador elige otro índice parcial más barato; se
-- comprueba la definición en el catálogo: GiST sobre ubicacion, solo publicaciones vigentes.
select pg_temp.exigir(
  (select indexdef like '%USING gist (ubicacion) WHERE (retirada_at IS NULL)'
   from pg_indexes where schemaname = 'public' and indexname = 'mascotas_perdidas_ubicacion_gist'),
  'mascotas_perdidas_ubicacion_gist es GiST parcial sobre publicaciones vigentes');

-- Mascotas: misma derivación. La fixture omite las claves foráneas de la foto moderada.
set local session_replication_role = replica;
insert into public.mascotas_perdidas(id,propietario_id,foto_moderacion_id,foto_path,tipo_animal,descripcion,lat,lon,telefono)
values (-929501,'10000000-0000-0000-0000-000000029501','40000000-0000-0000-0000-000000029501',
        'fixture','perro','Fixture PostGIS',-27.3706,-55.8965,'1');
set local session_replication_role = origin;
select pg_temp.exigir(
  not exists (select 1 from public.mascotas_perdidas
              where extensions.st_y(ubicacion::extensions.geometry) <> lat
                 or extensions.st_x(ubicacion::extensions.geometry) <> lon
                 or ubicacion is null),
  'ubicacion de mascotas coincide con lat/lon');

-- La vista pública expone la ubicación, conserva security_invoker y el público puede leerla.
select pg_temp.exigir(
  (select 'security_invoker=true' = any (reloptions) from pg_class
   where oid = 'public.mascotas_perdidas_publicas'::regclass),
  'mascotas_perdidas_publicas sigue con security_invoker');
select pg_temp.exigir(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
   where table_schema = 'public' and table_name = 'mascotas_perdidas_publicas')
  = array['id','tipo_animal','estado','descripcion','lat','lon','telefono','publicada_at','direccion','ubicacion'],
  'columnas de la vista en el mismo orden, con ubicacion al final');
set local role anon;
select pg_temp.exigir(
  (select ubicacion is not null from public.mascotas_perdidas_publicas where id = -929501),
  'anon lee la ubicación de una mascota pública');
select pg_temp.exigir(
  (select count(*) = 1 from public.reportes where id = -929501 and ubicacion is not null),
  'anon lee la ubicación de un reporte');
reset role;

\echo 'OK postgis: ubicacion generada, índices GiST y vista pública de mascotas'

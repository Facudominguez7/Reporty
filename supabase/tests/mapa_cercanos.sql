-- Contrato transaccional de cerca_de (#297); el ejecutor abre y revierte la transacción.
-- Cubre: con puntos a 90, 480 y 520 m de un punto conocido, el radio de 500 m devuelve los dos
-- primeros ordenados por distancia; los eliminados y los estados fuera del pedido no salen;
-- las mascotas son solo las perdidas que la RLS deja ver; los parámetros se validan.
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

/** Latitud y longitud del punto a `metros` al norte del centro de la prueba. */
create function pg_temp.al_norte(metros double precision) returns double precision[] language sql as $$
  select array[extensions.st_y(p::extensions.geometry), extensions.st_x(p::extensions.geometry)]
  from (select extensions.st_project(
    extensions.st_setsrid(extensions.st_makepoint(-55.9500, -27.4500), 4326)::extensions.geography,
    metros, 0) as p) s
$$;

insert into public.estados(id,nombre) values (1,'Pendiente'),(2,'Reparado'),(3,'Rechazado'),(4,'Tomado por Defensoría')
  on conflict (id) do nothing;
insert into public.categorias(id,nombre) values (1,'Bache') on conflict (id) do nothing;
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000029701','cercanos@ejemplo.invalid');

-- Centro de la prueba en (-27.4500, -55.9500). Reportes al norte, a distancias exactas.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id,categoria_id,deleted_at)
select v.id, '10000000-0000-0000-0000-000000029701', v.titulo,
       (pg_temp.al_norte(v.metros))[1], (pg_temp.al_norte(v.metros))[2], v.estado, 1, v.borrado
from (values
  (-929790, 'A 90 m', 90.0, 1, null::timestamp),
  (-929780, 'A 480 m', 480.0, 2, null),
  (-929752, 'A 520 m', 520.0, 1, null),
  (-929730, 'Rechazado a 30 m', 30.0, 3, null),
  (-929740, 'Eliminado a 40 m', 40.0, 1, now()::timestamp)
) v(id, titulo, metros, estado, borrado);

-- Mascotas: una perdida aprobada a 200 m, una encontrada a 100 m y una perdida rechazada por moderación a 150 m.
-- La fixture omite las claves foráneas de la foto moderada.
set local session_replication_role = replica;
insert into public.mascotas_perdidas(id,propietario_id,foto_moderacion_id,foto_path,tipo_animal,descripcion,lat,lon,telefono,estado,moderacion_estado)
select v.id, '10000000-0000-0000-0000-000000029701', v.foto::uuid, 'fixture', v.tipo,
       'Fixture cercanos', (pg_temp.al_norte(v.metros))[1], (pg_temp.al_norte(v.metros))[2], '1', v.estado, v.moderacion
from (values
  (-929720, 'perro', 200.0, 'perdida', 'aprobada', '40000000-0000-0000-0000-000000929720'),
  (-929710, 'gato', 100.0, 'encontrada', 'aprobada', '40000000-0000-0000-0000-000000929710'),
  (-929715, 'perro', 150.0, 'perdida', 'rechazada', '40000000-0000-0000-0000-000000929715')
) v(id, tipo, metros, estado, moderacion, foto);
set local session_replication_role = origin;

-- Todo se consulta como visitante, igual que el endpoint: la RLS decide qué mascotas se ven.
set local role anon;

-- El radio de 500 m devuelve los reportes a 90 y 480 m, en ese orden, y no el de 520 m.
select pg_temp.exigir(
  (select array_agg(c.id order by c.metros) from public.cerca_de(-27.4500, -55.9500, 500, array[1,4,2]) c
   where c.tipo = 'reporte' and c.id < 0) = array[-929790, -929780]::bigint[],
  'El radio de 500 m devuelve los reportes a 90 y 480 m, ordenados');

-- Las distancias son las de PostGIS, en metros.
select pg_temp.exigir(
  (select bool_and(abs(c.metros - case c.id when -929790 then 90 else 480 end) < 1)
   from public.cerca_de(-27.4500, -55.9500, 500, array[1,4,2]) c where c.tipo = 'reporte' and c.id < 0),
  'Las distancias salen en metros');

-- La lista viene ordenada por distancia, reportes y mascotas juntos.
select pg_temp.exigir(
  (select array_agg(c.tipo || ':' || c.id order by c.orden)
   from public.cerca_de(-27.4500, -55.9500, 500, array[1,4,2]) with ordinality as c(tipo, id, titulo, metros, orden)
   where c.id < 0)
  = array['reporte:-929790', 'mascota:-929720', 'reporte:-929780'],
  'La lista mezcla reportes y mascotas ordenados por distancia');

-- Los estados se respetan: con solo pendientes no sale el reparado de 480 m.
select pg_temp.exigir(
  not exists (select 1 from public.cerca_de(-27.4500, -55.9500, 500, array[1]) c where c.id = -929780),
  'Un reparado no sale si se piden solo pendientes');

-- La mascota lleva su tipo de animal como título.
select pg_temp.exigir(
  (select c.titulo from public.cerca_de(-27.4500, -55.9500, 500, array[1,4,2]) c where c.id = -929720) = 'perro',
  'La mascota lleva su tipo de animal');

-- La RLS deja afuera la mascota rechazada por moderación; la encontrada no entra nunca.
select pg_temp.exigir(
  (select array_agg(c.id order by c.metros) from public.cerca_de(-27.4500, -55.9500, 500, array[1,4,2]) c
   where c.tipo = 'mascota' and c.id < 0) = array[-929720]::bigint[],
  'Como visitante solo sale la mascota perdida aprobada');

-- Parámetros inválidos: radio fuera de 100 a 2000 m, coordenadas inválidas o demasiados estados.
select pg_temp.exigir(pg_temp.rechaza('select * from public.cerca_de(-27.45, -55.95, 99, array[1])'), 'Rechaza un radio menor que 100 m');
select pg_temp.exigir(pg_temp.rechaza('select * from public.cerca_de(-27.45, -55.95, 2001, array[1])'), 'Rechaza un radio mayor que 2000 m');
select pg_temp.exigir(pg_temp.rechaza('select * from public.cerca_de(null, -55.95, 500, array[1])'), 'Rechaza una latitud nula');
select pg_temp.exigir(pg_temp.rechaza('select * from public.cerca_de(''NaN'', -55.95, 500, array[1])'), 'Rechaza una latitud NaN');
select pg_temp.exigir(pg_temp.rechaza('select * from public.cerca_de(-91, -55.95, 500, array[1])'), 'Rechaza una latitud fuera de rango');
select pg_temp.exigir(pg_temp.rechaza('select * from public.cerca_de(-27.45, -181, 500, array[1])'), 'Rechaza una longitud fuera de rango');
select pg_temp.exigir(pg_temp.rechaza('select * from public.cerca_de(-27.45, -55.95, 500, array[1,2,3,4,5,6,7,8,9,10,11])'), 'Rechaza más de 10 estados');

reset role;

-- Nada de esto se guarda: la función es de solo lectura.
select pg_temp.exigir(
  (select provolatile = 's' from pg_proc where oid = 'public.cerca_de(double precision,double precision,double precision,integer[])'::regprocedure),
  'cerca_de es stable');

-- service_role saltea la RLS: no puede ejecutarla.
select pg_temp.exigir(
  not has_function_privilege('service_role', 'public.cerca_de(double precision,double precision,double precision,integer[])', 'execute'),
  'service_role no ejecuta cerca_de');

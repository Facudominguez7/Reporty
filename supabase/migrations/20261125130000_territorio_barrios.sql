-- Barrios de Posadas y barrio de cada reporte (#299).
--
-- Los límites vienen de `geonode:Barrios_SMU0`, del WFS de la IDE de Posadas (licencia ODbL,
-- atribución a la Secretaría de Movilidad Urbana, Dirección SIG-IDE). Los importa
-- `scripts/territorio/importar-barrios.mjs` con `public.importar_barrios`, que solo puede llamar
-- service_role. El barrio no se guarda en `reportes`: se calcula en la consulta con
-- `territorio.barrio_de`, así que si la Municipalidad cambia los límites alcanza con reimportar.
-- Arquitectura: docs/arquitectura-mapa-postgis.html, sección «Barrios».

create schema if not exists territorio;
comment on schema territorio is 'Límites territoriales importados de fuentes oficiales (#299). No se expone por PostgREST.';
revoke all on schema territorio from public;
grant usage on schema territorio to anon, authenticated, service_role;

/** Registro de cada importación: de dónde, qué versión, de qué fecha y con qué licencia. */
create table territorio.importaciones_barrios (
  id bigint generated always as identity primary key,
  fuente text not null,
  version text not null,
  fecha_fuente timestamptz not null,
  licencia text not null,
  atribucion text not null,
  cantidad integer not null check (cantidad > 0),
  importado_en timestamptz not null default now()
);
comment on table territorio.importaciones_barrios is
  'Una fila por importación de barrios (#299): fuente, versión, fecha que declara la fuente, licencia y atribución.';

/** Barrios vigentes, en EPSG:4326. Se reemplazan enteros en cada importación. */
create table territorio.barrios (
  id text primary key,
  nombre text not null check (btrim(nombre) <> ''),
  tipo text,
  delegacion text,
  ordenanza text,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  importacion_id bigint not null references territorio.importaciones_barrios(id)
);
comment on table territorio.barrios is
  'Barrios de Posadas de la IDE (geonode:Barrios_SMU0, ODbL), en EPSG:4326 (#299). Se reemplazan al reimportar.';
create index barrios_geom_idx on territorio.barrios using gist (geom);

-- Son datos públicos (ODbL): cualquiera los lee; solo service_role escribe, y solo vía importar_barrios.
alter table territorio.importaciones_barrios enable row level security;
alter table territorio.barrios enable row level security;
create policy barrios_lectura on territorio.barrios for select to anon, authenticated using (true);
create policy importaciones_barrios_lectura on territorio.importaciones_barrios for select to anon, authenticated using (true);
revoke all on territorio.barrios, territorio.importaciones_barrios from public, anon, authenticated, service_role;
grant select on territorio.barrios, territorio.importaciones_barrios to anon, authenticated, service_role;
grant insert, delete on territorio.barrios to service_role;
grant insert on territorio.importaciones_barrios to service_role;

/**
 * Devuelve el nombre del barrio que cubre la ubicación, o nulo si no cae en ninguno. Un punto
 * sobre el límite cuenta como dentro (`ST_Covers`). Si dos barrios se superponen, gana el de
 * menor área (el más específico) y, si empatan, el de menor id.
 */
create or replace function territorio.barrio_de(ubicacion extensions.geography)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select b.nombre
  from territorio.barrios b
  where extensions.st_covers(b.geom, ubicacion::extensions.geometry)
  order by extensions.st_area(b.geom), b.id
  limit 1
$$;

comment on function territorio.barrio_de(extensions.geography) is
  'Barrio que cubre la ubicación (ST_Covers), o nulo (#299). Si se superponen, gana el más chico.';

revoke all on function territorio.barrio_de(extensions.geography) from public, anon, authenticated, service_role;
grant execute on function territorio.barrio_de(extensions.geography) to anon, authenticated, service_role;

/**
 * Devuelve el barrio de cada reporte pedido, para la ficha y el panel de Defensoría. Es security
 * invoker: solo salen los reportes que la RLS deja ver; los que caen fuera de todo barrio salen
 * con barrio nulo.
 *
 * Lanza `invalid_parameter_value` (PostgREST responde 400) si se piden más de 100 reportes.
 */
create or replace function public.barrios_de_reportes(ids bigint[])
returns table (reporte_id bigint, barrio text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce(cardinality(barrios_de_reportes.ids), 0) > 100 then
    raise exception 'Se pueden pedir hasta 100 reportes.' using errcode = 'invalid_parameter_value';
  end if;

  return query
  select r.id, territorio.barrio_de(r.ubicacion)
  from public.reportes r
  where r.id = any (barrios_de_reportes.ids);
end
$$;

comment on function public.barrios_de_reportes(bigint[]) is
  'Barrio de cada reporte visible por RLS, hasta 100 por pedido (#299). El barrio se calcula, no se guarda.';

-- Supabase concede execute a anon, authenticated y service_role por privilegios por defecto.
revoke all on function public.barrios_de_reportes(bigint[]) from public, anon, authenticated, service_role;
grant execute on function public.barrios_de_reportes(bigint[]) to anon, authenticated;

/**
 * Reemplaza todos los barrios por los del GeoJSON del WFS y registra la importación. Cada
 * feature trae la geometría en EPSG:5348 (POSGAR 2007 / Argentina 6), que se convierte a 4326
 * con `ST_Transform`; la geometría se repara con `ST_MakeValid` y se guarda como MultiPolygon.
 * Todo corre en una transacción: si algo falla, quedan los barrios anteriores.
 *
 * Lanza `invalid_parameter_value` si no hay barrios, o si alguno no tiene id, nombre o geometría.
 *
 * @returns Cuántos barrios quedaron cargados.
 */
create or replace function public.importar_barrios(
  barrios jsonb,
  fuente text,
  version text,
  fecha_fuente timestamptz,
  licencia text,
  atribucion text
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  importacion bigint;
  cargados integer;
begin
  if jsonb_typeof(importar_barrios.barrios) is distinct from 'array' or jsonb_array_length(importar_barrios.barrios) = 0 then
    raise exception 'La importación no trae barrios.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from jsonb_array_elements(importar_barrios.barrios) f
    where coalesce(btrim(f -> 'properties' ->> 'id'), '') = ''
       or coalesce(btrim(f -> 'properties' ->> '_Barrio'), '') = ''
       or jsonb_typeof(f -> 'geometry') is distinct from 'object'
  ) then
    raise exception 'Hay barrios sin id, nombre o geometría.' using errcode = 'invalid_parameter_value';
  end if;

  insert into territorio.importaciones_barrios (fuente, version, fecha_fuente, licencia, atribucion, cantidad)
  values (importar_barrios.fuente, importar_barrios.version, importar_barrios.fecha_fuente,
          importar_barrios.licencia, importar_barrios.atribucion, jsonb_array_length(importar_barrios.barrios))
  returning id into importacion;

  -- PostgREST carga safeupdate, que rechaza un delete sin where.
  delete from territorio.barrios where true;

  insert into territorio.barrios (id, nombre, tipo, delegacion, ordenanza, geom, importacion_id)
  select
    btrim(f -> 'properties' ->> 'id'),
    btrim(f -> 'properties' ->> '_Barrio'),
    nullif(btrim(f -> 'properties' ->> 'Tipo'), ''),
    nullif(btrim(f -> 'properties' ->> 'Delegacion'), ''),
    nullif(btrim(f -> 'properties' ->> 'Ordenanza'), ''),
    extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
      extensions.st_transform(extensions.st_setsrid(extensions.st_geomfromgeojson(f -> 'geometry'), 5348), 4326)), 3)),
    importacion
  from jsonb_array_elements(importar_barrios.barrios) f;

  get diagnostics cargados = row_count;
  return cargados;
end
$$;

comment on function public.importar_barrios(jsonb, text, text, timestamptz, text, text) is
  'Reemplaza los barrios con el GeoJSON del WFS de la IDE (EPSG:5348 → 4326) y registra la importación (#299). Solo service_role.';

revoke all on function public.importar_barrios(jsonb, text, text, timestamptz, text, text) from public, anon, authenticated, service_role;
grant execute on function public.importar_barrios(jsonb, text, text, timestamptz, text, text) to service_role;

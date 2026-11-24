-- PostGIS y ubicación indexada de reportes y mascotas perdidas (#295).
--
-- lat/lon siguen siendo las columnas que se escriben. `ubicacion` es una columna generada
-- a partir de ellas: ninguna escritura existente cambia y nunca puede quedar desincronizada.
-- El índice GiST parcial cubre solo las filas visibles (las mismas que filtra la RLS pública),
-- que son las que van a consultar el mapa por zona, «Cerca mío» y los duplicados.
-- Arquitectura: docs/arquitectura-mapa-postgis.html

create extension if not exists postgis with schema extensions;

alter table public.reportes
  add column ubicacion extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography
  ) stored;

comment on column public.reportes.ubicacion is
  'Punto derivado de lat/lon (generado). Usar en consultas geográficas; escribir siempre lat/lon.';

create index reportes_ubicacion_gist
  on public.reportes using gist (ubicacion)
  where deleted_at is null;

alter table public.mascotas_perdidas
  add column ubicacion extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography
  ) stored;

comment on column public.mascotas_perdidas.ubicacion is
  'Punto derivado de lat/lon (generado). Usar en consultas geográficas; escribir siempre lat/lon.';

create index mascotas_perdidas_ubicacion_gist
  on public.mascotas_perdidas using gist (ubicacion)
  where retirada_at is null;

-- mascotas_perdidas tiene permisos por columna: la ubicación se lee igual que lat/lon.
grant select (ubicacion) on public.mascotas_perdidas to anon, authenticated;

-- Misma vista, mismas columnas y en el mismo orden, con `ubicacion` agregada al final.
-- security_invoker se declara de nuevo porque CREATE OR REPLACE reemplaza las opciones.
create or replace view public.mascotas_perdidas_publicas
  with (security_invoker = true) as
  select id, tipo_animal, estado, descripcion, lat, lon, telefono, publicada_at, direccion, ubicacion
  from public.mascotas_perdidas;

-- Dirección legible de la mascota publicada («Bolívar 1450, Posadas»).
--
-- Igual que `reportes.direccion`: se calcula con geocodificación inversa
-- (Nominatim) al publicar la mascota o cuando un administrador corrige sus
-- coordenadas, y se guarda acá para que la ficha no dependa del servicio externo.
-- Es opcional: si no se encontró la calle queda en null y la ficha sólo muestra el
-- mapa. Las publicaciones previas se completan con
-- `scripts/geocodificacion/completar-direcciones.mjs`.
--
-- Se deriva de `lat`/`lon`, que ya son públicas, así que se expone con los mismos
-- permisos de lectura. La escribe sólo el servicio confiable.

alter table public.mascotas_perdidas
  add column if not exists direccion text;

comment on column public.mascotas_perdidas.direccion is
  'Dirección legible obtenida por geocodificación inversa de lat/lon; null si no se encontró.';

grant select (direccion) on public.mascotas_perdidas to anon, authenticated, service_role;
grant update (direccion) on public.mascotas_perdidas to service_role;

-- `create or replace view` sólo permite agregar columnas al final.
create or replace view public.mascotas_perdidas_publicas
  with (security_invoker = true) as
  select id, tipo_animal, estado, descripcion, lat, lon, telefono, publicada_at, direccion
  from public.mascotas_perdidas;

notify pgrst, 'reload schema';

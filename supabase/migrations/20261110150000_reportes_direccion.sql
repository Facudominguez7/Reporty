-- Dirección legible del reporte («Bolívar 1450, Posadas»).
--
-- Se calcula una sola vez con geocodificación inversa (Nominatim) al crear el
-- reporte o cuando un administrador corrige sus coordenadas, y se guarda acá para
-- que la ficha no dependa del servicio externo. Es opcional: si no se encontró la
-- calle queda en null y la ficha muestra las coordenadas. Los reportes previos se
-- completan con `scripts/geocodificacion/completar-direcciones.mjs`.
--
-- Se deriva de `lat`/`lon`, que ya son públicas, así que hereda las mismas
-- políticas de lectura de `reportes`.

alter table public.reportes
  add column if not exists direccion text;

comment on column public.reportes.direccion is
  'Dirección legible obtenida por geocodificación inversa de lat/lon; null si no se encontró.';

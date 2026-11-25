#!/usr/bin/env bash
# Prueba los barrios (#299) sin dejar nada aplicado en la base local: abre una transacción, aplica
# PostGIS (#295) si todavía no está, aplica la migración de barrios, ejecuta la prueba SQL y
# revierte. Nada queda instalado en el contenedor.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
postgis="$raiz/supabase/migrations/20261124120000_postgis_ubicacion.sql"
migracion="$raiz/supabase/migrations/20261125130000_territorio_barrios.sql"
prueba="$raiz/supabase/tests/territorio_barrios.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
consultar() { docker exec "$contenedor" psql -U postgres -d postgres -Atc "$1"; }
{
  printf 'begin;\n'
  if [[ "$(consultar "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='reportes' and column_name='ubicacion')")" != "t" ]]; then
    emitir "$postgis"
  fi
  # Si la base ya tiene los barrios, se borran dentro de la transacción para probar siempre el
  # texto actual de la migración; el rollback final los deja como estaban.
  if [[ "$(consultar "select to_regnamespace('territorio') is not null")" == "t" ]]; then
    printf '%s\n' 'drop function if exists public.importar_barrios(jsonb, text, text, timestamptz, text, text);' \
      'drop function if exists public.barrios_de_reportes(bigint[]);' 'drop schema territorio cascade;'
  fi
  if [[ -f "$migracion" ]]; then
    emitir "$migracion"
  fi
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

#!/usr/bin/env bash
# Prueba la migración de PostGIS (#295) sin dejarla aplicada en la base local:
# abre una transacción, aplica la migración si todavía no está, ejecuta la prueba SQL
# y revierte. Nada queda instalado en el contenedor.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
migracion="$raiz/supabase/migrations/20261124120000_postgis_ubicacion.sql"
prueba="$raiz/supabase/tests/postgis_ubicacion.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
{
  printf 'begin;\n'
  if [[ "$(docker exec "$contenedor" psql -U postgres -d postgres -Atc "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='reportes' and column_name='ubicacion')")" != "t" ]]; then
    emitir "$migracion"
  fi
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

#!/usr/bin/env bash
# Prueba reportes_duplicados_cerca (#300) sin dejarla aplicada en la base local: abre una transacción, aplica
# PostGIS (#295) si todavía no está, aplica la migración de duplicados, ejecuta la prueba SQL y
# revierte. Nada queda instalado en el contenedor.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
postgis="$raiz/supabase/migrations/20261124120000_postgis_ubicacion.sql"
migracion="$raiz/supabase/migrations/20261125140000_reportes_duplicados.sql"
prueba="$raiz/supabase/tests/reportes_duplicados.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
consultar() { docker exec "$contenedor" psql -U postgres -d postgres -Atc "$1"; }
{
  printf 'begin;\n'
  if [[ "$(consultar "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='reportes' and column_name='ubicacion')")" != "t" ]]; then
    emitir "$postgis"
  fi
  # La migración usa create or replace: se aplica siempre, también sobre una base ya migrada.
  if [[ -f "$migracion" ]]; then
    emitir "$migracion"
  fi
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

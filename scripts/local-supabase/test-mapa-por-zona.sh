#!/usr/bin/env bash
# Prueba las funciones del mapa por zona (#281) sin dejarlas aplicadas en la base local:
# abre una transacción, aplica PostGIS (#295) y la migración del mapa si todavía no están,
# ejecuta la prueba SQL y revierte. Nada queda instalado en el contenedor.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
postgis="$raiz/supabase/migrations/20261124120000_postgis_ubicacion.sql"
migracion="$raiz/supabase/migrations/20261124130000_mapa_por_zona.sql"
limites="$raiz/supabase/migrations/20261124140000_mapa_por_zona_limites.sql"
prueba="$raiz/supabase/tests/mapa_por_zona.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
consultar() { docker exec "$contenedor" psql -U postgres -d postgres -Atc "$1"; }
{
  printf 'begin;\n'
  if [[ "$(consultar "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='reportes' and column_name='ubicacion')")" != "t" ]]; then
    emitir "$postgis"
  fi
  if [[ "$(consultar "select to_regprocedure('public.reportes_agrupados_en_zona(double precision,double precision,double precision,double precision,double precision,integer[],integer,integer,text)') is not null")" != "t" ]]; then
    emitir "$migracion"
  fi
  if [[ "$(consultar "select to_regprocedure('public.mapa_parametros_validos(double precision,double precision,double precision,double precision,double precision,text,integer[])') is not null")" != "t" ]]; then
    emitir "$limites"
  fi
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

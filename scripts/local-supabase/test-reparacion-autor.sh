#!/usr/bin/env bash
# Prueba el cierre por el autor del reporte sin aplicarlo a la base local: abre una
# transacción, compone el esquema vigente de evidencia de reparación, aplica la
# migración del cierre por el autor, ejecuta la prueba SQL y revierte.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
migraciones="$raiz/supabase/migrations"
base="$migraciones/20261106120000_evidencia_reparacion.sql"
incrementales=(
  "$migraciones/20261107120000_admin_participa_reparacion.sql"
  "$migraciones/20261108120000_cancelacion_revision_reparado.sql"
  "$migraciones/20261109120000_historial_aceptar_impugnacion.sql"
  "$migraciones/20261117120000_autor_cierra_reparacion.sql"
)
prueba="$raiz/supabase/tests/reparacion_autor_reporte.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
{
  printf 'begin;\n'
  if [[ "$(docker exec "$contenedor" psql -U postgres -d postgres -Atc "select to_regclass('public.evidencias_reparacion') is not null")" != "t" ]]; then
    emitir "$base"
  fi
  for archivo in "${incrementales[@]}"; do
    # Sin la migración nueva la prueba corre igual y debe fallar (RED).
    [[ -f "$archivo" ]] && emitir "$archivo"
  done
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

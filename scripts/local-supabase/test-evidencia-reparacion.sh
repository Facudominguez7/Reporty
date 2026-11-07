#!/usr/bin/env bash
# Prueba el contrato vigente de evidencia de reparación sin aplicarlo a la base local:
# abre una transacción, instala la migración base si todavía no está aplicada, aplica
# la incremental de administración en reparaciones, ejecuta la prueba SQL y revierte.
# Nada queda instalado en el contenedor (las secuencias no se usan: todas las
# fixtures tienen ids explícitos).
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
base="$raiz/supabase/migrations/20261106120000_evidencia_reparacion.sql"
incremental="$raiz/supabase/migrations/20261107120000_admin_participa_reparacion.sql"
prueba="$raiz/supabase/tests/evidencia_reparacion.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
{
  printf 'begin;\n'
  # Compone el estado desplegado: con la base ya aplicada solo se reemplaza la
  # elegibilidad con la incremental; sin ella se instala el archivo base completo.
  if [[ "$(docker exec "$contenedor" psql -U postgres -d postgres -Atc "select to_regclass('public.evidencias_reparacion') is not null")" != "t" ]]; then
    emitir "$base"
  fi
  emitir "$incremental"
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

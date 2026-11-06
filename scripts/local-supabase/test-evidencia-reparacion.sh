#!/usr/bin/env bash
# Prueba la migración de evidencia de reparación sin aplicarla a la base local:
# abre una transacción, aplica la migración completa, ejecuta la prueba SQL y
# revierte. Nada queda instalado en el contenedor (las secuencias no se usan:
# todas las fixtures tienen ids explícitos).
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
migracion="$raiz/supabase/migrations/20261106120000_evidencia_reparacion.sql"
prueba="$raiz/supabase/tests/evidencia_reparacion.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
{
  printf 'begin;\n'
  emitir "$migracion"
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

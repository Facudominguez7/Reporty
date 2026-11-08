#!/usr/bin/env bash
# Prueba la participación de administración en el flujo de reparaciones sin aplicarla
# a la base local: abre una transacción, instala la migración base si todavía no está
# aplicada, aplica las incrementales 20261107120000, 20261108120000 y 20261109120000
# completas, ejecuta la prueba SQL y revierte (las fixtures usan ids explícitos).
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
base="$raiz/supabase/migrations/20261106120000_evidencia_reparacion.sql"
incremental="$raiz/supabase/migrations/20261107120000_admin_participa_reparacion.sql"
cancelacion="$raiz/supabase/migrations/20261108120000_cancelacion_revision_reparado.sql"
impugnacion="$raiz/supabase/migrations/20261109120000_historial_aceptar_impugnacion.sql"
prueba="$raiz/supabase/tests/admin_reparacion.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
{
  printf 'begin;\n'
  # Compone el estado desplegado: con la base ya aplicada solo se instala la
  # incremental; sin ella se instala primero el archivo base completo.
  if [[ "$(docker exec "$contenedor" psql -U postgres -d postgres -Atc "select to_regclass('public.evidencias_reparacion') is not null")" != "t" ]]; then
    emitir "$base"
  fi
  emitir "$incremental"
  emitir "$cancelacion"
  emitir "$impugnacion"
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

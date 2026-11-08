#!/usr/bin/env bash
# Prueba el archivo histórico de auditoría sin aplicarlo a la base local: abre una
# transacción, instala la migración incremental del archivo (y la base de auditoría
# si todavía no está aplicada), ejecuta la prueba SQL y revierte.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
base="$raiz/supabase/migrations/20261027150338_admin_audit.sql"
acciones="$raiz/supabase/migrations/20261106120000_evidencia_reparacion.sql"
archivo="$raiz/supabase/migrations/20261110120000_auditoria_archivo_r2.sql"
api="$raiz/supabase/migrations/20261110120100_auditoria_archivo_api.sql"
endurecimiento="$raiz/supabase/migrations/20261110120200_auditoria_archivo_recuperacion.sql"
mensual="$raiz/supabase/migrations/20261110120300_auditoria_archivo_lote_mensual.sql"
prueba="$raiz/supabase/tests/auditoria_archivo_r2.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
{
  printf 'begin;\n'
  # Compone el estado desplegado: la tabla de auditoría y su catálogo vigente,
  # y después la migración del archivo histórico.
  if [[ "$(docker exec "$contenedor" psql -U postgres -d postgres -Atc "select to_regclass('public.audit_events') is not null")" != "t" ]]; then
    emitir "$base"
  fi
  if [[ "$(docker exec "$contenedor" psql -U postgres -d postgres -Atc "select to_regclass('public.audit_archives') is not null")" != "t" ]]; then
    # El catálogo de acciones vigente viene de la migración de evidencia de reparación.
    if [[ "$(docker exec "$contenedor" psql -U postgres -d postgres -Atc "select count(*) from pg_constraint where conname = 'audit_events_action_check' and pg_get_constraintdef(oid) like '%evidence_submitted%'" )" != "1" ]]; then
      emitir "$acciones"
    fi
    emitir "$archivo"
    emitir "$api"
    emitir "$endurecimiento"
  fi
  # El corte mensual redefine funciones: se aplica siempre, también sobre una base ya migrada.
  emitir "$mensual"
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

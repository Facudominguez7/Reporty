#!/usr/bin/env bash
# Prueba la RPC candidata sobre la migración ya instalada, en una transacción revertida.
# La transacción no revierte el avance de secuencias.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
migracion="$raiz/supabase/migrations/20261029120000_votos_exclusivos.sql"
prueba="$raiz/supabase/tests/report_vote_exclusivo.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
{
  printf 'begin;\n'
  # No recrear la vista ni los triggers ya instalados en la base local.
  awk '/^create function public.registrar_voto_exclusivo\(/ { activo=1; sub(/^create function/, "create or replace function") } activo { print } activo && /^end \$\$;/ { exit }' "$migracion"
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

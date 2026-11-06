#!/usr/bin/env bash
# Prueba la RPC vigente sobre la migración ya instalada, en una transacción revertida.
# Se extrae el bloque marcado de la migración que la reemplaza (evidencia de reparación)
# —archivo del voto retirado más la RPC— y no la versión anterior, así la prueba ejerce
# el contrato que realmente se despliega.
# La transacción no revierte el avance de secuencias.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
migracion="$raiz/supabase/migrations/20261106120000_evidencia_reparacion.sql"
prueba="$raiz/supabase/tests/report_vote_exclusivo.sql"
emitir() { while IFS= read -r linea || [[ -n "$linea" ]]; do printf '%s\n' "$linea"; done < "$1"; }
{
  printf 'begin;\n'
  # Con la migración aplicada, el archivo y su tabla ya existen: solo se reemplaza la RPC.
  # Sin ella, se instala el bloque autosuficiente (archivo del voto retirado más la RPC).
  if [[ "$(docker exec "$contenedor" psql -Atc "select to_regclass('public.votos_reparado_historial') is not null")" == "t" ]]; then
    awk '/^create or replace function public\.registrar_voto_exclusivo\(/ { activo=1 } activo { print } activo && /^end \$\$;/ { exit }' "$migracion"
  else
    awk '/^-- BEGIN voto-exclusivo/ { activo=1; next } /^-- END voto-exclusivo/ { activo=0 } activo { print }' "$migracion"
  fi
  emitir "$prueba"
  printf 'rollback;\n'
} | docker exec -i "$contenedor" psql -U postgres -d postgres -v ON_ERROR_STOP=1

#!/usr/bin/env bash
# Prueba la prevalidación con historiales y comandos simulados, sin conexiones reales.
set -euo pipefail
raiz=$(cd "$(dirname "$0")/../.." && pwd)
temporal=$(mktemp -d)
trap 'rm -rf "$temporal"' EXIT
mkdir -p "$temporal/bin" "$temporal/migraciones"
cat > "$temporal/bin/psql" <<'PSUB'
#!/usr/bin/env bash
if [[ ${FALLAR_PSQL:-0} == 1 ]]; then exit 1; fi
[[ ${PGOPTIONS:-} == '-c default_transaction_read_only=on' && $* == *'BEGIN READ ONLY; SELECT version FROM supabase_migrations.schema_migrations ORDER BY version; COMMIT;'* ]] || exit 1
printf '%s' "$HISTORIAL_SIMULADO"
PSUB
chmod +x "$temporal/bin/psql"
export PATH="$temporal/bin:$PATH" SUPABASE_DB_URL='postgresql://simulado' CORTE_APROBADO=20260101000002
export DIRECTORIO_MIGRACIONES="$temporal/migraciones"
for version in 20260101000001 20260101000002 20260101000003; do
  : > "$temporal/migraciones/${version}_prueba.sql"
done
casos=0
probar() {
  # Comprueba código, salida y ausencia de errores para cada historial simulado.
  local nombre=$1 esperado=$2 historial=$3 salida=$4 codigo=0
  HISTORIAL_SIMULADO=$historial bash "$raiz/scripts/produccion/verificar-migraciones.sh" >"$temporal/salida" 2>"$temporal/error" || codigo=$?
  if [[ $codigo != "$esperado" ]] || ! grep -Fq "$salida" "$temporal/salida" "$temporal/error" ||
    { [[ $esperado == 0 ]] && [[ -s $temporal/error ]]; } ||
    { [[ $esperado != 0 ]] && [[ -s $temporal/salida ]]; }; then
    printf 'FALLÓ %s (código %s)\n' "$nombre" "$codigo" >&2
    return 1
  fi
  casos=$((casos + 1))
}
probar 'pendiente' 0 $'20260101000001\n20260101000002\n' '1 migración(es) pendiente(s)'
probar 'sin cambios' 0 $'20260101000001\n20260101000002\n20260101000003\n' '0 migración(es) pendiente(s)'
probar 'historial vacío' 1 '' 'historial remoto'
probar 'corte no aplicado' 1 $'20260101000001\n' 'corte aprobado'
probar 'versión desconocida' 1 $'20260101000001\n20260101000002\n20260101000004\n' 'prefijo'
probar 'hueco' 1 $'20260101000001\n20260101000003\n' 'prefijo'
probar 'duplicado remoto' 1 $'20260101000001\n20260101000001\n20260101000002\n' 'prefijo'
export CORTE_APROBADO=''
probar 'corte sin configurar' 1 $'20260101000001\n20260101000002\n' 'corte aprobado'
export CORTE_APROBADO=20260101000002 FALLAR_PSQL=1
probar 'error de consulta' 1 '' 'consulta'
unset FALLAR_PSQL
: > "$temporal/migraciones/20260101000002_duplicada.sql"
probar 'duplicado local' 1 $'20260101000001\n20260101000002\n' 'duplicada'
printf '%s pruebas aprobadas\n' "$casos"

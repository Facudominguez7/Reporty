#!/usr/bin/env bash
# Compara el historial remoto de solo lectura con el prefijo local y el corte aprobado.
set -euo pipefail

fallar() {
  # Detiene el despliegue sin exponer la cadena de conexión.
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

[[ ${CORTE_APROBADO:-} =~ ^[0-9]{14}$ ]] || fallar 'falta configurar un corte aprobado de 14 dígitos.'
[[ -n ${SUPABASE_DB_URL:-} ]] || fallar 'falta la conexión de producción.'
directorio=${DIRECTORIO_MIGRACIONES:-supabase/migrations}
[[ -d $directorio ]] || fallar 'no existe el directorio de migraciones.'
shopt -s nullglob
archivos=("$directorio"/*.sql)
((${#archivos[@]} > 0)) || fallar 'no hay migraciones locales.'
locales=()
for archivo in "${archivos[@]}"; do
  nombre=${archivo##*/}
  [[ $nombre =~ ^([0-9]{14})_.+\.sql$ ]] || fallar 'nombre de migración local inválido.'
  version=${BASH_REMATCH[1]}
  if ((${#locales[@]} > 0)) && [[ $version == "${locales[${#locales[@]}-1]}" ]]; then
    fallar 'versión local duplicada.'
  fi
  locales+=("$version")
done

# La sesión y la transacción son de solo lectura; no se realizan reparaciones.
if ! historial=$(PGOPTIONS='-c default_transaction_read_only=on' psql "$SUPABASE_DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c 'BEGIN READ ONLY; SELECT version FROM supabase_migrations.schema_migrations ORDER BY version; COMMIT;' 2>/dev/null); then
  fallar 'falló la consulta del historial remoto.'
fi
[[ -n $historial ]] || fallar 'el historial remoto está vacío.'
mapfile -t remotas <<< "$historial"
((${#remotas[@]} <= ${#locales[@]})) || fallar 'el historial remoto no es un prefijo local.'
corte_encontrado=0
for i in "${!remotas[@]}"; do
  [[ ${remotas[$i]} == "${locales[$i]}" ]] || fallar 'el historial remoto no es un prefijo local.'
  [[ ${remotas[$i]} != "$CORTE_APROBADO" ]] || corte_encontrado=1
done
((corte_encontrado == 1)) || fallar 'el corte aprobado no está aplicado en el historial remoto.'
printf '%s migración(es) pendiente(s).\n' "$((${#locales[@]} - ${#remotas[@]}))"

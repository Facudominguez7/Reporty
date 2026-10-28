#!/usr/bin/env bash
set -euo pipefail

container="${SUPABASE_DB_CONTAINER:-supabase_db_JackeMate}"
if ! docker ps --format '{{.Names}}' | grep -Fxq "$container"; then
  echo "Local Supabase database container '$container' is not running." >&2
  exit 1
fi

suffix="$(node -e "process.stdout.write(String(require('node:crypto').randomInt(1, 999999999999)).padStart(12, '0'))")"
report_id="-$suffix"
author="10000000-0000-0000-0000-${suffix}"
voter1="20000000-0000-0000-0000-${suffix}"
voter2="30000000-0000-0000-0000-${suffix}"
voter3="40000000-0000-0000-0000-${suffix}"
voter4="50000000-0000-0000-0000-${suffix}"
voter5="60000000-0000-0000-0000-${suffix}"

psql() { docker exec "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
  psql -c "delete from public.reportes_revision_rechazo where reporte_id=$report_id; delete from public.reportes where id=$report_id; delete from auth.users where id in ('$author','$voter1','$voter2','$voter3','$voter4','$voter5');" >/dev/null
}
trap cleanup EXIT

psql -c "insert into auth.users(id,email) values ('$author','race-author-${suffix}@invalid.test'),('$voter1','race-voter1-${suffix}@invalid.test'),('$voter2','race-voter2-${suffix}@invalid.test'),('$voter3','race-voter3-${suffix}@invalid.test'),('$voter4','race-voter4-${suffix}@invalid.test'),('$voter5','race-voter5-${suffix}@invalid.test'); insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values ($report_id,'$author','Concurrency fixture',0,0,1); insert into public.votos_no_existe(reporte_id,usuario_id) values ($report_id,'$voter1'),($report_id,'$voter2'),($report_id,'$voter3');" >/dev/null

psql -c "begin; insert into public.votos_no_existe(reporte_id,usuario_id) values ($report_id,'$voter4'); select pg_sleep(2); commit;" &
first_transaction=$!
sleep 0.3
psql -c "insert into public.votos_no_existe(reporte_id,usuario_id) values ($report_id,'$voter5');" >/dev/null
wait "$first_transaction"

result="$(psql -Atc "select s.votos_no_existe_count || '|' || coalesce(r.estado,'missing') from public.reportes_vote_summary s left join public.reportes_revision_rechazo r on r.reporte_id=s.reporte_id where s.reporte_id=$report_id;")"
if [[ "$result" != "5|pendiente" ]]; then
  echo "Expected five votes and a pending review; got '$result'." >&2
  exit 1
fi

echo "OK concurrent report votes: aggregate=5, review=pendiente"

#!/usr/bin/env bash
set -euo pipefail

container="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
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
first_transaction=""

psql() { docker exec "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
  if [[ -n "$first_transaction" ]]; then wait "$first_transaction" 2>/dev/null || true; fi
  psql -c "drop trigger if exists a_test_pause_report_vote on public.votos_no_existe; drop function if exists private.test_pause_report_vote(); delete from public.reportes where id=$report_id; delete from auth.users where id in ('$author','$voter1','$voter2','$voter3','$voter4','$voter5');" >/dev/null
}
trap cleanup EXIT

psql -c "insert into auth.users(id,email) values ('$author','race-author-${suffix}@invalid.test'),('$voter1','race-voter1-${suffix}@invalid.test'),('$voter2','race-voter2-${suffix}@invalid.test'),('$voter3','race-voter3-${suffix}@invalid.test'),('$voter4','race-voter4-${suffix}@invalid.test'),('$voter5','race-voter5-${suffix}@invalid.test'); insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values ($report_id,'$author','Concurrency fixture',0,0,1); insert into public.votos_no_existe(reporte_id,usuario_id) values ($report_id,'$voter1'),($report_id,'$voter2'),($report_id,'$voter3'); create function private.test_pause_report_vote() returns trigger language plpgsql as \$\$ begin if current_setting('application_name', true) = 'report-vote-race-holder' then perform pg_sleep(2); end if; return new; end; \$\$; create trigger a_test_pause_report_vote after insert on public.votos_no_existe for each row execute function private.test_pause_report_vote();" >/dev/null

# Pause vote four after its FK check but before the aggregate trigger, then submit vote five.
docker exec -e PGAPPNAME=report-vote-race-holder "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "insert into public.votos_no_existe(reporte_id,usuario_id) values ($report_id,'$voter4');" &
first_transaction=$!
paused=false
for _ in $(seq 1 100); do
  if [[ "$(psql -Atc "select count(*) from pg_stat_activity where application_name='report-vote-race-holder' and wait_event='PgSleep'")" == "1" ]]; then
    paused=true
    break
  fi
  sleep 0.05
done
if [[ "$paused" != true ]]; then
  echo "The first vote did not reach the deterministic post-FK pause." >&2
  exit 1
fi
psql -c "insert into public.votos_no_existe(reporte_id,usuario_id) values ($report_id,'$voter5');" >/dev/null
wait "$first_transaction"
first_transaction=""

result="$(psql -Atc "select s.votos_no_existe_count || '|' || coalesce(r.estado,'missing') from public.reportes_vote_summary s left join public.reportes_revision_rechazo r on r.reporte_id=s.reporte_id where s.reporte_id=$report_id;")"
if [[ "$result" != "5|pendiente" ]]; then
  echo "Expected five votes and a pending review; got '$result'." >&2
  exit 1
fi

echo "OK concurrent report votes: aggregate=5, review=pendiente"

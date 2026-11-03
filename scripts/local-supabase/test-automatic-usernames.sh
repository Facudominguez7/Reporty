#!/usr/bin/env bash
# Uses a disposable database; never resets or edits the existing local database.
set -euo pipefail
container="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
# Apply the candidate and tests in one transaction, then roll everything back.
node -e 'const fs = require("fs"); const migration = fs.readFileSync("supabase/migrations/20261103145429_automatic_usernames.sql", "utf8"); const test = fs.readFileSync("supabase/tests/automatic_usernames.sql", "utf8"); process.stdout.write("begin;\n" + migration + "\n" + test.replace(/^begin;\s*$/m, "").replace(/^rollback;\s*$/m, "") + "\nrollback;\n")' | docker exec -i "$container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 >/dev/null
echo 'OK: local profile behavior (rolled back)'

db="username_test_$(node -e 'process.stdout.write(require("node:crypto").randomBytes(8).toString("hex"))')"
created=false
cleanup() {
  if [[ -n "${first:-}" ]]; then wait "$first" 2>/dev/null || true; fi
  if [[ "$created" == true ]]; then docker exec "$container" dropdb -U postgres --if-exists "$db" >/dev/null; fi
}
trap cleanup EXIT

docker exec "$container" createdb -U postgres -T template0 "$db"
created=true
psql_db() { docker exec -i "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 "$@"; }
psql_db <<'SQL' >/dev/null
create schema auth;
create schema private;
create table public.profiles (id uuid primary key, email text, rol_id integer, username text unique);
create table auth.users (id uuid primary key, email text, is_anonymous boolean, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
SQL
psql_db < supabase/migrations/20261103145429_automatic_usernames.sql >/dev/null
psql_db <<'SQL' >/dev/null
create trigger on_auth_user_profile_sync after insert or update of email, is_anonymous on auth.users
for each row execute function private.sync_profile_from_auth_user();
SQL

# Hold the first username's unique-index entry uncommitted while the second signup starts.
docker exec -e PGAPPNAME="${db}_first" "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c "begin; insert into auth.users values (gen_random_uuid(), 'first@test.invalid', false, '{\"provider\":\"google\"}', '{\"full_name\":\"Maria Ejemplo\"}'); select pg_sleep(3); commit;" >/dev/null &
first=$!
ready=false
for _ in $(seq 1 60); do
  if [[ "$(psql_db -Atc "select count(*) from pg_stat_activity where application_name='${db}_first' and wait_event='PgSleep'")" == 1 ]]; then ready=true; break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then echo 'First signup did not reach the concurrent test barrier.' >&2; wait "$first" || true; exit 1; fi
psql_db -c "insert into auth.users values (gen_random_uuid(), 'second@test.invalid', false, '{\"provider\":\"google\"}', '{\"full_name\":\"Maria Ejemplo\"}');" >/dev/null
wait "$first"
result="$(psql_db -Atc "select string_agg(username, ',' order by username) from public.profiles")"
[[ "$result" == 'maria_ejemplo,maria_ejemplo_1' ]] || { echo "Unexpected concurrent usernames: $result" >&2; exit 1; }
echo 'OK: concurrent signups received unique usernames'

# Two simultaneous conversion attempts must preserve one username and the promoted role.
psql_db -c "insert into auth.users values ('10000000-0000-0000-0000-000000000001', null, true, '{}', '{}');" >/dev/null
docker exec -e PGAPPNAME="${db}_promotion" "$container" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=1 -c "begin; update auth.users set is_anonymous=false, email='promoted@test.invalid' where id='10000000-0000-0000-0000-000000000001'; select pg_sleep(3); commit;" >/dev/null &
first=$!
ready=false
for _ in $(seq 1 60); do
  if [[ "$(psql_db -Atc "select count(*) from pg_stat_activity where application_name='${db}_promotion' and wait_event='PgSleep'")" == 1 ]]; then ready=true; break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then echo 'First conversion did not reach the concurrent test barrier.' >&2; wait "$first" || true; exit 1; fi
psql_db -c "update auth.users set is_anonymous=false, email='promoted@test.invalid' where id='10000000-0000-0000-0000-000000000001';" >/dev/null
wait "$first"
result="$(psql_db -Atc "select username || '|' || rol_id from public.profiles where id='10000000-0000-0000-0000-000000000001'")"
[[ "$result" == 'promoted|2' ]] || { echo "Unexpected concurrent conversion: $result" >&2; exit 1; }
echo 'OK: concurrent conversions preserve the username and role'

# A different unique violation must escape instead of being retried as a username collision.
psql_db <<'SQL' >/dev/null
alter table public.profiles add constraint test_unique_email unique (email);
do $$
declare constraint_name text;
begin
  begin
    insert into auth.users values (gen_random_uuid(), 'first@test.invalid', false, '{"provider":"email"}', '{}');
    raise exception 'Unrelated unique violation was swallowed';
  exception when unique_violation then
    get stacked diagnostics constraint_name = constraint_name;
    if constraint_name <> 'test_unique_email' then raise; end if;
  end;
  if (select count(*) from auth.users) <> 3 then raise exception 'Failed signup left an auth user'; end if;
end $$;
SQL
echo 'OK: unrelated unique violations propagate'

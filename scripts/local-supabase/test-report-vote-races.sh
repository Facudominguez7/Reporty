#!/usr/bin/env bash
# Prueba carreras con registros dedicados; no borra ni modifica datos existentes.
set -euo pipefail
contenedor="${SUPABASE_DB_CONTAINER:-supabase_db_Reporty}"
psql_local() { docker exec "$contenedor" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
if [[ "$(psql_local -Atc "select to_regprocedure('public.registrar_voto_exclusivo(bigint,uuid,text)') is not null")" != t ]]; then
  echo 'Falta aplicar la migración local de votos exclusivos.' >&2
  exit 1
fi
sufijo="$(node -e "process.stdout.write(String(require('node:crypto').randomInt(1,999999999999)).padStart(12,'0'))")"
autor="10000000-0000-0000-0000-$sufijo"
votante="20000000-0000-0000-0000-$sufijo"
reporte="-$sufijo"
reporte_cierre="-$((10#$sufijo + 1000000000000))"
nombre="voto-exclusivo-$sufijo"
echo "Registros de prueba: autor=$autor votante=$votante reportes=$reporte,$reporte_cierre"
# La instancia puede estar vacía; agregar únicamente catálogos ausentes del seed oficial.
psql_local -c "insert into public.roles(id,nombre) values (2,'ciudadano') on conflict (id) do nothing; insert into public.estados(id,nombre) values (1,'Pendiente'),(2,'Reparado') on conflict (id) do nothing;" >/dev/null
psql_local -c "insert into auth.users(id,email) values ('$autor','autor-$sufijo@invalid.test'),('$votante','votante-$sufijo@invalid.test'); insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values ($reporte,'$autor','Prueba votos $sufijo',0,0,1),($reporte_cierre,'$autor','Prueba cierre $sufijo',0,0,1);" >/dev/null
# La primera transacción mantiene el bloqueo hasta que la segunda esté esperando.
docker exec -e PGAPPNAME="$nombre" "$contenedor" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; select public.registrar_voto_exclusivo($reporte,'$votante','no_existe'); select pg_sleep(3); commit;" >/dev/null &
pid=$!
for _ in $(seq 1 100); do
  [[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$nombre' and wait_event='PgSleep'")" == 1 ]] && break
  sleep 0.05
done
[[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$nombre' and wait_event='PgSleep'")" == 1 ]] || { echo 'Primera transacción no alcanzó la pausa.' >&2; wait "$pid" || true; exit 1; }
psql_local -c "select public.registrar_voto_exclusivo($reporte,'$votante','reparado');" >/dev/null
wait "$pid"
resultado="$(psql_local -Atc "select (select count(*) from public.votos_no_existe where reporte_id=$reporte and usuario_id='$votante') || '|' || (select count(*) from public.votos_reparado where reporte_id=$reporte and usuario_id='$votante') || '|' || (select puntos from public.profiles where id='$votante')")"
[[ "$resultado" == '0|1|1' ]] || { echo "Resultado inesperado: $resultado" >&2; exit 1; }
echo 'OK votos simultáneos: un voto y un punto'
# Cerrar el segundo reporte mientras otro intento de voto espera el mismo bloqueo.
docker exec -e PGAPPNAME="$nombre" "$contenedor" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; update public.reportes set estado_id=2 where id=$reporte_cierre; select pg_sleep(3); commit;" >/dev/null &
pid=$!
for _ in $(seq 1 100); do
  [[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$nombre' and wait_event='PgSleep'")" == 1 ]] && break
  sleep 0.05
done
[[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$nombre' and wait_event='PgSleep'")" == 1 ]] || { echo 'Cierre no alcanzó la pausa.' >&2; wait "$pid" || true; exit 1; }
if psql_local -c "select public.registrar_voto_exclusivo($reporte_cierre,'$votante','reparado');"; then
  echo 'Un voto sobre reporte cerrado fue aceptado.' >&2; wait "$pid" || true; exit 1
fi
wait "$pid"
resultado="$(psql_local -Atc "select (select count(*) from public.votos_reparado where reporte_id=$reporte_cierre) || '|' || (select puntos from public.profiles where id='$votante')")"
[[ "$resultado" == '0|1' ]] || { echo "Resultado inesperado después del cierre: $resultado" >&2; exit 1; }
echo 'OK carrera con cierre: voto rechazado y puntos sin cambios'

# El quinto voto cierra dentro del mismo bloqueo; un cambio concurrente debe rechazarse.
reporte_umbral="-$((10#$sufijo + 2000000000000))"
votante2="30000000-0000-0000-0000-$sufijo"
votante3="40000000-0000-0000-0000-$sufijo"
votante4="50000000-0000-0000-0000-$sufijo"
votante5="60000000-0000-0000-0000-$sufijo"
echo "Registros de umbral: reporte=$reporte_umbral votantes=$votante2,$votante3,$votante4,$votante5"
psql_local -c "insert into auth.users(id,email) values ('$votante2','votante2-$sufijo@invalid.test'),('$votante3','votante3-$sufijo@invalid.test'),('$votante4','votante4-$sufijo@invalid.test'),('$votante5','votante5-$sufijo@invalid.test'); insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values ($reporte_umbral,'$autor','Prueba umbral $sufijo',0,0,1); select public.registrar_voto_exclusivo($reporte_umbral,'$votante','reparado'), public.registrar_voto_exclusivo($reporte_umbral,'$votante2','reparado'), public.registrar_voto_exclusivo($reporte_umbral,'$votante3','reparado'), public.registrar_voto_exclusivo($reporte_umbral,'$votante4','reparado');" >/dev/null
docker exec -e PGAPPNAME="$nombre" "$contenedor" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; select public.registrar_voto_exclusivo($reporte_umbral,'$votante5','reparado'); select pg_sleep(3); commit;" >/dev/null &
pid=$!
for _ in $(seq 1 100); do
  [[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$nombre' and wait_event='PgSleep'")" == 1 ]] && break
  sleep 0.05
done
[[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$nombre' and wait_event='PgSleep'")" == 1 ]] || { echo 'Quinto voto no alcanzó la pausa.' >&2; wait "$pid" || true; exit 1; }
if psql_local -c "select public.registrar_voto_exclusivo($reporte_umbral,'$votante','no_existe');"; then
  echo 'Cambio después del cierre fue aceptado.' >&2; wait "$pid" || true; exit 1
fi
wait "$pid"
resultado="$(psql_local -Atc "select (select estado_id from public.reportes where id=$reporte_umbral) || '|' || (select count(*) from public.votos_reparado where reporte_id=$reporte_umbral) || '|' || (select count(*) from public.votos_no_existe where reporte_id=$reporte_umbral) || '|' || (select count(*) from public.historial_estados where reporte_id=$reporte_umbral and estado_nuevo_id=2) || '|' || (select puntos from public.profiles where id='$autor')")"
[[ "$resultado" == '2|5|0|1|5' ]] || { echo "Resultado inesperado en umbral: $resultado" >&2; exit 1; }
echo 'OK quinto voto concurrente: cierre, cinco votos, historial y puntos'

# Dos reportes cruzan autor y quinto votante. Se bloquea el perfil menor para
# forzar que ambos intentos se solapen antes de liberar el orden de perfiles.
reporte_cruce_a="-$((10#$sufijo + 3000000000000))"
reporte_cruce_b="-$((10#$sufijo + 4000000000000))"
marca_a="$nombre-cruce-a"
marca_b="$nombre-cruce-b"
marca_bloqueo="$nombre-perfil"
echo "Registros de cruce: reportes=$reporte_cruce_a,$reporte_cruce_b"
psql_local -c "insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values ($reporte_cruce_a,'$votante','Cruce A $sufijo',0,0,1),($reporte_cruce_b,'$autor','Cruce B $sufijo',0,0,1); select public.registrar_voto_exclusivo(r, v, 'reparado') from unnest(array[$reporte_cruce_a,$reporte_cruce_b]::bigint[]) r cross join unnest(array['$votante2','$votante3','$votante4','$votante5']::uuid[]) v;" >/dev/null
antes_autor="$(psql_local -Atc "select puntos from public.profiles where id='$autor'")"
antes_votante="$(psql_local -Atc "select puntos from public.profiles where id='$votante'")"
docker exec -e PGAPPNAME="$marca_bloqueo" "$contenedor" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; select id from public.profiles where id='$autor' for no key update; select pg_sleep(10); commit;" >/dev/null &
pid_bloqueo=$!
for _ in $(seq 1 100); do
  [[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$marca_bloqueo' and wait_event='PgSleep'")" == 1 ]] && break
  sleep 0.05
done
[[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$marca_bloqueo' and wait_event='PgSleep'")" == 1 ]] || { echo 'No se obtuvo el bloqueo de perfil.' >&2; wait "$pid_bloqueo" || true; exit 1; }
docker exec -e PGAPPNAME="$marca_a" "$contenedor" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select public.registrar_voto_exclusivo($reporte_cruce_a,'$autor','reparado');" >/dev/null &
pid_a=$!
for _ in $(seq 1 100); do
  [[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$marca_a' and wait_event_type='Lock'")" == 1 ]] && break
  sleep 0.05
done
[[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name='$marca_a' and wait_event_type='Lock'")" == 1 ]] || { echo 'Primer voto no esperó el perfil.' >&2; wait "$pid_bloqueo" || true; wait "$pid_a" || true; exit 1; }
docker exec -e PGAPPNAME="$marca_b" "$contenedor" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select public.registrar_voto_exclusivo($reporte_cruce_b,'$votante','reparado');" >/dev/null &
pid_b=$!
for _ in $(seq 1 100); do
  [[ "$(psql_local -Atc "select count(*) from pg_stat_activity where application_name in ('$marca_a','$marca_b') and wait_event_type='Lock'")" == 2 ]] && break
  sleep 0.05
done
esperando="$(psql_local -Atc "select count(*) from pg_stat_activity where application_name in ('$marca_a','$marca_b') and wait_event_type='Lock'")"
wait "$pid_bloqueo"
fallo=0
wait "$pid_a" || fallo=1
wait "$pid_b" || fallo=1
[[ "$esperando" == 2 && "$fallo" == 0 ]] || { echo 'Cruce no completó ambos votos concurrentes.' >&2; exit 1; }
resultado="$(psql_local -Atc "select (select count(*) from public.reportes where id in ($reporte_cruce_a,$reporte_cruce_b) and estado_id=2) || '|' || (select count(*) from public.historial_estados where reporte_id in ($reporte_cruce_a,$reporte_cruce_b) and estado_nuevo_id=2) || '|' || ((select puntos from public.profiles where id='$autor')-$antes_autor) || '|' || ((select puntos from public.profiles where id='$votante')-$antes_votante)")"
[[ "$resultado" == '2|2|6|6' ]] || { echo "Resultado inesperado en cruce: $resultado" >&2; exit 1; }
echo 'OK cruce de umbrales: ambos cierres y premios sin interbloqueo'

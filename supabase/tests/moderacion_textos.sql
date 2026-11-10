-- Ejecutar exclusivamente contra Supabase local con migraciones aplicadas.
-- No modifica fixtures existentes; transacción revertida al finalizar.
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '5s';
select plan(1);

create function pg_temp.verificar_denegacion(p_sql text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then return;
  end;
  raise exception 'Se permitió una operación prohibida: %', p_sql;
end;
$$;
grant execute on function pg_temp.verificar_denegacion(text) to anon, authenticated;

set local role anon;
select pg_temp.verificar_denegacion($q$select public.reservar_presupuesto_texto('00000000-0000-0000-0000-000000000001')$q$);
select pg_temp.verificar_denegacion('select * from public.reservas_presupuesto_texto');
select pg_temp.verificar_denegacion($q$insert into public.reservas_presupuesto_texto(usuario_id) values ('00000000-0000-0000-0000-000000000001')$q$);
reset role;
set local role authenticated;
select pg_temp.verificar_denegacion($q$select public.reservar_presupuesto_texto('00000000-0000-0000-0000-000000000001')$q$);
select pg_temp.verificar_denegacion('select * from public.reservas_presupuesto_texto');
select pg_temp.verificar_denegacion($q$insert into public.reservas_presupuesto_texto(usuario_id) values ('00000000-0000-0000-0000-000000000001')$q$);
reset role;

set local role service_role;
do $$
declare
  v_user uuid := '10000000-0000-0000-0000-000000000001';
  v_other uuid := '10000000-0000-0000-0000-000000000002';
  i integer;
begin
  if public.reservar_presupuesto_texto(null) then raise exception 'UUID nulo aceptado'; end if;
  for i in 1..20 loop
    if not public.reservar_presupuesto_texto(v_user) then raise exception 'Límite per-user temprano'; end if;
  end loop;
  if public.reservar_presupuesto_texto(v_user) then raise exception 'Límite per-user excedido'; end if;
  if not public.reservar_presupuesto_texto(v_other) then raise exception 'Otro usuario bloqueado'; end if;
end;
$$;

-- Hasta 150 llamadas en total; ningún usuario supera sus 20 llamadas.
do $$
declare
  i integer;
  v_user uuid;
begin
  for i in 1..129 loop
    v_user := ('20000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid;
    if not public.reservar_presupuesto_texto(v_user) then raise exception 'Límite global antes de 150'; end if;
  end loop;
  if public.reservar_presupuesto_texto('30000000-0000-0000-0000-000000000001') then
    raise exception 'Límite global de 9000 neuronas excedido';
  end if;
end;
$$;
reset role;

-- Evidencia del contrato de aislamiento y de la duración diaria UTC.
do $$
begin
  if (select count(*) from public.reservas_presupuesto_texto) <> 150 then
    raise exception 'Cantidad de reservas inesperada';
  end if;
  if (select count(*) from public.reservas_presupuesto_texto
      where reservado_at >= pg_catalog.date_trunc('day', pg_catalog.clock_timestamp() at time zone 'UTC') at time zone 'UTC') <> 150 then
    raise exception 'Reservas fuera del día UTC';
  end if;
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='reservar_presupuesto_texto'
      and (p.prosecdef is not true or p.proconfig is null or not ('search_path=""' = any(p.proconfig)))) then
    raise exception 'Función no hardened';
  end if;
  if has_function_privilege('anon','public.reservar_presupuesto_texto(uuid)','execute')
    or has_function_privilege('authenticated','public.reservar_presupuesto_texto(uuid)','execute')
    or not has_function_privilege('service_role','public.reservar_presupuesto_texto(uuid)','execute') then
    raise exception 'Grants de RPC incorrectos';
  end if;
end;
$$;

select ok(true, 'All contextual text budget SQL assertions passed');
select * from finish();
rollback;

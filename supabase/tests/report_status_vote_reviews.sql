\set ON_ERROR_STOP on
begin;
create function pg_temp.exigir(ok boolean, mensaje text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;
create function pg_temp.denegado(sql text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'Operación privada permitida';
exception when insufficient_privilege then return;
end $$;
select pg_temp.exigir(not exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='reportes' and column_name='reparacion_reportada_at'
), 'El flujo de votos no debe conservar una marca separada de reparación del autor');
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000101','review-author@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000000102','review-voter-1@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000000103','review-voter-2@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000000104','review-voter-3@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000000105','review-voter-4@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000000106','review-voter-5@ejemplo.invalid');
update public.profiles set rol_id=1 where id='10000000-0000-0000-0000-000000000106';
insert into public.reportes(id,usuario_id,titulo,descripcion,lat,lon,estado_id) values
 (-93001,'10000000-0000-0000-0000-000000000101','Revisión por votos','Reporte de prueba',0,0,1);
set local role service_role;
insert into public.votos_no_existe(reporte_id,usuario_id) values
 (-93001,'10000000-0000-0000-0000-000000000102'),
 (-93001,'10000000-0000-0000-0000-000000000103'),
 (-93001,'10000000-0000-0000-0000-000000000104'),
 (-93001,'10000000-0000-0000-0000-000000000105');
select pg_temp.exigir((select votos_no_existe_count=4 from public.reportes_vote_summary where reporte_id=-93001),
 'El agregado debe conservar cuatro votos');
select pg_temp.exigir(not exists(select 1 from public.reportes_revision_rechazo where reporte_id=-93001),
 'Cuatro votos no deben abrir revisión');
insert into public.votos_no_existe(reporte_id,usuario_id) values
 (-93001,'10000000-0000-0000-0000-000000000106');
select pg_temp.exigir((select votos_no_existe_count=5 from public.reportes_vote_summary where reporte_id=-93001),
 'El agregado debe conservar cinco votos');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-93001),
 'Cinco votos no deben rechazar automáticamente');
select pg_temp.exigir((select estado='pendiente' and resuelto_at is null and resuelto_por is null
 from public.reportes_revision_rechazo where reporte_id=-93001), 'Cinco votos abren una revisión pendiente');
reset role;
set local role anon;
select pg_temp.denegado('select * from public.reportes_revision_rechazo');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000101","role":"authenticated"}',true);
select pg_temp.denegado('insert into public.votos_no_existe(reporte_id,usuario_id) values (-93001,auth.uid())');
select pg_temp.denegado('insert into public.votos_reparado(reporte_id,usuario_id) values (-93001,auth.uid())');
select pg_temp.denegado('select * from public.reportes_revision_rechazo');
reset role;
set local role service_role;
update public.reportes_revision_rechazo set estado='descartada',resuelto_at=now(),
 resuelto_por='10000000-0000-0000-0000-000000000106'
 where reporte_id=-93001 and estado='pendiente';
select pg_temp.exigir((select estado='descartada' and resuelto_at is not null
 and resuelto_por='10000000-0000-0000-0000-000000000106'
 from public.reportes_revision_rechazo where reporte_id=-93001), 'La resolución administrativa queda auditada');
reset role;
rollback;
\echo 'OK revisión por votos: umbral, persistencia, estado y permisos'

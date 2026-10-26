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
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','retiro@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000000002','admin-retiro@ejemplo.invalid');
update public.profiles set puntos = 17 where id = '10000000-0000-0000-0000-000000000001';
update public.profiles set rol_id = 1 where id = '10000000-0000-0000-0000-000000000002';
-- IDs negativos explícitos evitan consumir secuencias no transaccionales.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-91001,'10000000-0000-0000-0000-000000000001','Retiro sintético',0,0,null),
 (-91002,'10000000-0000-0000-0000-000000000001','Aprobación sintética',0,0,null);
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
select id, reporte, '10000000-0000-0000-0000-000000000001', repeat('a',64),
 '10000000-0000-0000-0000-000000000001/' || id::text
from (values ('10000000-0000-0000-0000-000000000003'::uuid,-91001),
 ('10000000-0000-0000-0000-000000000004'::uuid,-91002)) as f(id,reporte);
set local role service_role;
select pg_temp.exigir(public.decidir_imagen_moderacion('10000000-0000-0000-0000-000000000003',
 null,'REJECTED','["prueba"]','10000000-0000-0000-0000-000000000002'), 'Rechazo válido');
select pg_temp.exigir((select deleted_at is not null from public.reportes where id=-91001),
 'El rechazo debe retirar el reporte atómicamente');
select pg_temp.exigir(not public.decidir_imagen_moderacion('10000000-0000-0000-0000-000000000003',
 null,'REJECTED','[]','10000000-0000-0000-0000-000000000002'), 'CAS repetido');
select pg_temp.exigir((select puntos=17 from public.profiles where id='10000000-0000-0000-0000-000000000001'), 'No descontar puntos sin atribución');
select pg_temp.exigir(not public.acreditar_puntos_reporte(-91001), 'No acreditar tras retiro');
select pg_temp.exigir(public.acreditar_puntos_reporte(-91002), 'Acreditación inicial');
select pg_temp.exigir(not public.acreditar_puntos_reporte(-91002), 'No duplicar premio');
select pg_temp.exigir(public.decidir_imagen_moderacion('10000000-0000-0000-0000-000000000004',
 null,'REVIEW','[]','10000000-0000-0000-0000-000000000002'), 'REVIEW conservado');
select pg_temp.exigir(public.decidir_imagen_moderacion('10000000-0000-0000-0000-000000000004',
 null,'REJECTED','[]','10000000-0000-0000-0000-000000000002'), 'Retiro con premio');
select pg_temp.exigir((select puntos=17 from public.profiles where id='10000000-0000-0000-0000-000000000001'), 'Reversión exacta');
select pg_temp.exigir((select count(*)=2 and bool_and(
  propietario_id='10000000-0000-0000-0000-000000000001' and destinatario='retiro@ejemplo.invalid'
  and estado='pendiente' and omision is null and intentos=0)
  from public.avisos_retiro_reporte where reporte_id in (-91001,-91002)), 'Un aviso sólo al autor por reporte');
-- Mantenimiento terminal sí, reapertura no.
update public.moderacion_imagenes set operaciones=operaciones+1 where reporte_id=-91001;
do $$
declare t uuid;
begin
  t := public.reclamar_aviso_retiro(-91001);
  perform pg_temp.exigir(t is not null, 'Reclamo de aviso');
  perform pg_temp.exigir(public.reclamar_aviso_retiro(-91001) is null, 'Lease excluye segundo worker');
  perform pg_temp.exigir(not public.confirmar_aviso_retiro(-91001,gen_random_uuid()), 'Token inválido');
  perform pg_temp.exigir(public.confirmar_aviso_retiro(-91001,t), 'Confirmación aviso');
  perform pg_temp.exigir(not public.confirmar_aviso_retiro(-91001,t), 'Confirmación repetida');
  perform pg_temp.exigir(public.reclamar_aviso_retiro(-91001) is null, 'No reenviar confirmado');
  begin
    update public.moderacion_imagenes set decision='APPROVED',estado_publicacion='publicando'
      where reporte_id=-91001;
    raise exception 'Se reabrió evidencia retirada';
  exception when raise_exception then
    if sqlerrm <> 'Propietario o reporte inválido' then raise; end if;
  end;
  perform pg_temp.exigir((select decision='REJECTED' and estado_publicacion='rechazada'
    from public.moderacion_imagenes where reporte_id=-91001), 'Reapertura rollback');
end $$;
reset role;
-- Rama APPROVED en reporte independiente; no se reclasifica contenido legacy.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-91003,'10000000-0000-0000-0000-000000000001','Aprobado independiente',0,0,null);
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
values ('10000000-0000-0000-0000-000000000005',-91003,
 '10000000-0000-0000-0000-000000000001',repeat('b',64),
 '10000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000005');
set local role service_role;
do $$ declare t uuid; begin
  t := public.reclamar_imagen_moderacion('10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001');
  perform pg_temp.exigir(not public.decidir_imagen_moderacion(
    '10000000-0000-0000-0000-000000000005',gen_random_uuid(),'REJECTED','[]'), 'Token CAS inválido');
  perform pg_temp.exigir((select deleted_at is null from public.reportes where id=-91003), 'Token inválido no retira');
  perform pg_temp.exigir(public.decidir_imagen_moderacion(
    '10000000-0000-0000-0000-000000000005',t,'APPROVED','[]'), 'APPROVED preservado');
  perform pg_temp.exigir((select deleted_at is null from public.reportes where id=-91003), 'APPROVED no retira');
  perform pg_temp.exigir(not exists(select 1 from public.avisos_retiro_reporte where reporte_id=-91003), 'APPROVED sin aviso');
end $$;
reset role;
set local role anon;
select pg_temp.denegado('select * from public.avisos_retiro_reporte');
select pg_temp.denegado('select public.acreditar_puntos_reporte(-91001)');
select pg_temp.denegado('select public.reclamar_aviso_retiro(-91001)');
select pg_temp.denegado($q$select public.confirmar_aviso_retiro(-91001,'10000000-0000-0000-0000-000000000001')$q$);
select pg_temp.exigir(not exists(select 1 from public.reportes where id=-91001), 'RLS oculta retiro');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.denegado('select * from public.puntos_creacion_reporte');
select pg_temp.denegado('select * from public.avisos_retiro_reporte');
select pg_temp.denegado('select public.acreditar_puntos_reporte(-91002)');
select pg_temp.denegado('select public.reclamar_aviso_retiro(-91002)');
select pg_temp.denegado($q$select public.confirmar_aviso_retiro(-91002,'10000000-0000-0000-0000-000000000001')$q$);
select pg_temp.exigir(not exists(select 1 from public.reportes where id=-91001), 'Autor no ve retiro');
reset role;
-- Lease vencido: el nuevo token invalida al worker anterior sin duplicar aviso.
set local role service_role;
do $$ declare anterior uuid; actual uuid; begin
  anterior := public.reclamar_aviso_retiro(-91002);
  perform pg_temp.exigir(anterior is not null, 'Lease inicial');
  update public.avisos_retiro_reporte set reclamado_hasta=clock_timestamp()-interval '1 second'
    where reporte_id=-91002;
  actual := public.reclamar_aviso_retiro(-91002);
  perform pg_temp.exigir(actual is not null and actual<>anterior, 'Lease recuperado');
  perform pg_temp.exigir(not public.confirmar_aviso_retiro(-91002,anterior), 'Confirmación obsoleta');
  perform pg_temp.exigir((select estado='reclamado' and intentos=2 and enviado_at is null
    from public.avisos_retiro_reporte where reporte_id=-91002), 'Token obsoleto no modifica aviso');
  perform pg_temp.exigir(public.confirmar_aviso_retiro(-91002,actual), 'Confirmación recuperada');
  perform pg_temp.exigir(not public.confirmar_aviso_retiro(-91002,actual), 'Enviado no se duplica');
  perform pg_temp.exigir(public.reclamar_aviso_retiro(-91002) is null, 'Enviado no se reclama');
end $$;
reset role;

-- Rol invitado, claim anónimo persistido y permanente sin correo.
insert into auth.users(id,email,is_anonymous) values
 ('10000000-0000-0000-0000-000000000011','invitado@ejemplo.invalid',false),
 ('10000000-0000-0000-0000-000000000012','anonimo@ejemplo.invalid',true),
 ('10000000-0000-0000-0000-000000000013',null,false);
update public.profiles set rol_id=5 where id='10000000-0000-0000-0000-000000000011';
-- Aislar is_anonymous de rol=5: ciudadano anónimo y ciudadano permanente.
update public.profiles set rol_id=2 where id in
 ('10000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000013');
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id)
select -91000-n, ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'Matriz de destinatarios',0,0,null from generate_series(11,13) n;
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,-91000-n,
 ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,repeat('c',64),
 '10000000-0000-0000-0000-'||lpad(n::text,12,'0')||'/20000000-0000-0000-0000-'||lpad(n::text,12,'0')
from generate_series(11,13) n;
set local role service_role;
do $$ declare n integer; t uuid; begin
  for n in 11..13 loop
    perform pg_temp.exigir(public.acreditar_puntos_reporte(-91000-n)=(n=13), 'Premio según identidad');
    t := public.reclamar_imagen_moderacion(
      ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
      ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid);
    perform pg_temp.exigir(public.decidir_imagen_moderacion(
      ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,t,'REJECTED','["prueba automática"]'),
      'Retiro automático sin archivo');
    perform pg_temp.exigir((select deleted_at is not null from public.reportes where id=-91000-n), 'Matriz retirada');
    perform pg_temp.exigir((select estado='omitido' and destinatario is null
      and omision=case when n=13 then 'sin_correo' else 'invitado' end and intentos=0
      from public.avisos_retiro_reporte where reporte_id=-91000-n), 'Omisión exacta');
    perform pg_temp.exigir(public.reclamar_aviso_retiro(-91000-n) is null, 'Omitido no enviable');
    perform pg_temp.exigir((select puntos=0 from public.profiles
      where id=('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid), 'Saldo matriz');
  end loop;
end $$;
reset role;

-- Una falla real de INSERT debe revertir todos los efectos del CAS.
create function pg_temp.fallar_outbox() returns trigger language plpgsql as $$
begin
  if new.reporte_id=-91004 then raise exception 'Falla outbox inyectada' using errcode='P0001'; end if;
  return new;
end $$;
create trigger prueba_falla_outbox before insert on public.avisos_retiro_reporte
  for each row execute function pg_temp.fallar_outbox();
-- -91003 ya está APPROVED/publicando: una fixture independiente evita reabrirla.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-91004,'10000000-0000-0000-0000-000000000001','Rollback outbox',0,0,null);
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
values ('10000000-0000-0000-0000-000000000006',-91004,
 '10000000-0000-0000-0000-000000000001',repeat('d',64),
 '10000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000006');
set local role service_role;
select pg_temp.exigir(public.acreditar_puntos_reporte(-91004), 'Premio antes de falla');
do $$ begin
  begin
    perform public.decidir_imagen_moderacion('10000000-0000-0000-0000-000000000006',
      null,'REJECTED','["no debe persistir"]','10000000-0000-0000-0000-000000000002');
    raise exception 'No se propagó falla outbox';
  exception when raise_exception then
    if sqlerrm <> 'Falla outbox inyectada' or sqlstate <> 'P0001' then raise; end if;
  end;
  perform pg_temp.exigir((select deleted_at is null from public.reportes where id=-91004), 'Rollback baja');
  perform pg_temp.exigir((select decision='REVIEW' and motivos='[]'::jsonb and operaciones=0
    and estado_publicacion='pendiente' and token is null and administrador_id is null and revisado_at is null
    from public.moderacion_imagenes where reporte_id=-91004), 'Rollback decisión y contadores');
  perform pg_temp.exigir((select puntos=27 from public.profiles where id='10000000-0000-0000-0000-000000000001'), 'Rollback saldo');
  perform pg_temp.exigir((select revertido_at is null from public.puntos_creacion_reporte where reporte_id=-91004), 'Rollback ledger');
  perform pg_temp.exigir(not exists(select 1 from public.avisos_retiro_reporte where reporte_id=-91004), 'Rollback aviso');
end $$;
reset role;
rollback;
\echo 'OK retiro transaccional: matriz, rollback, leases y permisos'

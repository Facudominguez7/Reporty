\set ON_ERROR_STOP on
begin;
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',mensaje; end if; end $$;
insert into auth.users(id,email) values
 ('30000000-0000-0000-0000-000000000001','aviso@ejemplo.invalid'),
 ('30000000-0000-0000-0000-000000000002','admin-aviso@ejemplo.invalid');
update public.profiles set rol_id=1 where id='30000000-0000-0000-0000-000000000002';
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-93001,'30000000-0000-0000-0000-000000000001','Aviso sintético',0,0,null);
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
values ('30000000-0000-0000-0000-000000000003',-93001,'30000000-0000-0000-0000-000000000001',repeat('c',64),
 '30000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000003');
set local role service_role;
select pg_temp.exigir(public.decidir_imagen_moderacion('30000000-0000-0000-0000-000000000003',null,'REJECTED','[]','30000000-0000-0000-0000-000000000002'),'Retiro');
do $$ declare t uuid; segundo uuid; inicio timestamptz; contador integer; begin
 t := public.reclamar_aviso_retiro(-93001);
 select primer_intento_at,intentos into inicio,contador from public.avisos_retiro_reporte where reporte_id=-93001;
 perform pg_temp.exigir(inicio is not null and contador=1,'Ancla previa al proveedor');
 perform pg_temp.exigir(public.reclamar_aviso_retiro(-93001) is null,'Lease activo');
 perform pg_temp.exigir(not public.confirmar_aviso_retiro(-93001,gen_random_uuid()),'Confirmación ajena');
 perform pg_temp.exigir(not public.conciliar_aviso_retiro(-93001,t,'30000000-0000-0000-0000-000000000002'),'Conciliación prematura');
 update public.avisos_retiro_reporte set reclamado_hasta=clock_timestamp()-interval '1 second' where reporte_id=-93001;
 perform pg_temp.exigir(not public.confirmar_aviso_retiro(-93001,t),'Lease vencido no confirma');
 segundo := public.reclamar_aviso_retiro(-93001);
 perform pg_temp.exigir(segundo is not null and segundo<>t,'Recupera con token nuevo');
 perform pg_temp.exigir((select primer_intento_at=inicio and intentos=2 from public.avisos_retiro_reporte where reporte_id=-93001),'Ancla inmutable al reclamar');
 perform pg_temp.exigir(not public.confirmar_aviso_retiro(-93001,t),'Token obsoleto');
 update public.avisos_retiro_reporte set primer_intento_at=clock_timestamp()-interval '23 hours 55 minutes',reclamado_hasta=clock_timestamp()-interval '1 second' where reporte_id=-93001;
 perform pg_temp.exigir(public.reclamar_aviso_retiro(-93001) is null,'Límite conservador no reenvía');
 perform pg_temp.exigir(not public.conciliar_aviso_retiro(-93001,t,'30000000-0000-0000-0000-000000000002'),'Conciliación obsoleta');
 perform pg_temp.exigir(not public.conciliar_aviso_retiro(-93001,segundo,'30000000-0000-0000-0000-000000000001'),'Autor no es Admin');
 perform pg_temp.exigir(not public.conciliar_aviso_retiro(-93001,segundo,null),'Actor nulo');
 perform pg_temp.exigir((select intentos=2 and estado='reclamado' and enviado_at is null and conciliado_at is null from public.avisos_retiro_reporte where reporte_id=-93001),'Denegados sin efectos');
 perform pg_temp.exigir(public.conciliar_aviso_retiro(-93001,segundo,'30000000-0000-0000-0000-000000000002'),'Aceptación verificada manualmente');
 perform pg_temp.exigir(not public.conciliar_aviso_retiro(-93001,segundo,'30000000-0000-0000-0000-000000000002'),'No conciliar dos veces');
 perform pg_temp.exigir((select estado='enviado' and conciliado_at is not null and conciliado_por='30000000-0000-0000-0000-000000000002' and intentos=2 from public.avisos_retiro_reporte where reporte_id=-93001),'Auditoría sin contador nuevo');
 perform pg_temp.exigir(public.reclamar_aviso_retiro(-93001) is null,'Conciliado no se reenvía');
 perform pg_temp.exigir((select deleted_at is not null from public.reportes where id=-93001),'Nunca restaurar');
end $$;
reset role;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  execute 'set local role '||r;
  begin
   perform public.conciliar_aviso_retiro(-93001,gen_random_uuid(),'30000000-0000-0000-0000-000000000002');
   raise exception 'RPC expuesta';
  exception when insufficient_privilege then null; end;
  begin
   perform public.reclamar_aviso_retiro(-93001);
   raise exception 'Reclamo expuesto';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
 end loop;
end $$;
-- Todo lo anterior, incluidas auditoría y fixtures, se revierte sin secuencias consumidas.
rollback;
select 'OK entrega segura (ROLLBACK)' as resultado;

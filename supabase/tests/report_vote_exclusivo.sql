-- Contrato transaccional; el ejecutor abre y revierte la transacción.
-- El voto comunitario «reparado» fue reemplazado por la evidencia de reparación
-- (migración 20261106120000_evidencia_reparacion.sql): acá queda el voto «no existe»,
-- su resumen, el archivo del voto retirado y el cambio de voto de una cuenta. El
-- ejecutor aplica la RPC —y el archivo— de esa migración, así el rechazo PRE10 del
-- voto retirado y la historia conservada se prueban sobre el contrato vigente.
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;
insert into public.roles(id,nombre) values (2,'Ciudadano') on conflict (id) do nothing;
insert into public.estados(id,nombre) values (1,'Abierto') on conflict (id) do nothing;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000009901','autor-voto@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000009902','votante-voto@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000009903','historico-voto@ejemplo.invalid');
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-999901,'10000000-0000-0000-0000-000000009901','Voto exclusivo',0,0,1),
 (-999902,'10000000-0000-0000-0000-000000009901','Voto histórico',0,0,1);
set local role service_role;
select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009902','no_existe');
select pg_temp.exigir((select puntos=1 from public.profiles where id='10000000-0000-0000-0000-000000009902'), 'Primer voto acredita un punto');
select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009902','no_existe');
select pg_temp.exigir((select puntos=1 from public.profiles where id='10000000-0000-0000-0000-000000009902'), 'Repetición no acredita otro punto');
select pg_temp.exigir((select votos_no_existe_count=1 and votos_reparado_count=0 from public.reportes_vote_summary where reporte_id=-999901), 'Resumen refleja el voto único');
reset role;
insert into public.votos_no_existe(reporte_id,usuario_id,created_at) values (-999902,'10000000-0000-0000-0000-000000009903','2020-01-01');
alter table public.votos_reparado disable trigger z_impedir_votos_contradictorios;
insert into public.votos_reparado(reporte_id,usuario_id,created_at) values (-999902,'10000000-0000-0000-0000-000000009903','2021-01-01+00');
alter table public.votos_reparado enable trigger z_impedir_votos_contradictorios;
select pg_temp.exigir((select count(*)=1 from public.votos_exclusivos_ambiguos where reporte_id=-999902), 'Par histórico ambiguo debe informarse');
select pg_temp.exigir((select count(*)=1 from public.votos_no_existe where reporte_id=-999902) and (select count(*)=1 from public.votos_reparado where reporte_id=-999902), 'Par ambiguo no se modifica');
-- Las excepciones esperadas no deben alterar los votos ni el saldo.
create function pg_temp.rechazar(sql text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'La operación debía rechazarse: %', sql;
end $$;
set local role service_role;
-- El par histórico ambiguo se rechaza con el voto vigente («no existe»).
do $$
begin
  begin
    perform public.registrar_voto_exclusivo(-999902,'10000000-0000-0000-0000-000000009903','no_existe');
    raise exception 'Se aceptó un par ambiguo';
  exception when sqlstate 'PVA01' then null;
  end;
end $$;
select pg_temp.exigir((select count(*)=1 from public.votos_no_existe where reporte_id=-999902) and (select count(*)=1 from public.votos_reparado where reporte_id=-999902), 'Rechazo conserva ambos votos históricos');
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009901','no_existe')$q$);
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009902','otro')$q$);
reset role;
select pg_temp.exigir(not has_function_privilege('authenticated','public.registrar_voto_exclusivo(bigint,uuid,text)','execute') and not has_function_privilege('anon','public.registrar_voto_exclusivo(bigint,uuid,text)','execute'), 'RPC reservada a service_role');
select pg_temp.exigir(not has_table_privilege('authenticated','public.votos_exclusivos_ambiguos','select'), 'Reporte histórico privado');
select pg_temp.exigir((select puntos=0 from public.profiles where id='10000000-0000-0000-0000-000000009903'), 'Puntos históricos sin cambios');
-- El voto «reparado» retirado se rechaza con PRE10 antes de tocar votos, puntos o estado.
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000009909','historico-reparado@ejemplo.invalid');
set local role service_role;
do $$
begin
  begin
    perform public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009909','reparado');
    raise exception 'Se aceptó el voto reparado retirado';
  exception when sqlstate 'PRE10' then null;
  end;
end $$;
select pg_temp.exigir((select count(*)=0 from public.votos_reparado where reporte_id=-999901 and usuario_id='10000000-0000-0000-0000-000000009909'), 'PRE10 no deja voto reparado');
select pg_temp.exigir((select puntos=0 from public.profiles where id='10000000-0000-0000-0000-000000009909'), 'PRE10 no acredita puntos');
reset role;
-- S15/S9: el voto histórico «reparado» se conserva en un archivo server-only y solo
-- el voto vigente cuenta para el resumen, los puntos y el estado del reporte.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-999903,'10000000-0000-0000-0000-000000009901','Cambio de voto histórico',0,0,1);
alter table public.votos_reparado disable trigger z_impedir_votos_contradictorios;
insert into public.votos_reparado(reporte_id,usuario_id,created_at) values (-999903,'10000000-0000-0000-0000-000000009909','2021-01-01+00');
alter table public.votos_reparado enable trigger z_impedir_votos_contradictorios;
create temp table voto_original as
  select id from public.votos_reparado
  where reporte_id=-999903 and usuario_id='10000000-0000-0000-0000-000000009909';
select pg_temp.exigir((select count(*)=1 from pg_temp.voto_original), 'La prueba parte de un voto histórico reparado');
set local role service_role;
select pg_temp.exigir((public.registrar_voto_exclusivo(-999903,'10000000-0000-0000-0000-000000009909','no_existe') ->> 'cambio') = 'true', 'El voto histórico reparado se reemplaza al votar no existe');
reset role;
select pg_temp.exigir((select count(*)=0 from public.votos_reparado where reporte_id=-999903) and (select count(*)=1 from public.votos_no_existe where reporte_id=-999903), 'El voto activo cambia al voto no existe');
select pg_temp.exigir((select votos_reparado_count=0 and votos_no_existe_count=1 from public.reportes_vote_summary where reporte_id=-999903), 'El resumen refleja solo el voto vigente');
select pg_temp.exigir((select puntos=0 from public.profiles where id='10000000-0000-0000-0000-000000009909'), 'El cambio de voto no acredita ni descuenta puntos');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-999903), 'El cambio de voto no cierra el reporte');
select pg_temp.exigir((select count(*)=1 from public.votos_reparado_historial h
  join pg_temp.voto_original o on o.id=h.voto_id
  where h.reporte_id=-999903 and h.usuario_id='10000000-0000-0000-0000-000000009909'
    and h.votado_at='2021-01-01+00' and h.reemplazado_at >= h.votado_at
    and h.motivo='Voto reparado reemplazado por el voto no existe'),
  'El historial conserva la identidad, la cuenta, el reporte y la fecha original del voto retirado');
-- Repetir el cambio es idempotente: ni historia nueva, ni puntos, ni cierre.
set local role service_role;
select pg_temp.exigir(public.registrar_voto_exclusivo(-999903,'10000000-0000-0000-0000-000000009909','no_existe')
  @> '{"primero":false,"cambio":false}'::jsonb, 'Repetir el voto no existe no registra un cambio nuevo');
reset role;
select pg_temp.exigir((select count(*)=1 from public.votos_reparado_historial where reporte_id=-999903), 'La repetición no duplica el historial');
select pg_temp.exigir((select puntos=0 from public.profiles where id='10000000-0000-0000-0000-000000009909'), 'La repetición no mueve los puntos');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-999903), 'La repetición no cierra el reporte');
select pg_temp.exigir(not has_table_privilege('authenticated','public.votos_reparado_historial','select')
  and not has_table_privilege('anon','public.votos_reparado_historial','select')
  and not has_table_privilege('authenticated','public.votos_reparado_historial','insert'),
  'El historial de votos retirados es server-only');
-- Regresión del voto vigente «no existe»: el voto reparado retirado sigue rechazado
-- y no archiva ni toca el voto ni los puntos de la cuenta.
set local role service_role;
do $$
begin
  begin
    perform public.registrar_voto_exclusivo(-999903,'10000000-0000-0000-0000-000000009909','reparado');
    raise exception 'Se aceptó el voto reparado retirado';
  exception when sqlstate 'PRE10' then null;
  end;
end $$;
reset role;
select pg_temp.exigir((select count(*)=1 from public.votos_no_existe where reporte_id=-999903), 'PRE10 conserva el voto no existe vigente');
select pg_temp.exigir((select count(*)=1 from public.votos_reparado_historial where reporte_id=-999903), 'PRE10 no archiva el voto vigente');
-- El quinto «no existe» abre la revisión administrativa del reporte.
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000009904','voto4@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000009905','voto5@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000009906','voto6@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000009907','voto7@ejemplo.invalid'),
 ('10000000-0000-0000-0000-000000009908','voto8@ejemplo.invalid');
set local role service_role;
select public.registrar_voto_exclusivo(-999901,id,'no_existe') from public.profiles where id in
 ('10000000-0000-0000-0000-000000009904','10000000-0000-0000-0000-000000009905',
  '10000000-0000-0000-0000-000000009906','10000000-0000-0000-0000-000000009907',
  '10000000-0000-0000-0000-000000009908');
select pg_temp.exigir((select estado='pendiente' from public.reportes_revision_rechazo where reporte_id=-999901), 'Umbral abre revisión');
reset role;
insert into public.estados(id,nombre) values (2,'Cerrado') on conflict (id) do nothing;
update public.reportes set estado_id=2 where id=-999901;
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009902','no_existe')$q$);
reset role;
-- La RPC service-role respeta las mismas restricciones de rol que las acciones.
insert into public.roles(id,nombre) values (1,'Admin'),(3,'Interesado'),(4,'Operador'),(5,'Invitado') on conflict (id) do nothing;
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-999904,'10000000-0000-0000-0000-000000009901','Roles de voto',0,0,1);
update public.profiles set rol_id=1 where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','no_existe')$q$);
reset role;
update public.profiles set rol_id=4 where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','no_existe')$q$);
reset role;
update public.profiles set rol_id=5 where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','no_existe')$q$);
reset role;
update public.profiles set rol_id=2 where id='10000000-0000-0000-0000-000000009902';
update auth.users set is_anonymous=true where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','no_existe')$q$);
reset role;
update auth.users set is_anonymous=false where id='10000000-0000-0000-0000-000000009902';
update public.profiles set rol_id=3 where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','no_existe');
select pg_temp.exigir((select count(*)=1 from public.votos_no_existe where reporte_id=-999904), 'Interesado permanente puede votar');
reset role;
\echo 'OK voto exclusivo'

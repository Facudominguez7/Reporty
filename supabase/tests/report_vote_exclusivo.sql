-- Contrato transaccional; el ejecutor abre y revierte la transacción.
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
select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009902','reparado');
select pg_temp.exigir((select puntos=1 from public.profiles where id='10000000-0000-0000-0000-000000009902'), 'Cambio no acredita otro punto');
select pg_temp.exigir((select votos_no_existe_count=0 and votos_reparado_count=1 from public.reportes_vote_summary where reporte_id=-999901), 'Resumen refleja el cambio');
select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009902','reparado');
select pg_temp.exigir((select puntos=1 from public.profiles where id='10000000-0000-0000-0000-000000009902'), 'Repetición no acredita otro punto');
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
do $$
begin
  begin
    perform public.registrar_voto_exclusivo(-999902,'10000000-0000-0000-0000-000000009903','reparado');
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
-- Alcanzar el umbral y luego cambiar un voto no cancela la revisión pendiente.
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
select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009904','reparado');
select pg_temp.exigir((select estado='pendiente' from public.reportes_revision_rechazo where reporte_id=-999901), 'Cambio conserva revisión pendiente');
select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009901','reparado');
reset role;
insert into public.estados(id,nombre) values (2,'Cerrado') on conflict (id) do nothing;
update public.reportes set estado_id=2 where id=-999901;
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999901,'10000000-0000-0000-0000-000000009902','no_existe')$q$);
reset role;
-- El quinto voto, los puntos y el historial se confirman o revierten juntos.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-999903,'10000000-0000-0000-0000-000000009901','Umbral reparado',0,0,1);
set local role service_role;
select public.registrar_voto_exclusivo(-999903,id,'reparado') from public.profiles where id in
 ('10000000-0000-0000-0000-000000009904','10000000-0000-0000-0000-000000009905',
  '10000000-0000-0000-0000-000000009906','10000000-0000-0000-0000-000000009907');
select public.registrar_voto_exclusivo(-999903,'10000000-0000-0000-0000-000000009904','no_existe');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-999903), 'Cambio bajo umbral no cierra');
select public.registrar_voto_exclusivo(-999903,'10000000-0000-0000-0000-000000009904','reparado');
reset role;
create function pg_temp.fallar_historial() returns trigger language plpgsql as $$
begin if new.reporte_id=-999903 then raise exception 'fallo de prueba'; end if; return new; end $$;
create trigger fallo_historial_prueba before insert on public.historial_estados
for each row execute function pg_temp.fallar_historial();
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999903,'10000000-0000-0000-0000-000000009908','reparado')$q$);
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-999903), 'Fallo revierte cierre');
select pg_temp.exigir((select count(*)=4 from public.votos_reparado where reporte_id=-999903), 'Fallo revierte quinto voto');
select pg_temp.exigir((select puntos=1 from public.profiles where id='10000000-0000-0000-0000-000000009908'), 'Fallo revierte puntos del votante');
select pg_temp.exigir((select puntos=1 from public.profiles where id='10000000-0000-0000-0000-000000009901'), 'Fallo revierte puntos del autor');
reset role;
drop trigger fallo_historial_prueba on public.historial_estados;
set local role service_role;
select public.registrar_voto_exclusivo(-999903,'10000000-0000-0000-0000-000000009908','reparado');
select pg_temp.exigir((select estado_id=2 from public.reportes where id=-999903), 'Quinto voto cierra');
select pg_temp.exigir((select count(*)=1 from public.historial_estados where reporte_id=-999903 and estado_nuevo_id=2), 'Cierre registra historial');
select pg_temp.exigir((select puntos=6 from public.profiles where id='10000000-0000-0000-0000-000000009901'), 'Cierre acredita cinco puntos al autor');
reset role;
-- La RPC service-role respeta las mismas restricciones de rol que las acciones.
insert into public.roles(id,nombre) values (1,'Admin'),(3,'Interesado'),(4,'Operador'),(5,'Invitado') on conflict (id) do nothing;
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id) values
 (-999904,'10000000-0000-0000-0000-000000009901','Roles de voto',0,0,1);
update public.profiles set rol_id=1 where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','reparado')$q$);
reset role;
update public.profiles set rol_id=4 where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','reparado')$q$);
reset role;
update public.profiles set rol_id=5 where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','reparado')$q$);
reset role;
update public.profiles set rol_id=2 where id='10000000-0000-0000-0000-000000009902';
update auth.users set is_anonymous=true where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','reparado')$q$);
reset role;
update auth.users set is_anonymous=false where id='10000000-0000-0000-0000-000000009902';
update public.profiles set rol_id=3 where id='10000000-0000-0000-0000-000000009902';
set local role service_role;
select public.registrar_voto_exclusivo(-999904,'10000000-0000-0000-0000-000000009902','reparado');
select pg_temp.exigir((select count(*)=1 from public.votos_reparado where reporte_id=-999904), 'Interesado permanente puede votar');
reset role;
\echo 'OK voto exclusivo'

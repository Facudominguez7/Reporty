\set ON_ERROR_STOP on
begin;
-- The schema-only fixture omits product profile grants; model the app's own profile read policy in this transaction.
grant select (id,puntos) on public.profiles to authenticated;
grant select on public.profiles to service_role;
create function pg_temp.exigir(ok boolean, mensaje text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;
create function pg_temp.denegado(sql text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'Operación privada permitida' using errcode='P0002';
exception when insufficient_privilege then return;
when raise_exception then
  if sqlerrm in ('Se requiere una cuenta registrada','Se requiere administración',
    'Evidencia fotográfica aprobada requerida','Solo el servicio confiable finaliza publicaciones',
    'Los datos no corresponden a la evidencia enviada','Publicación retirada',
    'Datos de mascota inválidos','Datos de reemplazo de foto inválidos',
    'Evidencia fotográfica ya utilizada') then return; end if;
  raise;
end $$;

insert into auth.users(id,email,is_anonymous) values
 ('30000000-0000-0000-0000-000000000001','mascota-owner@example.invalid',false),
 ('30000000-0000-0000-0000-000000000002','mascota-guest@example.invalid',true),
 ('30000000-0000-0000-0000-000000000003','mascota-admin@example.invalid',false),
 ('30000000-0000-0000-0000-000000000004','mascota-other@example.invalid',false),
 ('30000000-0000-0000-0000-000000000005',null,false);
update public.profiles set puntos=25, rol_id=2 where id='30000000-0000-0000-0000-000000000001';
update public.profiles set puntos=0, rol_id=5 where id='30000000-0000-0000-0000-000000000002';
update public.profiles set puntos=0, rol_id=1 where id='30000000-0000-0000-0000-000000000003';
update public.profiles set puntos=0, rol_id=2 where id='30000000-0000-0000-0000-000000000004';
update public.profiles set puntos=0, rol_id=2 where id='30000000-0000-0000-0000-000000000005';

-- Authenticated callers cannot submit a path, evidence, owner, or direct row themselves.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.denegado($q$select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','perro','Fabricada',0,0,'555')$q$);
select pg_temp.denegado($q$insert into public.mascotas_perdidas(propietario_id,foto_moderacion_id,foto_path,tipo_animal,descripcion,lat,lon,telefono) values ('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','fake','perro','Fake',0,0,'1')$q$);
select pg_temp.denegado('select * from public.mascotas_fotos_moderacion');
select pg_temp.exigir((select puntos=0 from public.profiles where id='30000000-0000-0000-0000-000000000002'), 'Invitado sin puntos');
reset role;

-- Only the trusted service writes the moderation proof; rejected/missing proof must not award.
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.mascotas_fotos_moderacion(
 id,propietario_id,path_publico,path_privado,hash_sha256,decision,motivos,operaciones,
 tipo_animal,descripcion,lat,lon,telefono,estado,aprobado_at,estado_publicacion
) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','mascotas/40000000-0000-0000-0000-000000000001.webp','30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001',repeat('a',64),'APPROVED','[]',2,'perro','Perdida',-34,-56,'555123','aprobada',clock_timestamp(),'publicada'),
 ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',null,'30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000002',repeat('b',64),'REJECTED','[]',2,'perro','No moderada',0,0,'555','rechazada',null,'rechazada'),
 ('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001',null,'30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000004',repeat('c',64),'REVIEW','[]',0,'perro','Pendiente',0,0,'555','pendiente',null,'pendiente'),
 ('40000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000002','mascotas/40000000-0000-0000-0000-000000000005.webp','30000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-000000000005',repeat('e',64),'APPROVED','[]',2,'perro','Guest evidence',0,0,'555','aprobada',clock_timestamp(),'publicada'),
 ('40000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000001',null,'30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000006',repeat('f',64),'APPROVED','[]',2,'gato','Claim race',0,0,'555','pendiente',null,'pendiente');
select pg_temp.exigir(public.reclamar_publicacion_mascota('40000000-0000-0000-0000-000000000006') is not null, 'Una sola reclamación de publicación');
select pg_temp.exigir(public.reclamar_publicacion_mascota('40000000-0000-0000-0000-000000000006') is null, 'Publicación concurrente no duplica carga');
select pg_temp.denegado($q$select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','perro','No moderada',0,0,'555')$q$);
select pg_temp.denegado($q$select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000004','perro','Pendiente',0,0,'555')$q$);
select pg_temp.denegado($q$select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000099','perro','Inventada',0,0,'555')$q$);
select pg_temp.denegado($q$select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','perro','Datos cambiados',-34,-56,'555123')$q$);
select pg_temp.denegado($q$select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000005','perro','Guest evidence',0,0,'555')$q$);
select pg_temp.exigir((select puntos=25 from public.profiles where id='30000000-0000-0000-0000-000000000001'), 'Evidencia rechazada no acredita');
select pg_temp.exigir(public.crear_mascota_perdida('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','perro','Perdida',-34,-56,'555123') > 0, 'Foto aprobada crea y acredita');
select pg_temp.exigir(public.crear_mascota_perdida('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','perro','Perdida',-34,-56,'555123') = (select min(id) from public.mascotas_perdidas), 'Reintento idempotente no duplica puntos');
select pg_temp.exigir((select puntos=35 from public.profiles where id='30000000-0000-0000-0000-000000000001'), 'Reintento no vuelve a acreditar');
reset role;

-- Public RPCs are SECURITY INVOKER; protected columns and records stay private until approval.
select pg_temp.exigir((select not prosecdef from pg_proc where oid='public.marcar_mascota_encontrada(bigint)'::regprocedure), 'Public wrapper must not be SECURITY DEFINER');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.exigir((select count(*)=1 from public.mascotas_perdidas), 'Only approved evidence publication visible');
select pg_temp.denegado($q$select propietario_id,foto_moderacion_id,foto_path from public.mascotas_perdidas where id=(select min(id) from public.mascotas_perdidas)$q$);
select pg_temp.denegado($q$update public.mascotas_perdidas set propietario_id='30000000-0000-0000-0000-000000000003' where id=(select min(id) from public.mascotas_perdidas)$q$);
select pg_temp.denegado($q$update public.mascotas_perdidas set telefono='changed' where id=(select min(id) from public.mascotas_perdidas)$q$);
select pg_temp.denegado('select * from public.puntos_creacion_mascota');
select pg_temp.exigir((select puntos=35 from public.profiles where id='30000000-0000-0000-0000-000000000001'), 'Premio de creación único');
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.exigir(not public.marcar_mascota_encontrada((select min(id) from public.mascotas_perdidas)), 'Otro propietario no cambia estado');
select pg_temp.exigir(not public.retirar_mascota_propia((select min(id) from public.mascotas_perdidas)), 'Otro propietario no retira');
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.exigir(public.marcar_mascota_encontrada((select min(id) from public.mascotas_perdidas)), 'Autor marca encontrada');
select pg_temp.exigir(not public.marcar_mascota_encontrada((select min(id) from public.mascotas_perdidas)), 'Transición encontrada unidireccional');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.exigir((select count(*)=1 and min(evento)='encontrada' and min(destinatario)='mascota-owner@example.invalid' from public.avisos_estado_mascota where mascota_id=(select min(id) from public.mascotas_perdidas)), 'Cambio real encola un único correo al email del autor');
select pg_temp.exigir(not has_table_privilege('authenticated','public.avisos_estado_mascota','select'), 'Outbox y destinatarios no se exponen a usuarios');
select pg_temp.exigir(not has_function_privilege('authenticated','public.reclamar_aviso_estado_mascota(bigint)','execute'), 'Author cannot claim service outbox');
select pg_temp.exigir(not has_function_privilege('authenticated','public.conciliar_aviso_estado_mascota(bigint,uuid,uuid)','execute'), 'Author cannot reconcile administration outbox');
select set_config('test.aviso_id',(select min(id)::text from public.avisos_estado_mascota where mascota_id=(select min(id) from public.mascotas_perdidas) and evento='encontrada'),true);
select set_config('test.aviso_token',public.reclamar_aviso_estado_mascota(current_setting('test.aviso_id')::bigint)::text,true);
select pg_temp.exigir(current_setting('test.aviso_token') <> '', 'Un solo consumidor reclama el aviso');
select pg_temp.exigir(public.reclamar_aviso_estado_mascota(current_setting('test.aviso_id')::bigint) is null, 'Lease activo impide reclamo duplicado');
select pg_temp.exigir(not public.confirmar_aviso_estado_mascota(current_setting('test.aviso_id')::bigint,gen_random_uuid()), 'Token distinto no confirma');
update public.avisos_estado_mascota set reclamado_hasta=clock_timestamp()-interval '1 second'
  where id=current_setting('test.aviso_id')::bigint;
select set_config('test.aviso_token_nuevo',public.reclamar_aviso_estado_mascota(current_setting('test.aviso_id')::bigint)::text,true);
select pg_temp.exigir(current_setting('test.aviso_token_nuevo') <> current_setting('test.aviso_token'), 'Lease vencido rota el token');
select pg_temp.exigir(not public.confirmar_aviso_estado_mascota(current_setting('test.aviso_id')::bigint,current_setting('test.aviso_token')::uuid), 'Token obsoleto no confirma lease recuperado');
select pg_temp.exigir(public.confirmar_aviso_estado_mascota(current_setting('test.aviso_id')::bigint,current_setting('test.aviso_token_nuevo')::uuid), 'Token vigente confirma dentro de ventana');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.exigir((select estado='encontrada' from public.mascotas_perdidas), 'Encontrada permanece visible');
select pg_temp.exigir(public.retirar_mascota_propia((select min(id) from public.mascotas_perdidas)), 'Retiro del autor');
select pg_temp.exigir(not public.retirar_mascota_propia((select min(id) from public.mascotas_perdidas)), 'Retiro propio idempotente');
select pg_temp.exigir((select puntos=25 from public.profiles where id='30000000-0000-0000-0000-000000000001'), 'Retiro descuenta creación una sola vez');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.exigir((select foto_limpieza_estado='pendiente' from public.mascotas_perdidas), 'Retiro deja cleanup público durable pendiente');
select pg_temp.denegado($q$select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','perro','Perdida',-34,-56,'555123')$q$);
select pg_temp.exigir(public.reclamar_publicacion_mascota('40000000-0000-0000-0000-000000000001') is null, 'Publicación retirada no se reclama otra vez');
reset role;
reset role;

-- Second approved item: non-admin fails, admin retirement reverses the ledger once.
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.mascotas_fotos_moderacion(
 id,propietario_id,path_publico,path_privado,hash_sha256,decision,motivos,operaciones,
 tipo_animal,descripcion,lat,lon,telefono,estado,aprobado_at,estado_publicacion
) values ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','mascotas/40000000-0000-0000-0000-000000000003.webp',
 '30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000003',repeat('d',64),'APPROVED','[]',2,
 'gato','Otra perdida',-34,-56,'555123','aprobada',clock_timestamp(),'publicada');
select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','gato','Otra perdida',-34,-56,'555123');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.denegado($q$select public.retirar_mascota_moderacion((select max(id) from public.mascotas_perdidas))$q$);
select pg_temp.denegado($q$select public.editar_mascota_moderacion((select max(id) from public.mascotas_perdidas),'gato','No autorizado',1,2,'555','perdida')$q$);
select pg_temp.exigir((select count(*)=1 from public.mascotas_perdidas), 'No-admin no retira');
select pg_temp.exigir((select descripcion='Otra perdida' from public.mascotas_perdidas where id=(select max(id) from public.mascotas_perdidas)), 'No-admin no edita');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.exigir(public.editar_mascota_moderacion((select max(id) from public.mascotas_perdidas),'gato','Estado previo',-33,-55,'555999','encontrada'), 'Admin corrige perdida a encontrada');
select pg_temp.exigir(public.editar_mascota_moderacion((select max(id) from public.mascotas_perdidas),'gato','Estado corregido',-33,-55,'555999','perdida'), 'Admin corrige encontrada a perdida');
select pg_temp.exigir(public.editar_mascota_moderacion((select max(id) from public.mascotas_perdidas),'gato','Solo edición de campos',-33,-55,'555999','perdida'), 'Edición de campos sin transición');
select pg_temp.exigir(public.editar_mascota_moderacion((select max(id) from public.mascotas_perdidas),'gato','Encontrada otra vez',-33,-55,'555999','encontrada'), 'Segunda transición encontrada distinta');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.exigir((select count(*)=2 from public.avisos_estado_mascota where mascota_id=(select max(id) from public.mascotas_perdidas) and evento='encontrada'), 'Cada transición real encontrada genera su propio evento una vez');
select pg_temp.exigir((select propietario_id='30000000-0000-0000-0000-000000000001' and foto_moderacion_id='40000000-0000-0000-0000-000000000003' and foto_path='mascotas/40000000-0000-0000-0000-000000000003.webp' and estado='encontrada' and descripcion='Encontrada otra vez' from public.mascotas_perdidas where id=(select max(id) from public.mascotas_perdidas)), 'Edición conserva autoría, foto y estado corregido');
select pg_temp.exigir((select puntos=35 from public.profiles where id='30000000-0000-0000-0000-000000000001'), 'Edición no cambia puntos');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.denegado($q$select public.editar_mascota_moderacion((select max(id) from public.mascotas_perdidas),'perro',' ',1,2,'555','perdida')$q$);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.denegado($q$select public.crear_revision_reemplazo_foto_mascota((select max(id) from public.mascotas_perdidas),'40000000-0000-0000-0000-000000000007',repeat('7',64))$q$);
select pg_temp.denegado($q$select public.reclamar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000007')$q$);
select pg_temp.denegado($q$select public.finalizar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000007','50000000-0000-0000-0000-000000000009')$q$);
select pg_temp.denegado($q$select public.conciliar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000007')$q$);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.exigir(public.crear_revision_reemplazo_foto_mascota((select max(id) from public.mascotas_perdidas),'40000000-0000-0000-0000-000000000007',repeat('7',64))='40000000-0000-0000-0000-000000000007'::uuid, 'Admin inicia reemplazo privado');
select pg_temp.exigir(public.reclamar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000007') is null, 'Foto no se reclama antes de aprobación');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.mascotas_fotos_moderacion set decision='APPROVED', estado='aprobada', aprobado_at=clock_timestamp(), administrador_id='30000000-0000-0000-0000-000000000003' where id='40000000-0000-0000-0000-000000000007';
select pg_temp.exigir((select foto_path='mascotas/40000000-0000-0000-0000-000000000003.webp' from public.mascotas_perdidas where id=(select max(id) from public.mascotas_perdidas)), 'Pending replacement preserves current public photo');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select set_config('test.replacement_token', public.reclamar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000007')::text, true);
select pg_temp.exigir(current_setting('test.replacement_token') <> '', 'Admin claims approved replacement');
select pg_temp.exigir(public.reclamar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000007')::text=current_setting('test.replacement_token'), 'Retry gets same photo claim');
select pg_temp.exigir(public.finalizar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000007','50000000-0000-0000-0000-000000000009') is null, 'Wrong upload token cannot finalize');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.exigir((select foto_path='mascotas/40000000-0000-0000-0000-000000000003.webp' from public.mascotas_perdidas where id=(select max(id) from public.mascotas_perdidas)), 'Unapproved photo has not changed active publication');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.exigir(public.finalizar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000007',current_setting('test.replacement_token')::uuid)='mascotas/40000000-0000-0000-0000-000000000003.webp', 'Admin atomically swaps approved photo and returns old path');
select pg_temp.exigir(public.finalizar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000007',current_setting('test.replacement_token')::uuid)='', 'Repeated finalization is idempotent');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.exigir((select foto_moderacion_id='40000000-0000-0000-0000-000000000007' and foto_path='mascotas/40000000-0000-0000-0000-000000000007.webp' from public.mascotas_perdidas where id=(select max(id) from public.mascotas_perdidas)), 'Approved photo is current only after atomic finalization');
select pg_temp.exigir(not (select motivos @> '["limpieza_publica_pendiente"]'::jsonb from public.mascotas_fotos_moderacion where id='40000000-0000-0000-0000-000000000007'), 'Successful new photo has no spurious cleanup task');
select pg_temp.exigir((select motivos @> '["limpieza_publica_pendiente","foto_reemplazada"]'::jsonb from public.mascotas_fotos_moderacion where id='40000000-0000-0000-0000-000000000003'), 'Old photo is retired from current display and cleanup durably pending');
select pg_temp.exigir((select puntos=35 from public.profiles where id='30000000-0000-0000-0000-000000000001'), 'Photo replacement does not change points');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.exigir(public.crear_revision_reemplazo_foto_mascota((select max(id) from public.mascotas_perdidas),'40000000-0000-0000-0000-000000000008',repeat('8',64))='40000000-0000-0000-0000-000000000008'::uuid, 'Admin may submit a later replacement after prior one finalized');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.mascotas_fotos_moderacion set decision='REJECTED', estado='rechazada', estado_publicacion='rechazada' where id='40000000-0000-0000-0000-000000000008';
select pg_temp.exigir((select foto_moderacion_id='40000000-0000-0000-0000-000000000007' and foto_path='mascotas/40000000-0000-0000-0000-000000000007.webp' from public.mascotas_perdidas where id=(select max(id) from public.mascotas_perdidas)), 'Rejected replacement preserves the approved photo');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.exigir(public.crear_revision_reemplazo_foto_mascota((select max(id) from public.mascotas_perdidas),'40000000-0000-0000-0000-000000000009',repeat('9',64))='40000000-0000-0000-0000-000000000009'::uuid, 'Admin opens reconciliation fixture');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.mascotas_fotos_moderacion set decision='APPROVED', estado='aprobada', aprobado_at=clock_timestamp() where id='40000000-0000-0000-0000-000000000009';
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select set_config('test.reconciliation_token',public.reclamar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000009')::text,true);
select pg_temp.exigir(public.conciliar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000009')='limpieza', 'Uncommitted replacement becomes durable non-publishable cleanup');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.exigir((select estado_publicacion='rechazada' and publish_token is null and motivos @> '["limpieza_publica_pendiente"]'::jsonb from public.mascotas_fotos_moderacion where id='40000000-0000-0000-0000-000000000009'), 'Reconciliation marker blocks every later finalizer');
select pg_temp.exigir((select foto_moderacion_id<>'40000000-0000-0000-0000-000000000009' from public.mascotas_perdidas where id=(select max(id) from public.mascotas_perdidas)), 'Reconciliation does not alter the active photo');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.exigir(public.finalizar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000009',current_setting('test.reconciliation_token')::uuid) is null, 'Reconciled replacement can never be finalized after cleanup becomes eligible');
select pg_temp.exigir(public.crear_revision_reemplazo_foto_mascota((select max(id) from public.mascotas_perdidas),'40000000-0000-0000-0000-000000000010',repeat('a',63)||'b')='40000000-0000-0000-0000-000000000010'::uuid, 'Admin opens concurrent-winner fixture');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.mascotas_fotos_moderacion set decision='APPROVED', estado='aprobada', aprobado_at=clock_timestamp() where id='40000000-0000-0000-0000-000000000010';
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select set_config('test.concurrent_token',public.reclamar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000010')::text,true);
select pg_temp.exigir(public.finalizar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000010',current_setting('test.concurrent_token')::uuid)='mascotas/40000000-0000-0000-0000-000000000007.webp', 'Concurrent winner publishes atomically before reconciliation');
select pg_temp.exigir(public.conciliar_reemplazo_foto_mascota('40000000-0000-0000-0000-000000000010')='actual', 'Reconciliation recognizes concurrent winner without cleanup marker');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.exigir(public.retirar_mascota_moderacion((select max(id) from public.mascotas_perdidas)), 'Admin retira');
select pg_temp.exigir(not public.retirar_mascota_moderacion((select max(id) from public.mascotas_perdidas)), 'Retiro administrativo idempotente');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.exigir((select count(*)=1 from public.avisos_estado_mascota where mascota_id=(select max(id) from public.mascotas_perdidas) and evento='retirada'), 'Retiro administrativo encola un aviso de retiro una sola vez');
select pg_temp.exigir((select count(*)=2 from public.avisos_estado_mascota where mascota_id=(select max(id) from public.mascotas_perdidas) and evento='encontrada'), 'Cambios encontrada anteriores son eventos distintos, no se deduplican');
select set_config('test.conciliacion_id',(select min(id)::text from public.avisos_estado_mascota where mascota_id=(select max(id) from public.mascotas_perdidas) and evento='encontrada'),true);
select set_config('test.conciliacion_token',public.reclamar_aviso_estado_mascota(current_setting('test.conciliacion_id')::bigint)::text,true);
update public.avisos_estado_mascota set primer_intento_at=clock_timestamp()-interval '24 hours',
  reclamado_hasta=clock_timestamp()-interval '1 second'
  where id=current_setting('test.conciliacion_id')::bigint;
select pg_temp.exigir(public.reclamar_aviso_estado_mascota(current_setting('test.conciliacion_id')::bigint) is null, 'No se reenvía luego de ventana de idempotencia');
select pg_temp.exigir((select estado='conciliacion' and token=current_setting('test.conciliacion_token')::uuid and reclamado_hasta is null from public.avisos_estado_mascota where id=current_setting('test.conciliacion_id')::bigint), 'Lease vencido fuera de ventana queda visible para conciliación');
select pg_temp.exigir(not public.conciliar_aviso_estado_mascota(current_setting('test.conciliacion_id')::bigint,current_setting('test.conciliacion_token')::uuid,'30000000-0000-0000-0000-000000000004'), 'No-admin no puede conciliar aceptación');
select pg_temp.exigir(public.conciliar_aviso_estado_mascota(current_setting('test.conciliacion_id')::bigint,current_setting('test.conciliacion_token')::uuid,'30000000-0000-0000-0000-000000000003'), 'Admin confirma aceptación verificada sin reenvío');
select pg_temp.exigir((select estado='enviado' and conciliado_por='30000000-0000-0000-0000-000000000003' and conciliado_at is not null from public.avisos_estado_mascota where id=current_setting('test.conciliacion_id')::bigint), 'Conciliación conserva identidad administrativa y evidencia temporal');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.exigir((select puntos=25 from public.profiles where id='30000000-0000-0000-0000-000000000001'), 'Reversión administrativa única');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.exigir((select foto_limpieza_estado='pendiente' from public.mascotas_perdidas where id=(select max(id) from public.mascotas_perdidas)), 'Retiro administrativo deja cleanup pendiente');
select pg_temp.denegado($q$select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','gato','Otra perdida',-34,-56,'555123')$q$);
-- No-email accounts remain safe: transitions commit, but no notification row can be created.
insert into public.mascotas_fotos_moderacion(
 id,propietario_id,path_publico,path_privado,hash_sha256,decision,motivos,operaciones,
 tipo_animal,descripcion,lat,lon,telefono,estado,aprobado_at,estado_publicacion
) values ('40000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000005',
 'mascotas/40000000-0000-0000-0000-000000000011.webp','30000000-0000-0000-0000-000000000005/40000000-0000-0000-0000-000000000011',repeat('b',64),
 'APPROVED','[]',2,'perro','Sin correo',-34,-56,'555123','aprobada',clock_timestamp(),'publicada');
select public.crear_mascota_perdida('30000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000011','perro','Sin correo',-34,-56,'555123');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select pg_temp.exigir(public.marcar_mascota_encontrada((select max(id) from public.mascotas_perdidas)), 'Cuenta sin email puede cambiar estado');
select pg_temp.exigir(public.retirar_mascota_propia((select max(id) from public.mascotas_perdidas)), 'Cuenta sin email puede retirar');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.exigir(not exists(select 1 from public.avisos_estado_mascota where mascota_id=(select max(id) from public.mascotas_perdidas)), 'Email ausente omite outbox sin bloquear transiciones');
reset role;
set local role anon;
select pg_temp.exigir(not exists(select 1 from public.mascotas_perdidas), 'Retiradas ocultas al público');
select pg_temp.denegado('select * from public.puntos_creacion_mascota');
reset role;
rollback;
\echo 'OK mascotas: evidencia confiable, permisos, estados y ledger idempotente'

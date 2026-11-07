-- Administración en el flujo de reparaciones (L21): informa, confirma e impugna
-- como cualquier cuenta habilitada, sin poder validar su propia evidencia (S6).
-- Operador, invitado, sesión anónima y correo sin confirmar siguen fuera (S15).
-- El ejecutor abre una transacción, aplica la migración incremental
-- 20261107120000_admin_participa_reparacion.sql sobre la base ya instalada,
-- ejecuta este archivo y revierte: nada queda aplicado.
\set ON_ERROR_STOP on

-- Exige una condición verdadera; falla con el mensaje indicado.
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;

-- Exige una sentencia rechazada con el SQLSTATE y el mensaje en español esperados.
create function pg_temp.rechazar(p_sql text, p_estado text default null, p_mensaje text default null)
returns void language plpgsql as $$
declare v_estado text; v_mensaje text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text;
    if p_estado is not null and v_estado is distinct from p_estado then
      raise exception 'Se esperaba SQLSTATE % y llegó % en: %', p_estado, v_estado, p_sql;
    end if;
    if p_mensaje is not null and v_mensaje is distinct from p_mensaje then
      raise exception 'Se esperaba el mensaje «%» y llegó «%»', p_mensaje, v_mensaje;
    end if;
    return;
  end;
  raise exception 'La operación debía rechazarse: %', p_sql;
end $$;

-- Huella sintética distinta por caso, válida para el CHECK de 64 hexadecimales.
create function pg_temp.huella(n integer) returns text language sql immutable as $$
  select lpad(to_hex(n), 2, '0') || repeat('f', 62)
$$;

-- Última evidencia registrada para un reporte de prueba.
create function pg_temp.evidencia(p_reporte bigint) returns uuid language sql stable as $$
  select id from public.evidencias_reparacion where reporte_id = p_reporte
  order by created_at desc limit 1
$$;

-- Recorre la moderación real de una evidencia: reclamo, aprobación y publicación.
create function pg_temp.publicar_evidencia(p_evidencia uuid, p_url text) returns void
language plpgsql as $$
declare v_moderacion uuid; v_propietario uuid; v_token uuid;
begin
  select id, propietario_id into v_moderacion, v_propietario
    from public.moderacion_imagenes where evidencia_id = p_evidencia;
  perform pg_temp.exigir(public.reclamar_imagen_moderacion(v_moderacion, v_propietario) is not null,
    'Reclamo de moderación de la evidencia');
  select token into v_token from public.moderacion_imagenes where id = v_moderacion;
  perform pg_temp.exigir(public.decidir_imagen_moderacion(v_moderacion, v_token, 'APPROVED', '[]'),
    'Aprobación de moderación de la evidencia');
  select token into v_token from public.moderacion_imagenes where id = v_moderacion;
  perform pg_temp.exigir(public.confirmar_publicacion_moderacion(v_moderacion, v_token, p_url,
    p_url || '-miniatura'), 'Publicación de la foto de la evidencia');
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures sintéticas con ids explícitos (sin secuencias).
-- u01 autor de reportes · u02 autor de la evidencia de otro · u03 admin confirmado ·
-- u04 operador · u05 invitado · u06 sesión anónima · u07 admin sin correo confirmado.
-- ---------------------------------------------------------------------------
insert into public.roles(id,nombre) values (1,'admin'),(2,'ciudadano'),(3,'interesado'),(4,'operador'),(5,'invitado')
  on conflict (id) do nothing;
insert into public.estados(id,nombre) values (1,'Pendiente'),(2,'Reparado'),(3,'Rechazado')
  on conflict (id) do nothing;
insert into auth.users(id,email,email_confirmed_at) values
 ('40000000-0000-0000-0000-000000000001','admin-reparacion-autor@ejemplo.invalid',now()),
 ('40000000-0000-0000-0000-000000000002','admin-reparacion-foto@ejemplo.invalid',now()),
 ('40000000-0000-0000-0000-000000000003','admin-reparacion-admin@ejemplo.invalid',now()),
 ('40000000-0000-0000-0000-000000000004','admin-reparacion-operador@ejemplo.invalid',now()),
 ('40000000-0000-0000-0000-000000000005','admin-reparacion-invitado@ejemplo.invalid',now()),
 ('40000000-0000-0000-0000-000000000007','admin-reparacion-sin-confirmar@ejemplo.invalid',null);
insert into auth.users(id,email,is_anonymous) values
 ('40000000-0000-0000-0000-000000000006','admin-reparacion-anonimo@ejemplo.invalid',true);
update public.profiles set rol_id = 2 where id = '40000000-0000-0000-0000-000000000001';
update public.profiles set rol_id = 2 where id = '40000000-0000-0000-0000-000000000002';
update public.profiles set rol_id = 1 where id = '40000000-0000-0000-0000-000000000003';
update public.profiles set rol_id = 4 where id = '40000000-0000-0000-0000-000000000004';
update public.profiles set rol_id = 5 where id = '40000000-0000-0000-0000-000000000005';
update public.profiles set rol_id = 5 where id = '40000000-0000-0000-0000-000000000006';
update public.profiles set rol_id = 1 where id = '40000000-0000-0000-0000-000000000007';
-- -94001 admin informa · -94002 admin confirma · -94003 admin impugna ·
-- -94004 evidencia del propio admin (S6) · -94005 roles que siguen fuera.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id)
select -94000 - n, '40000000-0000-0000-0000-000000000001',
  'Administración y reparación ' || n, 0, 0, 1
from generate_series(1,5) n;

-- ---------------------------------------------------------------------------
-- L21: la elegibilidad de administración se habilita sin tocar el resto (S15).
-- ---------------------------------------------------------------------------
select pg_temp.exigir(private.usuario_habilitado_para_reparacion(
  '40000000-0000-0000-0000-000000000003'), 'El administrador confirmado queda habilitado');
select pg_temp.exigir(not private.usuario_habilitado_para_reparacion(
  '40000000-0000-0000-0000-000000000004'), 'El operador sigue fuera');
select pg_temp.exigir(not private.usuario_habilitado_para_reparacion(
  '40000000-0000-0000-0000-000000000005'), 'El invitado sigue fuera');
select pg_temp.exigir(not private.usuario_habilitado_para_reparacion(
  '40000000-0000-0000-0000-000000000006'), 'La sesión anónima sigue fuera');
select pg_temp.exigir(not private.usuario_habilitado_para_reparacion(
  '40000000-0000-0000-0000-000000000007'), 'Un administrador sin correo confirmado sigue fuera');

-- ---------------------------------------------------------------------------
-- L21/S1: administración informa la reparación con la misma moderación y auditoría.
-- ---------------------------------------------------------------------------
set local role service_role;
select pg_temp.exigir((public.crear_evidencia_reparacion(-94001,
  '40000000-0000-0000-0000-000000000003','Reparación informada por administración',pg_temp.huella(41))
  ->> 'estado') = 'informada', 'Administración informa la evidencia en revisión');
select pg_temp.exigir((select destino = 'evidencia_reparacion' and evidencia_id = pg_temp.evidencia(-94001)
  from public.moderacion_imagenes where reporte_id = -94001),
  'La foto de administración entra en la cola de moderación existente');
select pg_temp.exigir((select count(*) = 1 and bool_and(actor_id='40000000-0000-0000-0000-000000000003')
  from public.audit_events where report_id = -94001 and action = 'evidence_submitted'),
  'La evidencia informada por administración queda auditada con su actor');
select pg_temp.exigir((select estado_id = 1 from public.reportes where id = -94001),
  'Informar la reparación no cambia el estado del reporte (S2)');
select pg_temp.exigir((select count(*) = 0 from public.verificaciones_reparacion
  where evidencia_id = pg_temp.evidencia(-94001)), 'Informar no registra verificaciones');

-- ---------------------------------------------------------------------------
-- L21/S4: administración confirma una evidencia de otra cuenta, una sola vez.
-- ---------------------------------------------------------------------------
select public.crear_evidencia_reparacion(-94002,'40000000-0000-0000-0000-000000000002',
  'Reparación de otra cuenta',pg_temp.huella(42));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-94002),'https://ejemplo.invalid/admin-94002.webp');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-94002),
  '40000000-0000-0000-0000-000000000003','confirmacion') ->> 'confirmaciones')::integer = 1,
  'La confirmación de administración cuenta uno');
select pg_temp.exigir((select usuario_id = '40000000-0000-0000-0000-000000000003' and tipo = 'confirmacion'
  from public.verificaciones_reparacion where evidencia_id = pg_temp.evidencia(-94002)),
  'La confirmación de administración queda registrada con su cuenta');
select pg_temp.exigir((select count(*) = 1 and bool_and(actor_id='40000000-0000-0000-0000-000000000003')
  from public.audit_events where report_id = -94002 and action = 'evidence_confirmed'),
  'La confirmación de administración queda auditada con su actor');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-94002),
  '40000000-0000-0000-0000-000000000003','confirmacion') ->> 'repetida') = 'true',
  'La repetición sigue siendo idempotente para administración (S7)');
select pg_temp.exigir((select count(*) = 1 from public.verificaciones_reparacion
  where evidencia_id = pg_temp.evidencia(-94002)), 'La repetición no duplica el voto de administración');

-- ---------------------------------------------------------------------------
-- L21/S4/S5: administración impugna y la verificación queda en pausa.
-- ---------------------------------------------------------------------------
select public.crear_evidencia_reparacion(-94003,'40000000-0000-0000-0000-000000000002',
  'Reparación impugnada por administración',pg_temp.huella(43));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-94003),'https://ejemplo.invalid/admin-94003.webp');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-94003),
  '40000000-0000-0000-0000-000000000003','impugnacion','La foto no muestra la reparación')
  ->> 'impugnaciones_pendientes')::integer = 1, 'La impugnación de administración queda pendiente');
select pg_temp.exigir((select estado = 'pendiente' and usuario_id = '40000000-0000-0000-0000-000000000003'
  from public.verificaciones_reparacion where evidencia_id = pg_temp.evidencia(-94003)
  and tipo = 'impugnacion'), 'La impugnación conserva el motivo y la cuenta de administración');
select pg_temp.exigir((select count(*) = 1 and bool_and(actor_id='40000000-0000-0000-0000-000000000003')
  from public.audit_events where report_id = -94003 and action = 'evidence_challenged'),
  'La impugnación de administración queda auditada con su actor');

-- ---------------------------------------------------------------------------
-- S6: administración tampoco valida su propia evidencia.
-- ---------------------------------------------------------------------------
select public.crear_evidencia_reparacion(-94004,'40000000-0000-0000-0000-000000000003',
  'Reparación informada por la misma administración',pg_temp.huella(44));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-94004),'https://ejemplo.invalid/admin-94004.webp');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-94004),'40000000-0000-0000-0000-000000000003','confirmacion')$q$,
  'PRE02','No podés validar tu propia evidencia');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-94004),'40000000-0000-0000-0000-000000000003','impugnacion','No fui yo')$q$,
  'PRE02','No podés validar tu propia evidencia');
select pg_temp.exigir(not exists (select 1 from public.verificaciones_reparacion
  where evidencia_id = pg_temp.evidencia(-94004)), 'La autovalidación de administración no deja verificación');
select pg_temp.exigir(not exists (select 1 from public.audit_events where report_id = -94004
  and action in ('evidence_confirmed','evidence_challenged')),
  'La autovalidación de administración no deja auditoría');

-- ---------------------------------------------------------------------------
-- S15: operador, invitado, sesión anónima y correo sin confirmar siguen fuera.
-- ---------------------------------------------------------------------------
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-94005,
  '40000000-0000-0000-0000-000000000004','Foto de un operador',pg_temp.huella(45))$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-94005,
  '40000000-0000-0000-0000-000000000005','Foto de un invitado',pg_temp.huella(45))$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-94005,
  '40000000-0000-0000-0000-000000000006','Foto de una sesión anónima',pg_temp.huella(45))$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-94005,
  '40000000-0000-0000-0000-000000000007','Foto de un administrador sin confirmar',pg_temp.huella(45))$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.exigir(not exists (select 1 from public.evidencias_reparacion where reporte_id = -94005),
  'Ningún rol excluido deja evidencia en el reporte');
select pg_temp.exigir(not exists (select 1 from public.moderacion_imagenes where reporte_id = -94005),
  'Ningún rol excluido encola moderación');
-- La verificación conserva las mismas exclusiones.
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-94002),'40000000-0000-0000-0000-000000000004','confirmacion')$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-94002),'40000000-0000-0000-0000-000000000006','confirmacion')$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-94002),'40000000-0000-0000-0000-000000000007','confirmacion')$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.exigir(not exists (select 1 from public.verificaciones_reparacion
  where usuario_id in ('40000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000007')),
  'Los roles excluidos no dejan verificaciones');

-- ---------------------------------------------------------------------------
-- S12: la elegibilidad habilitada no abre las funciones privadas ni las RPC.
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.exigir(
  not has_function_privilege('anon','private.usuario_habilitado_para_reparacion(uuid)','execute')
  and not has_function_privilege('authenticated','private.usuario_habilitado_para_reparacion(uuid)','execute'),
  'La elegibilidad de reparaciones sigue siendo privada');
select pg_temp.exigir(
  not has_function_privilege('anon','public.crear_evidencia_reparacion(bigint,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.crear_evidencia_reparacion(bigint,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.registrar_verificacion_reparacion(uuid,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.registrar_verificacion_reparacion(uuid,uuid,text,text)','execute'),
  'Las RPC de evidencia siguen reservadas a service_role');

\echo 'OK administración en reparaciones: informa, confirma e impugna sin validar su propia evidencia'

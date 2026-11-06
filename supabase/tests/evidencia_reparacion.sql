-- Contrato transaccional de evidencia y verificación de reparaciones.
-- El ejecutor abre una transacción, aplica la migración 20261106120000 completa,
-- ejecuta este archivo y revierte: nunca se aplica a la base local.
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

-- Exige una denegación real de privilegios, no un error de otra índole.
create function pg_temp.denegado(p_sql text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when insufficient_privilege then return; end;
  raise exception 'Se permitió una operación reservada: %', p_sql;
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

-- Fila de moderación asociada a una evidencia.
create function pg_temp.moderacion(p_evidencia uuid) returns uuid language sql stable as $$
  select id from public.moderacion_imagenes where evidencia_id = p_evidencia
$$;

-- Impugnación registrada por un usuario sobre una evidencia.
create function pg_temp.impugnacion(p_evidencia uuid, p_usuario uuid) returns uuid language sql stable as $$
  select id from public.verificaciones_reparacion
  where evidencia_id = p_evidencia and usuario_id = p_usuario and tipo = 'impugnacion'
$$;

-- Instantánea ordenada de las fotos publicadas de un reporte (S9).
create function pg_temp.fotos(p_reporte bigint) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]'::jsonb)
  from public.fotos_reporte f where f.reporte_id = p_reporte
$$;

-- Sonda A3: la evidencia solo puede insertarse después de bloquear el perfil del
-- autor. Una fila bloqueada por esta transacción deja en xmax el xid actual.
-- Se crea dentro de la transacción de prueba: el rollback final la elimina.
create function private.sonda_bloqueo_perfil_autor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p
    where p.id = new.autor_id and p.xmax::text <> '0') then
    raise exception 'A3: la evidencia se insertó sin bloquear el perfil del autor';
  end if;
  return new;
end $$;
create trigger zz_sonda_bloqueo_perfil_autor before insert on public.evidencias_reparacion
  for each row execute function private.sonda_bloqueo_perfil_autor();

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
-- Fixtures sintéticas: ids explícitos (sin secuencias) y roles/estados del repo.
-- u01 autor de reportes · u02 autor de evidencia · u03..u06 confirmadores ·
-- u07 admin · u08 operador · u09 invitado · u10 anónimo · u11 sin confirmar ·
-- u12 impugnador · u13 autor bajo límite diario · u14/u15 autores de las regresiones
-- del veredicto (cada cuenta informa como máximo el cupo diario).
-- ---------------------------------------------------------------------------
insert into public.roles(id,nombre) values (1,'admin'),(2,'ciudadano'),(3,'interesado'),(4,'operador'),(5,'invitado')
  on conflict (id) do nothing;
insert into public.estados(id,nombre) values (1,'Pendiente'),(2,'Reparado'),(3,'Rechazado')
  on conflict (id) do nothing;
insert into auth.users(id,email,email_confirmed_at) values
 ('30000000-0000-0000-0000-000000000001','evidencia-autor@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000002','evidencia-foto@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000003','evidencia-confirma1@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000004','evidencia-confirma2@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000005','evidencia-confirma3@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000006','evidencia-confirma4@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000007','evidencia-admin@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000008','evidencia-operador@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000009','evidencia-invitado@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000011','evidencia-sin-confirmar@ejemplo.invalid',null),
 ('30000000-0000-0000-0000-000000000012','evidencia-impugna@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000013','evidencia-limite@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000014','evidencia-regresion1@ejemplo.invalid',now()),
 ('30000000-0000-0000-0000-000000000015','evidencia-regresion2@ejemplo.invalid',now());
insert into auth.users(id,email,is_anonymous) values
 ('30000000-0000-0000-0000-000000000010','evidencia-anonimo@ejemplo.invalid',true);
update public.profiles set rol_id = 1 where id = '30000000-0000-0000-0000-000000000007';
update public.profiles set rol_id = 4 where id = '30000000-0000-0000-0000-000000000008';
update public.profiles set rol_id = 5 where id = '30000000-0000-0000-0000-000000000009';
update public.profiles set rol_id = 5 where id = '30000000-0000-0000-0000-000000000010';
update public.profiles set puntos = 0 where id in
 ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003');
-- -92001 flujo completo · -92002 impugnación pendiente · -92003 impugnación aceptada ·
-- -92004 admin aprueba y revierte · -92005 admin rechaza · -92006 evidencia única ·
-- -92007 reporte cerrado · -92008 foto rechazada · -92009 foto de reporte (regresión) ·
-- -92010..-92013 límite diario · -92014 voto reparado · -92015 elegibilidad ·
-- -92016 reporte rechazado · -92017 aprobación sin foto · -92018/-92019 admin con
-- impugnaciones · -92020 verificaciones repetidas · -92021 impugnación que bloquea ·
-- -92022 fotos originales (S9) · -92023/-92024 cierre directo a 2 y a 3 ·
-- -92025 cierre directo sin foto · -92026 cierre directo sin evidencia.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id)
select -92000 - n, '30000000-0000-0000-0000-000000000001',
  'Evidencia de reparación ' || n, 0, 0, case when n = 7 then 2 else 1 end
from generate_series(1,26) n;

-- ---------------------------------------------------------------------------
-- S12/S15: solo cuentas registradas con email confirmado informan reparaciones.
-- ---------------------------------------------------------------------------
set local role service_role;
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92015,
  '30000000-0000-0000-0000-000000000010','Foto de una sesión anónima',pg_temp.huella(15))$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92015,
  '30000000-0000-0000-0000-000000000009','Foto de un invitado',pg_temp.huella(15))$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92015,
  '30000000-0000-0000-0000-000000000007','Foto de un administrador',pg_temp.huella(15))$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92015,
  '30000000-0000-0000-0000-000000000008','Foto de un operador',pg_temp.huella(15))$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92015,
  '30000000-0000-0000-0000-000000000011','Foto sin email confirmado',pg_temp.huella(15))$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92015,
  '30000000-0000-0000-0000-000000000002','   ',pg_temp.huella(15))$q$,
  'PRE11','Datos de la evidencia inválidos');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92015,
  '30000000-0000-0000-0000-000000000002','Foto válida','no-es-una-huella')$q$,
  'PRE11','Datos de la evidencia inválidos');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92007,
  '30000000-0000-0000-0000-000000000002','Reporte ya cerrado',pg_temp.huella(7))$q$,
  'PRE05','El reporte ya está cerrado');
reset role;
select pg_temp.exigir(not exists (select 1 from public.evidencias_reparacion where reporte_id in (-92015,-92007)),
  'Un rechazo de elegibilidad o de reporte cerrado no crea evidencia');
select pg_temp.exigir(not exists (select 1 from public.moderacion_imagenes where reporte_id in (-92015,-92007)),
  'Un rechazo de elegibilidad o de reporte cerrado no encola moderación');
select pg_temp.exigir(not exists (select 1 from public.audit_events where report_id in (-92015,-92007)
  and action like 'evidence_%'), 'Un rechazo no escribe auditoría');

-- ---------------------------------------------------------------------------
-- S1/S2: informar la reparación no cambia el estado del reporte; una sola
-- evidencia activa por reporte y ninguna foto repetida.
-- ---------------------------------------------------------------------------
set local role service_role;
select pg_temp.exigir((public.crear_evidencia_reparacion(-92001,
  '30000000-0000-0000-0000-000000000002','Repararon el bache de Av. Uruguay',pg_temp.huella(1))
  ->> 'estado') = 'informada', 'La evidencia nace informada');
select pg_temp.exigir((select estado='informada' and publicada_at is null and url is null
  from public.evidencias_reparacion where reporte_id=-92001),
  'La evidencia informada todavía no tiene foto pública');
select pg_temp.exigir((select destino='evidencia_reparacion' and evidencia_id is not null
  and decision='REVIEW' and estado_publicacion='pendiente'
  and propietario_id='30000000-0000-0000-0000-000000000002'
  from public.moderacion_imagenes where reporte_id=-92001),
  'La foto entra en la cola privada de moderación con destino de evidencia');
select pg_temp.exigir((select path_privado = propietario_id::text || '/' || id::text
  from public.moderacion_imagenes where reporte_id=-92001), 'La ruta privada es la canónica del propietario');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-92001),
  'S2: subir una fotografía no cambia el estado del reporte');
select pg_temp.exigir((select count(*)=1 from public.audit_events where report_id=-92001
  and action='evidence_submitted' and actor_id='30000000-0000-0000-0000-000000000002'
  and report_title='Evidencia de reparación 1' and occurred_at is not null),
  'La evidencia informada se audita con actor, reporte, título y hora');
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92001,
  '30000000-0000-0000-0000-000000000004','Otra evidencia del mismo reporte',pg_temp.huella(11))$q$,
  'PRE03','El reporte ya tiene una evidencia de reparación activa');
select pg_temp.exigir((select count(*)=1 from public.evidencias_reparacion where reporte_id=-92001),
  'El reporte conserva una sola evidencia activa');
reset role;
-- Una foto ya registrada en el reporte no se reutiliza como evidencia.
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
values ('40000000-0000-0000-0000-000000000006',-92006,'30000000-0000-0000-0000-000000000001',
  pg_temp.huella(6),'30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000006');
set local role service_role;
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92006,
  '30000000-0000-0000-0000-000000000002','La misma foto del reporte',pg_temp.huella(6))$q$,
  'PRE03','Esa fotografía ya fue registrada en este reporte');
select pg_temp.exigir(not exists (select 1 from public.evidencias_reparacion where reporte_id=-92006),
  'La foto repetida no crea evidencia');

-- ---------------------------------------------------------------------------
-- S12: la publicación de la evidencia usa la moderación existente y no toca
-- las fotografías originales del reporte.
-- ---------------------------------------------------------------------------
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92001),'https://ejemplo.invalid/reparacion-92001.webp');
select pg_temp.exigir((select estado='en_verificacion' and publicada_at is not null
  and url='https://ejemplo.invalid/reparacion-92001.webp' and bucket='reportes'
  and path is not null and thumbnail_url is not null
  and thumbnail_bucket='reportes' and thumbnail_path is not null
  from public.evidencias_reparacion where reporte_id=-92001),
  'La publicación completa la foto de la evidencia y la pasa a en verificación');
select pg_temp.exigir(not exists (select 1 from public.fotos_reporte where reporte_id=-92001),
  'La foto de la evidencia no entra en fotos_reporte: las originales no se tocan');
select pg_temp.exigir((select estado_publicacion='publicada' and publicado_at is not null
  from public.moderacion_imagenes where reporte_id=-92001), 'La fila de moderación queda publicada');

-- ---------------------------------------------------------------------------
-- S6: el autor de la evidencia no valida su propia fotografía.
-- ---------------------------------------------------------------------------
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92001),'30000000-0000-0000-0000-000000000002','confirmacion')$q$,
  'PRE02','No podés validar tu propia evidencia');
select pg_temp.exigir(not exists (select 1 from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92001)), 'La autovalidación no deja verificación');

-- ---------------------------------------------------------------------------
-- S7/S12: confirmación única e idempotente, sin votos duplicados ni contrarios.
-- ---------------------------------------------------------------------------
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92001),
  '30000000-0000-0000-0000-000000000003','confirmacion') ->> 'confirmaciones')::integer = 1,
  'La primera confirmación cuenta uno');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92001),
  '30000000-0000-0000-0000-000000000003','confirmacion') ->> 'repetida') = 'true',
  'La repetición devuelve el resultado actual sin contar de nuevo');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92001),
  '30000000-0000-0000-0000-000000000003','confirmacion') ->> 'confirmaciones')::integer = 1,
  'La repetición no duplica el conteo');
select pg_temp.exigir((select count(*)=1 from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92001)), 'La repetición no duplica la fila');
select pg_temp.exigir((select count(*)=1 from public.audit_events where report_id=-92001
  and action='evidence_confirmed'), 'La repetición no duplica la auditoría');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92001),'30000000-0000-0000-0000-000000000003','impugnacion','No es la misma reparación')$q$,
  'PRE06','Ya registraste una verificación distinta para esta evidencia');
select pg_temp.exigir((select count(*)=1 from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92001)), 'La verificación contraria no agrega filas');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92001),'30000000-0000-0000-0000-000000000007','confirmacion')$q$,
  'PRE01','Cuenta no habilitada: se requiere una cuenta registrada con email confirmado');

-- ---------------------------------------------------------------------------
-- S5/S12: tres confirmaciones cierran el reporte una sola vez (estado, historial
-- y puntos atómicos) y la repetición no vuelve a cerrar.
-- ---------------------------------------------------------------------------
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92001),
  '30000000-0000-0000-0000-000000000004','confirmacion') ->> 'cerrado') = 'false',
  'Dos confirmaciones todavía no cierran');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92001),
  '30000000-0000-0000-0000-000000000005','confirmacion') ->> 'cerrado') = 'true',
  'Tres confirmaciones cierran la reparación');
select pg_temp.exigir((select estado_id=2 from public.reportes where id=-92001),
  'El reporte pasa a Reparado');
select pg_temp.exigir((select count(*)=1 and bool_and(estado_anterior_id=1 and estado_nuevo_id=2
  and usuario_id='30000000-0000-0000-0000-000000000005'
  and comentario='Reparación validada por 3 confirmaciones de usuarios')
  from public.historial_estados where reporte_id=-92001), 'El cierre registra una sola fila de historial');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'El cierre acredita cinco puntos al autor');
select pg_temp.exigir(not exists (select 1 from public.audit_events where report_id=-92001
  and action='evidence_approved'), 'El cierre comunitario no se audita como aprobación administrativa');
select pg_temp.exigir((select estado='validada' and resuelta_at is not null
  and resuelta_por='30000000-0000-0000-0000-000000000005'
  from public.evidencias_reparacion where reporte_id=-92001), 'La evidencia queda validada');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92001),
  '30000000-0000-0000-0000-000000000005','confirmacion') ->> 'cerrado') = 'false',
  'La repetición no vuelve a cerrar');
select pg_temp.exigir((select count(*)=1 from public.historial_estados
  where reporte_id=-92001 and estado_nuevo_id=2), 'La repetición no duplica el historial');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'La repetición no duplica los puntos');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92001),'30000000-0000-0000-0000-000000000006','confirmacion')$q$,
  'PRE05','La evidencia no está en verificación');

-- ---------------------------------------------------------------------------
-- S4/S5: la impugnación exige motivo, bloquea el cierre y su descarte lo habilita.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92002,'30000000-0000-0000-0000-000000000006',
  'Reparación en verificación',pg_temp.huella(2));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92002),'https://ejemplo.invalid/reparacion-92002.webp');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92002),'30000000-0000-0000-0000-000000000012','impugnacion')$q$,
  'PRE07','La impugnación requiere un motivo de hasta 500 caracteres');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92002),'30000000-0000-0000-0000-000000000012','impugnacion','   ')$q$,
  'PRE07','La impugnación requiere un motivo de hasta 500 caracteres');
select pg_temp.exigir(not exists (select 1 from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92002) and tipo='impugnacion'),
  'La impugnación sin motivo no se registra');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92002),
  '30000000-0000-0000-0000-000000000003','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92002),
  '30000000-0000-0000-0000-000000000004','confirmacion');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92002),
  '30000000-0000-0000-0000-000000000012','impugnacion','La foto no corresponde a este reporte')
  ->> 'impugnaciones_pendientes')::integer = 1, 'La impugnación queda pendiente');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92002),
  '30000000-0000-0000-0000-000000000005','confirmacion') ->> 'cerrado') = 'false',
  'Tres confirmaciones con una impugnación pendiente no cierran');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-92002),
  'La impugnación pendiente deja el reporte pendiente');
select pg_temp.exigir((select estado='en_verificacion' from public.evidencias_reparacion
  where reporte_id=-92002), 'La evidencia sigue en verificación');
select pg_temp.exigir((select puntos=0 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'Sin cierre no hay puntos');
-- Un participante común nunca resuelve impugnaciones.
select pg_temp.rechazar($q$select public.resolver_impugnacion_reparacion(
  pg_temp.impugnacion(pg_temp.evidencia(-92002),'30000000-0000-0000-0000-000000000012'),
  '30000000-0000-0000-0000-000000000012','descartada')$q$,
  'PRE08','Administrador no autorizado');
select pg_temp.exigir((select estado='pendiente' from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92002) and tipo='impugnacion'),
  'El rechazo de autorización no resuelve la impugnación');
-- El administrador descarta la impugnación y la reparación alcanza el umbral.
select pg_temp.exigir((public.resolver_impugnacion_reparacion(
  pg_temp.impugnacion(pg_temp.evidencia(-92002),'30000000-0000-0000-0000-000000000012'),
  '30000000-0000-0000-0000-000000000007','descartada','Verificamos el lugar y la reparación es real')
  ->> 'cerrado') = 'true', 'Descartar la impugnación cierra con tres confirmaciones');
select pg_temp.exigir((select estado='descartada' and resuelta_at is not null
  and resuelta_por='30000000-0000-0000-0000-000000000007'
  and motivo_resolucion='Verificamos el lugar y la reparación es real'
  and motivo='La foto no corresponde a este reporte'
  from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92002) and tipo='impugnacion'),
  'La impugnación queda descartada conservando el motivo ciudadano');
select pg_temp.exigir((select estado_id=2 from public.reportes where id=-92002),
  'El reporte pasa a Reparado al descartar la impugnación');
select pg_temp.exigir((select count(*)=1 and bool_and(estado_anterior_id=1 and estado_nuevo_id=2
  and usuario_id='30000000-0000-0000-0000-000000000007')
  from public.historial_estados where reporte_id=-92002), 'El descarte registra un solo historial');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'El descarte acredita cinco puntos una sola vez');
select pg_temp.exigir((public.resolver_impugnacion_reparacion(
  pg_temp.impugnacion(pg_temp.evidencia(-92002),'30000000-0000-0000-0000-000000000012'),
  '30000000-0000-0000-0000-000000000007','descartada') ->> 'repetida') = 'true',
  'Resolver dos veces la misma impugnación es idempotente');
select pg_temp.exigir((select count(*)=1 from public.historial_estados
  where reporte_id=-92002 and estado_nuevo_id=2), 'La resolución repetida no duplica el historial');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'La resolución repetida no duplica los puntos');

-- ---------------------------------------------------------------------------
-- S8: aceptar la impugnación rechaza la evidencia y deja el reporte pendiente.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92003,'30000000-0000-0000-0000-000000000005',
  'Reparación impugnada',pg_temp.huella(3));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92003),'https://ejemplo.invalid/reparacion-92003.webp');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92003),
  '30000000-0000-0000-0000-000000000003','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92003),
  '30000000-0000-0000-0000-000000000004','impugnacion','El bache sigue ahí');
select pg_temp.exigir((public.resolver_impugnacion_reparacion(
  pg_temp.impugnacion(pg_temp.evidencia(-92003),'30000000-0000-0000-0000-000000000004'),
  '30000000-0000-0000-0000-000000000007','aceptada','La foto no muestra la reparación')
  ->> 'evidencia_estado') = 'rechazada', 'Aceptar la impugnación rechaza la evidencia');
select pg_temp.exigir((select estado='rechazada' and resuelta_por='30000000-0000-0000-0000-000000000007'
  and motivo_resolucion='La foto no muestra la reparación'
  from public.evidencias_reparacion where reporte_id=-92003), 'La evidencia queda rechazada con su motivo');
select pg_temp.exigir((select estado='aceptada' and resuelta_at is not null
  from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92003) and tipo='impugnacion'),
  'La impugnación queda aceptada');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-92003),
  'El reporte sigue pendiente tras rechazar la evidencia');
select pg_temp.exigir((select puntos=0 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'Rechazar la evidencia no acredita puntos');
select pg_temp.exigir(not exists (select 1 from public.historial_estados where reporte_id=-92003),
  'Rechazar la evidencia no registra cambio de estado');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92003),'30000000-0000-0000-0000-000000000006','confirmacion')$q$,
  'PRE05','La evidencia no está en verificación');
select pg_temp.exigir((public.resolver_impugnacion_reparacion(
  pg_temp.impugnacion(pg_temp.evidencia(-92003),'30000000-0000-0000-0000-000000000004'),
  '30000000-0000-0000-0000-000000000007','aceptada') ->> 'repetida') = 'true',
  'Aceptar dos veces la misma impugnación es idempotente');
select pg_temp.rechazar($q$select public.resolver_impugnacion_reparacion(
  pg_temp.impugnacion(pg_temp.evidencia(-92003),'30000000-0000-0000-0000-000000000004'),
  '30000000-0000-0000-0000-000000000007','descartada')$q$,
  'PRE07','La impugnación ya fue resuelta');
select pg_temp.rechazar($q$select public.resolver_impugnacion_reparacion(
  (select id from public.verificaciones_reparacion
    where evidencia_id=pg_temp.evidencia(-92003) and tipo='confirmacion'),
  '30000000-0000-0000-0000-000000000007','descartada')$q$,
  'PRE07','La verificación indicada no es una impugnación');

-- ---------------------------------------------------------------------------
-- S8: el administrador aprueba, revierte (vuelve a Pendiente con historial y −5
-- puntos) y rechaza una evidencia.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92004,'30000000-0000-0000-0000-000000000006',
  'Reparación aprobada por administración',pg_temp.huella(4));
select pg_temp.rechazar($q$select public.resolver_evidencia_reparacion_admin(
  pg_temp.evidencia(-92004),'30000000-0000-0000-0000-000000000002','aprobar')$q$,
  'PRE08','Administrador no autorizado');
select pg_temp.exigir((select estado='informada' from public.evidencias_reparacion
  where reporte_id=-92004), 'El rechazo de autorización no cambia la evidencia');
-- Aprobar exige la foto publicada (A1): la evidencia se publica antes.
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92004),'https://ejemplo.invalid/reparacion-92004.webp');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92004),
  '30000000-0000-0000-0000-000000000007','aprobar','Obra verificada en el lugar')
  ->> 'cerrado') = 'true', 'Aprobar la evidencia cierra el reporte');
select pg_temp.exigir((select estado='validada' and resuelta_por='30000000-0000-0000-0000-000000000007'
  from public.evidencias_reparacion where reporte_id=-92004), 'La evidencia aprobada queda validada');
select pg_temp.exigir((select estado_id=2 from public.reportes where id=-92004),
  'Aprobar la evidencia deja el reporte Reparado');
select pg_temp.exigir((select count(*)=1 and bool_and(estado_nuevo_id=2
  and usuario_id='30000000-0000-0000-0000-000000000007'
  and comentario='Obra verificada en el lugar')
  from public.historial_estados where reporte_id=-92004), 'Aprobar registra una sola fila de historial');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'Aprobar acredita cinco puntos una sola vez');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92004),
  '30000000-0000-0000-0000-000000000007','aprobar') ->> 'repetida') = 'true',
  'Aprobar dos veces es idempotente');
select pg_temp.exigir((select count(*)=1 from public.historial_estados where reporte_id=-92004),
  'La aprobación repetida no duplica el historial');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'La aprobación repetida no duplica los puntos');
select pg_temp.rechazar($q$select public.resolver_evidencia_reparacion_admin(
  pg_temp.evidencia(-92004),'30000000-0000-0000-0000-000000000007','rechazar')$q$,
  'PRE09','Revertí la validación antes de rechazar la evidencia');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92004),
  '30000000-0000-0000-0000-000000000007','revertir','La obra no estaba terminada')
  ->> 'revertido') = 'true', 'Revertir una evidencia validada devuelve el reporte a Pendiente');
select pg_temp.exigir((select estado='revertida' from public.evidencias_reparacion
  where reporte_id=-92004), 'La evidencia queda revertida');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-92004),
  'El reporte vuelve a Pendiente');
select pg_temp.exigir((select count(*)=1 from public.historial_estados
  where reporte_id=-92004 and estado_anterior_id=2 and estado_nuevo_id=1),
  'Revertir registra el historial 2→1');
select pg_temp.exigir((select count(*)=2 from public.historial_estados where reporte_id=-92004),
  'La reversión conserva ambos historiales');
select pg_temp.exigir((select puntos=0 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'Revertir descuenta los cinco puntos una sola vez');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92004),
  '30000000-0000-0000-0000-000000000007','revertir') ->> 'repetida') = 'true',
  'Revertir dos veces es idempotente');
select pg_temp.exigir((select puntos=0 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'La reversión repetida no vuelve a descontar');
select pg_temp.rechazar($q$select public.resolver_evidencia_reparacion_admin(
  pg_temp.evidencia(-92004),'30000000-0000-0000-0000-000000000007','aprobar')$q$,
  'PRE09','La evidencia rechazada o revertida no se puede aprobar');
select pg_temp.rechazar($q$select public.resolver_evidencia_reparacion_admin(
  pg_temp.evidencia(-92004),'30000000-0000-0000-0000-000000000007','archivar')$q$,
  'PRE11','Acción administrativa inválida');
-- Rechazo administrativo de una evidencia todavía no publicada.
select public.crear_evidencia_reparacion(-92005,'30000000-0000-0000-0000-000000000012',
  'Reparación rechazada por administración',pg_temp.huella(5));
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92005),
  '30000000-0000-0000-0000-000000000007','rechazar','La foto no muestra la reparación')
  ->> 'evidencia_estado') = 'rechazada', 'Rechazar la evidencia la descarta');
select pg_temp.exigir((select estado='rechazada' and motivo_resolucion='La foto no muestra la reparación'
  from public.evidencias_reparacion where reporte_id=-92005), 'La evidencia rechazada conserva su motivo');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-92005),
  'Rechazar la evidencia deja el reporte pendiente');
select pg_temp.exigir(not exists (select 1 from public.historial_estados where reporte_id=-92005),
  'Rechazar la evidencia no registra historial');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92005),
  '30000000-0000-0000-0000-000000000007','rechazar') ->> 'repetida') = 'true',
  'Rechazar dos veces es idempotente');
select pg_temp.rechazar($q$select public.resolver_evidencia_reparacion_admin(
  pg_temp.evidencia(-92005),'30000000-0000-0000-0000-000000000007','revertir')$q$,
  'PRE09','Solo se puede revertir una evidencia validada');
-- Aprobar sobre un reporte rechazado no inventa una transición.
select public.crear_evidencia_reparacion(-92016,'30000000-0000-0000-0000-000000000002',
  'Evidencia sobre reporte que será rechazado',pg_temp.huella(16));
reset role;
-- El cierre directo ya resolvió la evidencia activa (A4).
update public.reportes set estado_id=3 where id=-92016;
set local role service_role;
select pg_temp.exigir((select estado='rechazada' from public.evidencias_reparacion
  where reporte_id=-92016), 'El cierre directo rechaza la evidencia sin foto publicada');
select pg_temp.rechazar($q$select public.resolver_evidencia_reparacion_admin(
  pg_temp.evidencia(-92016),'30000000-0000-0000-0000-000000000007','aprobar')$q$,
  'PRE05','El reporte ya está cerrado');
select pg_temp.exigir((select estado='rechazada' from public.evidencias_reparacion
  where reporte_id=-92016), 'Una aprobación rechazada no cambia la evidencia');

-- ---------------------------------------------------------------------------
-- S12: una foto de evidencia rechazada por moderación invalida la evidencia y
-- nunca retira el reporte.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92008,'30000000-0000-0000-0000-000000000005',
  'Foto que no pasa la moderación',pg_temp.huella(8));
do $$ declare v_token uuid; begin
  perform pg_temp.exigir(public.reclamar_imagen_moderacion(pg_temp.moderacion(pg_temp.evidencia(-92008)),
    '30000000-0000-0000-0000-000000000005') is not null, 'Reclamo de la foto rechazada');
  select token into v_token from public.moderacion_imagenes where id = pg_temp.moderacion(pg_temp.evidencia(-92008));
  perform pg_temp.exigir(public.decidir_imagen_moderacion(pg_temp.moderacion(pg_temp.evidencia(-92008)),
    v_token, 'REJECTED', '["contenido_no_permitido"]'), 'Rechazo de moderación de la foto');
end $$;
select pg_temp.exigir((select estado='rechazada' and resuelta_at is not null
  and motivo_resolucion='Fotografía rechazada por moderación'
  from public.evidencias_reparacion where reporte_id=-92008),
  'Una foto rechazada mueve la evidencia a rechazada');
select pg_temp.exigir((select estado_publicacion='rechazada' and decision='REJECTED'
  from public.moderacion_imagenes where reporte_id=-92008), 'La fila de moderación queda rechazada');
select pg_temp.exigir((select deleted_at is null and estado_id=1 from public.reportes where id=-92008),
  'La foto de la evidencia rechazada no retira el reporte');
select pg_temp.exigir(not exists (select 1 from public.avisos_retiro_reporte where reporte_id=-92008),
  'Una foto de evidencia rechazada no genera aviso de retiro');
select pg_temp.exigir(not exists (select 1 from public.puntos_creacion_reporte where reporte_id=-92008),
  'Una foto de evidencia rechazada no revierte puntos de creación');
select pg_temp.exigir((select puntos=0 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'Una foto de evidencia rechazada no toca los puntos del autor');
-- Sin evidencia activa, el autor puede volver a informar la reparación.
select pg_temp.exigir((public.crear_evidencia_reparacion(-92008,
  '30000000-0000-0000-0000-000000000005','Segundo intento de evidencia',pg_temp.huella(18))
  ->> 'estado') = 'informada', 'Tras el rechazo se puede volver a informar');
select pg_temp.exigir((select count(*)=2 from public.evidencias_reparacion where reporte_id=-92008),
  'El rechazo conserva el historial de evidencias');

-- ---------------------------------------------------------------------------
-- Regresión: el destino «reporte» de la moderación sigue insertando en fotos_reporte.
-- ---------------------------------------------------------------------------
reset role;
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
values ('40000000-0000-0000-0000-000000000009',-92009,'30000000-0000-0000-0000-000000000001',
  pg_temp.huella(9),'30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000009');
set local role service_role;
do $$ declare v_token uuid; begin
  perform pg_temp.exigir(public.reclamar_imagen_moderacion('40000000-0000-0000-0000-000000000009',
    '30000000-0000-0000-0000-000000000001') is not null, 'Reclamo de una foto de reporte');
  select token into v_token from public.moderacion_imagenes where id='40000000-0000-0000-0000-000000000009';
  perform pg_temp.exigir(public.decidir_imagen_moderacion('40000000-0000-0000-0000-000000000009',
    v_token,'APPROVED','[]'), 'Aprobación de una foto de reporte');
  select token into v_token from public.moderacion_imagenes where id='40000000-0000-0000-0000-000000000009';
  perform pg_temp.exigir(public.confirmar_publicacion_moderacion('40000000-0000-0000-0000-000000000009',
    v_token,'https://ejemplo.invalid/reporte-92009.webp',null), 'Publicación de una foto de reporte');
end $$;
select pg_temp.exigir((select count(*)=1 and bool_and(url='https://ejemplo.invalid/reporte-92009.webp'
  and bucket='reportes'
  and path=(select id::text || '/' || token::text from public.moderacion_imagenes
    where id='40000000-0000-0000-0000-000000000009')
  and thumbnail_url is null)
  from public.fotos_reporte where reporte_id=-92009),
  'Regresión: la foto de reporte sigue entrando en fotos_reporte');
select pg_temp.exigir(not exists (select 1 from public.evidencias_reparacion where reporte_id=-92009),
  'La foto de reporte no crea evidencia de reparación');
select pg_temp.exigir((select destino='reporte' and evidencia_id is null
  from public.moderacion_imagenes where id='40000000-0000-0000-0000-000000000009'),
  'La fila histórica de moderación conserva el destino reporte');

-- ---------------------------------------------------------------------------
-- S7: límite diario de tres evidencias por autor en 24 horas.
-- ---------------------------------------------------------------------------
select public.crear_evidencia_reparacion(-92010,'30000000-0000-0000-0000-000000000013',
  'Evidencia diaria uno',pg_temp.huella(10));
select public.crear_evidencia_reparacion(-92011,'30000000-0000-0000-0000-000000000013',
  'Evidencia diaria dos',pg_temp.huella(11));
select public.crear_evidencia_reparacion(-92012,'30000000-0000-0000-0000-000000000013',
  'Evidencia diaria tres',pg_temp.huella(12));
select pg_temp.rechazar($q$select public.crear_evidencia_reparacion(-92013,
  '30000000-0000-0000-0000-000000000013','Evidencia diaria cuatro',pg_temp.huella(13))$q$,
  'PRE04','Alcanzaste el límite de 3 evidencias de reparación por día');
select pg_temp.exigir(not exists (select 1 from public.evidencias_reparacion where reporte_id=-92013),
  'El límite diario no crea la evidencia rechazada');
select pg_temp.exigir(not exists (select 1 from public.audit_events where report_id=-92013
  and action like 'evidence_%'),
  'El límite diario no escribe auditoría');
reset role;
-- Una evidencia fuera de la ventana de 24 horas libera un lugar.
update public.evidencias_reparacion set created_at = created_at - interval '25 hours'
  where autor_id='30000000-0000-0000-0000-000000000013' and reporte_id=-92010;
set local role service_role;
select pg_temp.exigir((public.crear_evidencia_reparacion(-92013,
  '30000000-0000-0000-0000-000000000013','Evidencia diaria cuatro',pg_temp.huella(13))
  ->> 'estado') = 'informada', 'El límite se mide en una ventana de 24 horas');
select pg_temp.exigir((select count(*)=4 from public.evidencias_reparacion
  where autor_id='30000000-0000-0000-0000-000000000013'), 'El autor conserva sus cuatro evidencias');

-- ---------------------------------------------------------------------------
-- S15: el voto «reparado» ya no se acepta y «no existe» sigue funcionando.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000003';
set local role service_role;
select pg_temp.rechazar($q$select public.registrar_voto_exclusivo(-92014,
  '30000000-0000-0000-0000-000000000003','reparado')$q$,
  'PRE10','El voto reparado fue reemplazado por la verificación de evidencias de reparación');
select pg_temp.exigir((select count(*)=0 from public.votos_reparado where reporte_id=-92014),
  'El voto reparado rechazado no deja fila histórica');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-92014),
  'El voto reparado rechazado no cierra el reporte');
select pg_temp.exigir((public.registrar_voto_exclusivo(-92014,
  '30000000-0000-0000-0000-000000000003','no_existe') ->> 'primero') = 'true',
  'El voto no existe sigue registrándose');
select pg_temp.exigir((select votos_no_existe_count=1 and votos_reparado_count=0
  from public.reportes_vote_summary where reporte_id=-92014), 'El resumen conserva el voto no existe');
select pg_temp.exigir((select puntos=1 from public.profiles
  where id='30000000-0000-0000-0000-000000000003'), 'El primer voto no existe sigue acreditando un punto');
select pg_temp.exigir((public.registrar_voto_exclusivo(-92014,
  '30000000-0000-0000-0000-000000000003','no_existe') ->> 'primero') = 'false',
  'Repetir el voto no existe sigue siendo idempotente');
select pg_temp.exigir((select puntos=1 from public.profiles
  where id='30000000-0000-0000-0000-000000000003'), 'Repetir el voto no acredita otro punto');

-- ---------------------------------------------------------------------------
-- S8 (P1/A1): aprobar exige una evidencia con foto publicada, nunca una informada.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92017,'30000000-0000-0000-0000-000000000006',
  'Evidencia todavía en moderación',pg_temp.huella(30));
select pg_temp.rechazar($q$select public.resolver_evidencia_reparacion_admin(
  pg_temp.evidencia(-92017),'30000000-0000-0000-0000-000000000007','aprobar')$q$,
  'PRE12','La evidencia todavía no tiene foto publicada: no se puede aprobar la reparación');
select pg_temp.exigir((select estado='informada' and publicada_at is null and resuelta_at is null
  from public.evidencias_reparacion where reporte_id=-92017),
  'P1: la aprobación rechazada deja la evidencia informada y sin resolver');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-92017),
  'P1: la aprobación rechazada no cierra el reporte');
select pg_temp.exigir(not exists (select 1 from public.historial_estados where reporte_id=-92017),
  'P1: la aprobación rechazada no registra historial');
select pg_temp.exigir((select puntos=0 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'P1: la aprobación rechazada no acredita puntos');
select pg_temp.exigir(not exists (select 1 from public.audit_events where report_id=-92017
  and action='evidence_approved'), 'P1: la aprobación rechazada no se audita como aprobación');
-- Publicada la foto, la aprobación administrativa sigue funcionando.
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92017),'https://ejemplo.invalid/reparacion-92017.webp');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92017),
  '30000000-0000-0000-0000-000000000007','aprobar') ->> 'cerrado') = 'true',
  'Publicada la foto, la aprobación administrativa cierra el reporte');

-- ---------------------------------------------------------------------------
-- S8 (P2/A2): aprobar resuelve las impugnaciones pendientes como descartadas.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92018,'30000000-0000-0000-0000-000000000003',
  'Evidencia con impugnación que resuelve la administración',pg_temp.huella(31));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92018),'https://ejemplo.invalid/reparacion-92018.webp');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92018),
  '30000000-0000-0000-0000-000000000004','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92018),
  '30000000-0000-0000-0000-000000000005','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92018),
  '30000000-0000-0000-0000-000000000012','impugnacion','La foto no es de este bache');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92018),
  '30000000-0000-0000-0000-000000000007','aprobar','Verificada en el lugar')
  ->> 'impugnaciones_pendientes')::integer = 0, 'P2: aprobar deja cero impugnaciones pendientes');
select pg_temp.exigir((select estado='descartada' and resuelta_at is not null
  and resuelta_por='30000000-0000-0000-0000-000000000007'
  and motivo='La foto no es de este bache'
  from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92018) and tipo='impugnacion'),
  'P2: la impugnación pendiente queda descartada con el administrador y su fecha');
select pg_temp.exigir((select estado='validada' from public.evidencias_reparacion where reporte_id=-92018),
  'P2: la evidencia aprobada queda validada');
select pg_temp.exigir((select estado_id=2 from public.reportes where id=-92018),
  'P2: el reporte queda Reparado');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'P2: aprobar acredita cinco puntos una sola vez');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92018),
  '30000000-0000-0000-0000-000000000007','aprobar') ->> 'repetida') = 'true',
  'P2: repetir la aprobación es idempotente');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'P2: la repetición no acredita puntos extra');
select pg_temp.exigir((select count(*)=1 from public.historial_estados where reporte_id=-92018),
  'P2: la repetición no duplica el historial');
select pg_temp.exigir((select estado='descartada' and resuelta_por='30000000-0000-0000-0000-000000000007'
  from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92018) and tipo='impugnacion'),
  'P2: la repetición conserva la impugnación resuelta');

-- ---------------------------------------------------------------------------
-- S8 (P2/A2): rechazar resuelve las impugnaciones pendientes como aceptadas.
-- S6 (P7): el autor de la evidencia tampoco puede impugnarla.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92019,'30000000-0000-0000-0000-000000000004',
  'Evidencia que la administración rechaza',pg_temp.huella(32));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92019),'https://ejemplo.invalid/reparacion-92019.webp');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92019),
  '30000000-0000-0000-0000-000000000003','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92019),
  '30000000-0000-0000-0000-000000000012','impugnacion','La vereda sigue rota');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92019),'30000000-0000-0000-0000-000000000004','impugnacion','Impugno mi propia foto')$q$,
  'PRE02','No podés validar tu propia evidencia');
select pg_temp.exigir((select count(*)=2 from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92019)), 'P7: el autor no deja verificación propia');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92019),
  '30000000-0000-0000-0000-000000000007','rechazar','La foto no muestra la reparación')
  ->> 'impugnaciones_pendientes')::integer = 0, 'P2: rechazar deja cero impugnaciones pendientes');
select pg_temp.exigir((select estado='aceptada' and resuelta_at is not null
  and resuelta_por='30000000-0000-0000-0000-000000000007'
  and motivo='La vereda sigue rota'
  from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92019) and tipo='impugnacion'),
  'P2: la impugnación pendiente queda aceptada con el administrador y su fecha');
select pg_temp.exigir((select estado='rechazada' from public.evidencias_reparacion where reporte_id=-92019),
  'P2: la evidencia rechazada queda rechazada');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-92019),
  'P2: rechazar la evidencia deja el reporte pendiente');
select pg_temp.exigir((select puntos=0 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'P2: rechazar no acredita puntos');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92019),
  '30000000-0000-0000-0000-000000000007','rechazar') ->> 'repetida') = 'true',
  'P2: repetir el rechazo es idempotente');
select pg_temp.exigir((select estado='aceptada' and resuelta_por='30000000-0000-0000-0000-000000000007'
  from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92019) and tipo='impugnacion'),
  'P2: la repetición conserva la impugnación aceptada');

-- ---------------------------------------------------------------------------
-- S5/S12 (P4): repetir la misma verificación es idempotente y no premia de nuevo.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92020,'30000000-0000-0000-0000-000000000014',
  'Evidencia con verificaciones repetidas',pg_temp.huella(33));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92020),'https://ejemplo.invalid/reparacion-92020.webp');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92020),
  '30000000-0000-0000-0000-000000000003','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92020),
  '30000000-0000-0000-0000-000000000004','confirmacion');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92020),
  '30000000-0000-0000-0000-000000000005','confirmacion') ->> 'cerrado') = 'true',
  'P4: la tercera confirmación cierra la reparación');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92020),
  '30000000-0000-0000-0000-000000000005','confirmacion') ->> 'repetida') = 'true',
  'P4: la misma verificación repetida es idempotente');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'P4: la repetición no acredita puntos extra');
select pg_temp.exigir((select count(*)=1 from public.historial_estados where reporte_id=-92020),
  'P4: la repetición no duplica el historial');
select pg_temp.exigir((select count(*)=3 from public.audit_events where report_id=-92020
  and action='evidence_confirmed'), 'P4: la repetición no duplica la auditoría');

-- ---------------------------------------------------------------------------
-- S5 (P6): la impugnación pendiente bloquea el cierre; descartarla cierra una sola
-- vez y una confirmación posterior al cierre ya no se acepta.
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92021,'30000000-0000-0000-0000-000000000015',
  'Evidencia con impugnación pendiente',pg_temp.huella(34));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92021),'https://ejemplo.invalid/reparacion-92021.webp');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92021),
  '30000000-0000-0000-0000-000000000003','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92021),
  '30000000-0000-0000-0000-000000000004','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92021),
  '30000000-0000-0000-0000-000000000012','impugnacion','La zanja sigue abierta');
select pg_temp.exigir((public.registrar_verificacion_reparacion(pg_temp.evidencia(-92021),
  '30000000-0000-0000-0000-000000000006','confirmacion') ->> 'cerrado') = 'false',
  'P6: con una impugnación pendiente la tercera confirmación no cierra');
select pg_temp.exigir((select estado_id=1 from public.reportes where id=-92021)
  and (select puntos=0 from public.profiles where id='30000000-0000-0000-0000-000000000001'),
  'P6: sin cierre no hay estado Reparado ni puntos');
select pg_temp.exigir((public.resolver_impugnacion_reparacion(
  pg_temp.impugnacion(pg_temp.evidencia(-92021),'30000000-0000-0000-0000-000000000012'),
  '30000000-0000-0000-0000-000000000007','descartada','La impugnación no se sostiene')
  ->> 'cerrado') = 'true', 'P6: descartar la impugnación cierra la reparación');
select pg_temp.exigir((public.resolver_impugnacion_reparacion(
  pg_temp.impugnacion(pg_temp.evidencia(-92021),'30000000-0000-0000-0000-000000000012'),
  '30000000-0000-0000-0000-000000000007','descartada') ->> 'repetida') = 'true',
  'P6: repetir el descarte es idempotente');
select pg_temp.exigir((select puntos=5 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'), 'P6: el cierre acredita cinco puntos una sola vez');
select pg_temp.exigir((select count(*)=1 from public.historial_estados where reporte_id=-92021),
  'P6: el cierre repetido no duplica el historial');
select pg_temp.rechazar($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92021),'30000000-0000-0000-0000-000000000001','confirmacion')$q$,
  'PRE05','La evidencia no está en verificación');
select pg_temp.exigir((select count(*)=3 from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92021) and tipo='confirmacion'),
  'P6: la cuarta confirmación posterior al cierre no se registra');

-- ---------------------------------------------------------------------------
-- Regresión (P9): las filas históricas de moderación quedan en destino «reporte».
-- ---------------------------------------------------------------------------
reset role;
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
values ('40000000-0000-0000-0000-000000000019',-92026,
  '30000000-0000-0000-0000-000000000001',pg_temp.huella(35),
  '30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000019');
select pg_temp.exigir((select destino='reporte' and evidencia_id is null
  from public.moderacion_imagenes where id='40000000-0000-0000-0000-000000000019'),
  'P9: una fila de moderación sin destino explícito queda en reporte');
select pg_temp.exigir((select count(*)=2 and bool_and(destino='reporte' and evidencia_id is null)
  from public.moderacion_imagenes
  where id in ('40000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000009')),
  'P9: las filas históricas de moderación conservan destino reporte sin evidencia');

-- ---------------------------------------------------------------------------
-- S9: el flujo completo, incluida la reversión, no toca las fotos del reporte.
-- ---------------------------------------------------------------------------
insert into public.fotos_reporte(id,reporte_id,url,bucket,path)
values (50000001,-92022,'https://ejemplo.invalid/reporte-92022-original.webp','reportes',
  '30000000-0000-0000-0000-000000000001/foto-original-92022');
select pg_temp.exigir(set_config('prueba.fotos_antes', pg_temp.fotos(-92022)::text, false) is not null,
  'S9: se toma la instantánea de las fotos originales');
set local role service_role;
select public.crear_evidencia_reparacion(-92022,'30000000-0000-0000-0000-000000000003',
  'Reparación con foto original publicada',pg_temp.huella(36));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92022),'https://ejemplo.invalid/reparacion-92022.webp');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92022),
  '30000000-0000-0000-0000-000000000004','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92022),
  '30000000-0000-0000-0000-000000000005','confirmacion');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92022),
  '30000000-0000-0000-0000-000000000006','confirmacion');
select pg_temp.exigir((select estado_id=2 from public.reportes where id=-92022),
  'S9: el flujo comunitario cierra el reporte con una foto original previa');
select pg_temp.exigir((public.resolver_evidencia_reparacion_admin(pg_temp.evidencia(-92022),
  '30000000-0000-0000-0000-000000000007','revertir','La reparación no estaba terminada')
  ->> 'revertido') = 'true', 'S9: la reversión administrativa devuelve el reporte a Pendiente');
select pg_temp.exigir(pg_temp.fotos(-92022)::text = current_setting('prueba.fotos_antes'),
  'S9: las fotografías originales del reporte no cambian en ningún paso del flujo');
select pg_temp.exigir((select estado_id=1 and deleted_at is null from public.reportes where id=-92022),
  'S9: tras revertir el reporte queda Pendiente y visible');

-- ---------------------------------------------------------------------------
-- S8/S9 (A4): el cierre directo del reporte resuelve la evidencia activa y sus
-- impugnaciones sin escribir puntos ni historial (los escribe la aplicación).
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set puntos=0 where id='30000000-0000-0000-0000-000000000001';
set local role service_role;
select public.crear_evidencia_reparacion(-92023,'30000000-0000-0000-0000-000000000014',
  'Evidencia que resuelve el cierre directo',pg_temp.huella(37));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92023),'https://ejemplo.invalid/reparacion-92023.webp');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92023),
  '30000000-0000-0000-0000-000000000012','impugnacion','El bache sigue en la esquina');
reset role;
update public.reportes set estado_id=2 where id=-92023;
set local role service_role;
select pg_temp.exigir((select estado='validada' and resuelta_at is not null
  from public.evidencias_reparacion where reporte_id=-92023),
  'A4: con foto publicada el cierre directo a Reparado valida la evidencia');
select pg_temp.exigir((select estado='descartada' and resuelta_at is not null
  from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92023) and tipo='impugnacion'),
  'A4: validar la evidencia descarta las impugnaciones pendientes');
select pg_temp.exigir((select puntos=0 from public.profiles
  where id='30000000-0000-0000-0000-000000000001'),
  'A4: el trigger no acredita puntos (los escribe la aplicación)');
select pg_temp.exigir(not exists (select 1 from public.historial_estados where reporte_id=-92023),
  'A4: el trigger no escribe historial (lo escribe la aplicación)');
-- Un cierre repetido no reabre ni vuelve a resolver la evidencia ya resuelta.
reset role;
update public.reportes set estado_id=1 where id=-92023;
update public.reportes set estado_id=2 where id=-92023;
set local role service_role;
select pg_temp.exigir((select estado='validada' from public.evidencias_reparacion where reporte_id=-92023),
  'A4: un cierre repetido no reabre la evidencia ya resuelta');
select pg_temp.exigir((select estado='descartada' from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92023) and tipo='impugnacion'),
  'A4: un cierre repetido no reabre las impugnaciones resueltas');
-- Cierre directo a Rechazado: rechaza la evidencia y acepta sus impugnaciones.
select public.crear_evidencia_reparacion(-92024,'30000000-0000-0000-0000-000000000015',
  'Evidencia de un reporte que se rechaza',pg_temp.huella(38));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-92024),'https://ejemplo.invalid/reparacion-92024.webp');
select public.registrar_verificacion_reparacion(pg_temp.evidencia(-92024),
  '30000000-0000-0000-0000-000000000012','impugnacion','La foto es de otro lugar');
reset role;
update public.reportes set estado_id=3 where id=-92024;
set local role service_role;
select pg_temp.exigir((select estado='rechazada' and resuelta_at is not null
  and motivo_resolucion='Reporte cerrado por administración'
  from public.evidencias_reparacion where reporte_id=-92024),
  'A4: el cierre directo a Rechazado rechaza la evidencia con su motivo');
select pg_temp.exigir((select estado='aceptada' and resuelta_at is not null
  from public.verificaciones_reparacion
  where evidencia_id=pg_temp.evidencia(-92024) and tipo='impugnacion'),
  'A4: rechazar la evidencia acepta sus impugnaciones pendientes');
select pg_temp.exigir((select estado_id=3 from public.reportes where id=-92024),
  'A4: el cierre directo conserva el estado Rechazado');
-- Sin foto publicada el cierre directo a Reparado no valida la evidencia.
select public.crear_evidencia_reparacion(-92025,'30000000-0000-0000-0000-000000000002',
  'Evidencia todavía en moderación para un cierre directo',pg_temp.huella(39));
reset role;
update public.reportes set estado_id=2 where id=-92025;
set local role service_role;
select pg_temp.exigir((select estado='rechazada' and publicada_at is null
  and motivo_resolucion='Reporte cerrado por administración'
  from public.evidencias_reparacion where reporte_id=-92025),
  'A4: sin foto publicada el cierre directo no valida la evidencia');
-- Sin evidencia activa el cierre directo no crea ni resuelve nada.
reset role;
update public.reportes set estado_id=3 where id=-92026;
set local role service_role;
select pg_temp.exigir(not exists (select 1 from public.evidencias_reparacion where reporte_id=-92026),
  'A4: el cierre directo sin evidencia no crea ni resuelve nada');
select pg_temp.exigir((select estado_id=3 from public.reportes where id=-92026),
  'A4: el cierre directo sin evidencia conserva el estado del reporte');

-- ---------------------------------------------------------------------------
-- S12: auditoría con actor, reporte, título y hora para cada acción.
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.exigir((select count(*)=1 from public.audit_events where report_id=-92001
  and action='evidence_submitted' and actor_id='30000000-0000-0000-0000-000000000002'
  and report_title='Evidencia de reparación 1'), 'Auditoría de evidencia informada');
select pg_temp.exigir((select count(*)=3 from public.audit_events where report_id=-92001
  and action='evidence_confirmed'
  and actor_id in ('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000005')), 'Auditoría de las tres confirmaciones');
select pg_temp.exigir((select count(*)=1 from public.audit_events where report_id=-92002
  and action='evidence_challenged' and actor_id='30000000-0000-0000-0000-000000000012'),
  'Auditoría de la impugnación');
select pg_temp.exigir((select count(*)=1 from public.audit_events where report_id=-92002
  and action='evidence_challenge_resolved' and actor_id='30000000-0000-0000-0000-000000000007'),
  'Auditoría de la impugnación resuelta');
select pg_temp.exigir((select count(*)=1 from public.audit_events where report_id=-92004
  and action='evidence_approved' and actor_id='30000000-0000-0000-0000-000000000007'),
  'Auditoría de la aprobación administrativa');
select pg_temp.exigir((select count(*)=1 from public.audit_events where report_id=-92005
  and action='evidence_rejected' and actor_id='30000000-0000-0000-0000-000000000007'),
  'Auditoría del rechazo administrativo');
select pg_temp.exigir((select count(*)=1 from public.audit_events where report_id=-92004
  and action='evidence_reverted' and actor_id='30000000-0000-0000-0000-000000000007'),
  'Auditoría de la reversión administrativa');
select pg_temp.exigir((select bool_and(occurred_at is not null and report_title is not null
  and actor_id is not null and report_id is not null)
  from public.audit_events where action like 'evidence_%'),
  'Toda la auditoría de evidencia registra actor, reporte, título y hora');

-- ---------------------------------------------------------------------------
-- S12: ningún cliente escribe evidencia, verificaciones ni estados.
-- ---------------------------------------------------------------------------
select pg_temp.exigir(not has_table_privilege('anon','public.evidencias_reparacion','select')
  and not has_table_privilege('anon','public.evidencias_reparacion','insert')
  and not has_table_privilege('authenticated','public.evidencias_reparacion','select')
  and not has_table_privilege('authenticated','public.evidencias_reparacion','insert')
  and not has_table_privilege('authenticated','public.evidencias_reparacion','update')
  and not has_table_privilege('authenticated','public.verificaciones_reparacion','select')
  and not has_table_privilege('authenticated','public.verificaciones_reparacion','insert')
  and not has_table_privilege('authenticated','public.verificaciones_reparacion','update')
  and not has_table_privilege('anon','public.votos_reparado_historial','select')
  and not has_table_privilege('authenticated','public.votos_reparado_historial','select')
  and not has_table_privilege('authenticated','public.votos_reparado_historial','insert'),
  'Las tablas de evidencia y el historial de votos no tienen privilegios de cliente');
select pg_temp.exigir(has_table_privilege('service_role','public.evidencias_reparacion','select')
  and has_table_privilege('service_role','public.verificaciones_reparacion','insert')
  and has_table_privilege('service_role','public.votos_reparado_historial','insert')
  and not has_table_privilege('service_role','public.votos_reparado_historial','update')
  and not has_table_privilege('service_role','public.votos_reparado_historial','delete'),
  'Solo service_role opera las tablas de evidencia y el historial de votos es append-only');
select pg_temp.exigir(
  not has_function_privilege('anon','public.crear_evidencia_reparacion(bigint,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.crear_evidencia_reparacion(bigint,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.registrar_verificacion_reparacion(uuid,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.registrar_verificacion_reparacion(uuid,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.resolver_impugnacion_reparacion(uuid,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.resolver_impugnacion_reparacion(uuid,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.resolver_evidencia_reparacion_admin(uuid,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.resolver_evidencia_reparacion_admin(uuid,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.umbral_confirmaciones_reparacion()','execute')
  and not has_function_privilege('authenticated','public.umbral_confirmaciones_reparacion()','execute'),
  'Las RPC de evidencia están reservadas a service_role');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',true);
select pg_temp.denegado('select * from public.evidencias_reparacion');
select pg_temp.denegado('select * from public.verificaciones_reparacion');
select pg_temp.denegado($q$insert into public.evidencias_reparacion(reporte_id,autor_id,comentario)
  values (-92001,'30000000-0000-0000-0000-000000000001','escritura directa')$q$);
select pg_temp.denegado($q$update public.reportes set estado_id=2 where id=-92001$q$);
select pg_temp.denegado($q$select public.crear_evidencia_reparacion(-92001,
  '30000000-0000-0000-0000-000000000001','desde el cliente',pg_temp.huella(19))$q$);
select pg_temp.denegado($q$select public.registrar_verificacion_reparacion(
  pg_temp.evidencia(-92002),'30000000-0000-0000-0000-000000000001','confirmacion')$q$);
select pg_temp.denegado($q$select public.resolver_evidencia_reparacion_admin(
  pg_temp.evidencia(-92004),'30000000-0000-0000-0000-000000000001','revertir')$q$);
reset role;
set local role anon;
select pg_temp.denegado('select * from public.evidencias_reparacion');
select pg_temp.denegado('select * from public.verificaciones_reparacion');
select pg_temp.denegado($q$select public.crear_evidencia_reparacion(-92001,
  '30000000-0000-0000-0000-000000000002','desde anónimo',pg_temp.huella(19))$q$);
reset role;

\echo 'OK evidencia de reparación: elegibilidad, umbral, impugnaciones, admin, moderación, auditoría y privilegios'

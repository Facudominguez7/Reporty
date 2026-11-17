-- Contrato del cierre por el autor del reporte: cuando quien informa la reparación
-- es el mismo autor del reporte, la publicación de la foto aprobada por moderación
-- cierra el reporte como Reparado sin verificación de la comunidad y sin puntos.
-- Una evidencia de otra cuenta sigue el flujo comunitario de siempre.
-- El ejecutor abre una transacción, compone el esquema vigente, ejecuta este
-- archivo y revierte: nada queda aplicado a la base local.
\set ON_ERROR_STOP on

-- Exige una condición verdadera; falla con el mensaje indicado.
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;

-- Huella sintética distinta por caso, válida para el CHECK de 64 hexadecimales.
create function pg_temp.huella(n integer) returns text language sql immutable as $$
  select lpad(to_hex(n), 2, '0') || repeat('e', 62)
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

-- Fixtures: u01 autor de los reportes · u02 otra cuenta que informa.
insert into public.roles(id,nombre) values (1,'admin'),(2,'ciudadano'),(3,'interesado'),(4,'operador'),(5,'invitado')
  on conflict (id) do nothing;
insert into public.estados(id,nombre) values (1,'Pendiente'),(2,'Reparado'),(3,'Rechazado')
  on conflict (id) do nothing;
insert into auth.users(id,email,email_confirmed_at) values
 ('31000000-0000-0000-0000-000000000001','reparacion-autor@ejemplo.invalid',now()),
 ('31000000-0000-0000-0000-000000000002','reparacion-otra@ejemplo.invalid',now());
update public.profiles set puntos = 0 where id in
 ('31000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002');
-- -93001 el autor informa su propio reporte · -93002 otra cuenta informa.
insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id)
select -93000 - n, '31000000-0000-0000-0000-000000000001', 'Reparación del autor ' || n, 0, 0, 1
from generate_series(1,2) n;
update public.profiles set puntos = 0 where id = '31000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- El autor del reporte informa: la foto en moderación todavía no cierra nada.
-- ---------------------------------------------------------------------------
set local role service_role;
select pg_temp.exigir((public.crear_evidencia_reparacion(-93001,
  '31000000-0000-0000-0000-000000000001','Ya taparon el bache',pg_temp.huella(1))
  ->> 'estado') = 'informada', 'La evidencia del autor nace informada');
reset role;
select pg_temp.exigir((select estado_id = 1 from public.reportes where id = -93001),
  'Mientras la foto está en moderación el reporte sigue Pendiente');

-- Al publicarse la foto aprobada, el reporte pasa a Reparado sin confirmaciones.
set local role service_role;
select pg_temp.publicar_evidencia(pg_temp.evidencia(-93001), 'https://ejemplo.invalid/autor');
reset role;
select pg_temp.exigir((select estado_id = 2 from public.reportes where id = -93001),
  'La foto aprobada del autor cierra su reporte como Reparado');
select pg_temp.exigir((select estado = 'validada' and resuelta_at is not null and publicada_at is not null
  and resuelta_por = '31000000-0000-0000-0000-000000000001'
  and motivo_resolucion = 'Reparación informada por el autor del reporte'
  from public.evidencias_reparacion where reporte_id = -93001),
  'La evidencia del autor queda validada, resuelta por el autor y con su foto');
select pg_temp.exigir((select count(*) = 0 from public.verificaciones_reparacion
  where evidencia_id = pg_temp.evidencia(-93001)),
  'El cierre del autor no registra verificaciones de la comunidad');
select pg_temp.exigir((select puntos = 0 from public.profiles
  where id = '31000000-0000-0000-0000-000000000001'),
  'Cerrar el propio reporte como Reparado no suma puntos');
select pg_temp.exigir((select count(*) = 1 from public.historial_estados
  where reporte_id = -93001 and estado_anterior_id = 1 and estado_nuevo_id = 2
    and usuario_id = '31000000-0000-0000-0000-000000000001'
    and comentario = 'Reparación informada por el autor del reporte'),
  'El cierre del autor queda una sola vez en el historial, atribuido al autor');

-- ---------------------------------------------------------------------------
-- Regresión: la evidencia de otra cuenta sigue esperando a la comunidad.
-- ---------------------------------------------------------------------------
set local role service_role;
select public.crear_evidencia_reparacion(-93002,
  '31000000-0000-0000-0000-000000000002','Lo arreglaron ayer',pg_temp.huella(2));
select pg_temp.publicar_evidencia(pg_temp.evidencia(-93002), 'https://ejemplo.invalid/otra');
reset role;
select pg_temp.exigir((select estado_id = 1 from public.reportes where id = -93002),
  'La foto de otra cuenta no cierra el reporte');
select pg_temp.exigir((select estado = 'en_verificacion' and resuelta_at is null
  from public.evidencias_reparacion where reporte_id = -93002),
  'La evidencia de otra cuenta queda en verificación comunitaria');
select pg_temp.exigir((select count(*) = 0 from public.historial_estados where reporte_id = -93002),
  'Sin cierre no hay historial de estado');

\echo 'OK reparación del autor: cierre al publicar la foto, sin puntos ni verificación; otras cuentas siguen en verificación'

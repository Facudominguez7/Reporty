-- Ejecutar exclusivamente en una base aislada vacía con migraciones aplicadas.
-- Toda fixture es sintética y se revierte al finalizar.
\set ON_ERROR_STOP on
begin;

-- Un permiso permisivo adicional no debe poder reabrir el almacenamiento.
create policy prueba_moderacion_permisiva on storage.objects
for all to anon, authenticated using (true) with check (true);

create function pg_temp.verificar_denegacion(p_sql text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'Se permitió una operación prohibida: %', p_sql;
end;
$$;
comment on function pg_temp.verificar_denegacion(text) is
'Exige rechazo real de permisos, no errores de sintaxis ni restricciones ajenas.';
grant execute on function pg_temp.verificar_denegacion(text) to anon, authenticated;

set local role anon;
select pg_temp.verificar_denegacion($q$insert into storage.objects(bucket_id,name)
  values ('reportes','prueba-anon')$q$);
select pg_temp.verificar_denegacion($q$insert into storage.objects(bucket_id,name)
  values ('reportes-pendientes','prueba-anon')$q$);
select pg_temp.verificar_denegacion('select * from public.moderacion_imagenes');
select pg_temp.verificar_denegacion($q$insert into public.fotos_reporte(url) values ('prohibida')$q$);
select pg_temp.verificar_denegacion($q$select public.reservar_operaciones_moderacion(
  '00000000-0000-0000-0000-000000000001',2)$q$);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated","is_anonymous":false}',true);
select pg_temp.verificar_denegacion($q$insert into storage.objects(bucket_id,name)
  values ('reportes','prueba-autenticada')$q$);
select pg_temp.verificar_denegacion($q$insert into storage.objects(bucket_id,name)
  values ('reportes-pendientes','prueba-autenticada')$q$);
select pg_temp.verificar_denegacion('select * from public.reservas_moderacion');
select pg_temp.verificar_denegacion('update public.fotos_reporte set url = url');
select pg_temp.verificar_denegacion($q$select public.decidir_imagen_moderacion(
  '00000000-0000-0000-0000-000000000001',null,'APPROVED','[]',
  '00000000-0000-0000-0000-000000000099')$q$);
-- Invitados usan el mismo rol PostgreSQL, con identidad anónima en JWT.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated","is_anonymous":true}',true);
select pg_temp.verificar_denegacion($q$insert into storage.objects(bucket_id,name)
  values ('reportes','prueba-invitada')$q$);
select pg_temp.verificar_denegacion($q$insert into public.fotos_reporte(url) values ('prohibida')$q$);
reset role;

do $$
begin
  if exists(select 1 from storage.objects where name in
    ('prueba-anon','prueba-autenticada','prueba-invitada')) then
    raise exception 'Los intentos denegados modificaron objetos';
  end if;
  if exists(select 1 from public.reservas_moderacion) then
    raise exception 'La base debe estar aislada y las llamadas denegadas no deben consumir cuota';
  end if;
  if exists(select 1 from storage.buckets where id = 'reportes-pendientes' and public) then
    raise exception 'Bucket pendiente público';
  end if;
end;
$$;

set local role service_role;
do $$
begin
  if not public.reservar_operaciones_moderacion('00000000-0000-0000-0000-000000000001',2) then
    raise exception 'Primera reserva denegada';
  end if;
  if public.reservar_operaciones_moderacion('00000000-0000-0000-0000-000000000001',2) then
    raise exception 'Reserva duplicada aceptada';
  end if;
  if public.reservar_operaciones_moderacion('00000000-0000-0000-0000-000000000002',2) then
    raise exception 'Throttle global omitido';
  end if;
  if not public.registrar_operaciones_moderacion('00000000-0000-0000-0000-000000000001',1) then
    raise exception 'Consumo real no registrado';
  end if;
  if public.registrar_operaciones_moderacion('00000000-0000-0000-0000-000000000001',0) then
    raise exception 'Consumo real sobrescrito';
  end if;
end;
$$;
reset role;

-- Reloj sintético solo en fixtures; no se duerme ni se consume proveedor.
update public.reservas_moderacion set creado_at = clock_timestamp() - interval '2 seconds', operaciones = 500;
set local role service_role;
do $$
begin
  if public.reservar_operaciones_moderacion('00000000-0000-0000-0000-000000000003',1) then
    raise exception 'Límite diario excedido';
  end if;
end;
$$;
reset role;
-- Se bajan los acumulados diarios sin liberar consumo mensual: mes en UTC.
update public.reservas_moderacion set operaciones = 1;
insert into public.reservas_moderacion(solicitud, operaciones, creado_at)
select '00000000-0000-0000-0000-000000000010', 1,
  clock_timestamp() - interval '2 seconds';
-- Presupuesto mensual reducido para aislar su control del límite diario.
set local role service_role;
select public.reducir_presupuesto_moderacion(500,2);
do $$
begin
  if public.reservar_operaciones_moderacion('00000000-0000-0000-0000-000000000004',1) then
    raise exception 'Límite mensual excedido';
  end if;
end;
$$;
select public.reducir_presupuesto_moderacion(1,1);
do $$
begin
  begin
    perform public.reducir_presupuesto_moderacion(2,2);
    raise exception 'Se elevó el presupuesto';
  exception when raise_exception then
    if sqlerrm = 'Se elevó el presupuesto' then raise; end if;
  end;
end;
$$;
reset role;

-- Identidades sintéticas; el trigger existente crea perfiles ciudadanos.
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000091','propietario-moderacion@ejemplo.invalid'),
  ('00000000-0000-0000-0000-000000000092','admin-moderacion@ejemplo.invalid');
update public.profiles set rol_id = 1 where id = '00000000-0000-0000-0000-000000000092';
insert into public.reportes(usuario_id,titulo,lat,lon,estado_id)
values ('00000000-0000-0000-0000-000000000091','Prueba sintética de moderación',0,0,null);
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
select '00000000-0000-0000-0000-000000000093',id,
  '00000000-0000-0000-0000-000000000091',repeat('a',64),
  '00000000-0000-0000-0000-000000000091/00000000-0000-0000-0000-000000000093'
from public.reportes where titulo = 'Prueba sintética de moderación';
set local role service_role;
do $$
begin
  begin
    perform public.decidir_imagen_moderacion('00000000-0000-0000-0000-000000000093',
      null,'APPROVED','[]','00000000-0000-0000-0000-000000000091');
    raise exception 'Se autorizó un ciudadano como administrador';
  exception when raise_exception then
    if sqlerrm <> 'Administrador no autorizado' then raise; end if;
  end;
  if not public.decidir_imagen_moderacion('00000000-0000-0000-0000-000000000093',
    null,'REJECTED','["prueba"]','00000000-0000-0000-0000-000000000092') then
    raise exception 'Rechazo administrativo no persistido';
  end if;
  if public.decidir_imagen_moderacion('00000000-0000-0000-0000-000000000093',
    null,'APPROVED','[]','00000000-0000-0000-0000-000000000092') then
    raise exception 'Aprobación posterior al rechazo aceptada';
  end if;
  if public.confirmar_publicacion_moderacion('00000000-0000-0000-0000-000000000093',
    '00000000-0000-0000-0000-000000000094','https://ejemplo.invalid/prohibida',null) then
    raise exception 'Publicación de rechazo aceptada';
  end if;
end;
$$;
reset role;

-- Propiedad inválida: rechazo real del trigger sin modificar la cola.
do $$
begin
  begin
    insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
    select '00000000-0000-0000-0000-000000000095',id,
      '00000000-0000-0000-0000-000000000092',repeat('b',64),
      '00000000-0000-0000-0000-000000000092/00000000-0000-0000-0000-000000000095'
    from public.reportes where titulo = 'Prueba sintética de moderación';
    raise exception 'Propiedad inválida aceptada';
  exception when raise_exception then
    if sqlerrm <> 'Propietario o reporte inválido' then raise; end if;
  end;
  if exists(select 1 from public.moderacion_imagenes
    where id = '00000000-0000-0000-0000-000000000095') then
    raise exception 'Propiedad inválida alteró la cola';
  end if;
end;
$$;
insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
select '00000000-0000-0000-0000-000000000096',id,
  '00000000-0000-0000-0000-000000000091',repeat('c',64),
  '00000000-0000-0000-0000-000000000091/00000000-0000-0000-0000-000000000096'
from public.reportes where titulo = 'Prueba sintética de moderación';
set local role service_role;
do $$
declare v_token uuid;
begin
  v_token := public.reclamar_imagen_moderacion('00000000-0000-0000-0000-000000000096',
    '00000000-0000-0000-0000-000000000091');
  if v_token is null then raise exception 'Reclamación válida denegada'; end if;
  if not public.decidir_imagen_moderacion('00000000-0000-0000-0000-000000000096',
    v_token,'APPROVED','[]',null) then raise exception 'Aprobación válida denegada'; end if;
  select token into v_token from public.moderacion_imagenes
    where id = '00000000-0000-0000-0000-000000000096';
  if not public.confirmar_publicacion_moderacion('00000000-0000-0000-0000-000000000096',
    v_token,'https://ejemplo.invalid/aprobada',null) then
    raise exception 'Confirmación válida denegada';
  end if;
  if public.confirmar_publicacion_moderacion('00000000-0000-0000-0000-000000000096',
    v_token,'https://ejemplo.invalid/aprobada',null) then
    raise exception 'Doble confirmación aceptada';
  end if;
  if (select count(*) from public.fotos_reporte where url = 'https://ejemplo.invalid/aprobada') <> 1 then
    raise exception 'Confirmación duplicó metadatos';
  end if;
end;
$$;
reset role;

-- Objetos sintéticos: privada invisible aun con política permisiva, pública visible.
insert into storage.objects(bucket_id,name) values
  ('reportes-pendientes','evidencia-sintetica'), ('reportes','publicada-sintetica');
set local role anon;
do $$
begin
  if exists(select 1 from storage.objects where name = 'evidencia-sintetica') then
    raise exception 'Evidencia privada visible';
  end if;
  if not exists(select 1 from storage.objects where name = 'publicada-sintetica') then
    raise exception 'Lectura pública de objeto bloqueada';
  end if;
end;
$$;
reset role;

-- La política histórica requiere un reporte visible: URL legacy sin bucket/path.
insert into public.fotos_reporte(reporte_id,url)
select id,'https://ejemplo.invalid/legacy-moderacion' from public.reportes
where titulo = 'Prueba sintética de moderación';
set local role anon;
do $$
begin
  if not exists(select 1 from public.fotos_reporte
    where url = 'https://ejemplo.invalid/legacy-moderacion') then
    raise exception 'Lectura legacy pública rota';
  end if;
  if exists(select 1 from storage.objects where bucket_id = 'reportes-pendientes') then
    raise exception 'Evidencia privada visible';
  end if;
end;
$$;
reset role;
rollback;

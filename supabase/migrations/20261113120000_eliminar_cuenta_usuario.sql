-- Eliminación de cuenta solicitada por el propio usuario (requisito de Google Play).
--
-- Decisión de producto: se borra todo lo que el usuario creó (reportes, mascotas, fotos,
-- comentarios, votos, evidencias, puntos) además de sus datos personales y su identidad de
-- auth. Varias tablas referencian a profiles/reportes/mascotas con RESTRICT o sin acción, por
-- eso un auth.admin.deleteUser directo falla: esta función borra en el orden correcto dentro
-- de una única transacción y recién al final elimina auth.users (profiles cae en cascada).
--
-- Se conservan, sin vínculo al usuario: donaciones (usuario_id pasa a null por la FK, registro
-- contable) y audit_events (retención de seguridad).
--
-- Devuelve los archivos de Storage que quedaron huérfanos, para que la capa de aplicación los
-- borre después del commit (Storage no se puede limpiar desde SQL).

create or replace function public.eliminar_cuenta_usuario(p_usuario uuid)
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol integer;
begin
  select p.rol_id into v_rol from public.profiles p where p.id = p_usuario for update;

  if not found then
    if not exists (select 1 from auth.users u where u.id = p_usuario) then
      raise exception 'cuenta_inexistente' using errcode = 'P0002';
    end if;
  elsif v_rol = 1 then
    raise exception 'administrador_no_eliminable' using errcode = '42501';
  end if;

  create temporary table _reportes on commit drop as
    select r.id from public.reportes r where r.usuario_id = p_usuario;

  create temporary table _mascotas on commit drop as
    select m.id from public.mascotas_perdidas m where m.propietario_id = p_usuario;

  create temporary table _evidencias on commit drop as
    select e.id from public.evidencias_reparacion e
    where e.autor_id = p_usuario or e.reporte_id in (select id from _reportes);

  create temporary table _archivos (bucket text, path text) on commit drop;

  -- Fotos públicas de los reportes y de las evidencias que se van a borrar.
  insert into _archivos
    select f.bucket, f.path from public.fotos_reporte f
    where f.reporte_id in (select id from _reportes) and f.bucket is not null and f.path is not null
    union all
    select f.thumbnail_bucket, f.thumbnail_path from public.fotos_reporte f
    where f.reporte_id in (select id from _reportes) and f.thumbnail_bucket is not null and f.thumbnail_path is not null
    union all
    select e.bucket, e.path from public.evidencias_reparacion e
    where e.id in (select id from _evidencias) and e.bucket is not null and e.path is not null
    union all
    select e.thumbnail_bucket, e.thumbnail_path from public.evidencias_reparacion e
    where e.id in (select id from _evidencias) and e.thumbnail_bucket is not null and e.thumbnail_path is not null;

  -- Copias privadas en moderación (fotos de reporte y de evidencia).
  insert into _archivos
    select 'reportes-pendientes', mi.path_privado from public.moderacion_imagenes mi
    where (mi.propietario_id = p_usuario
        or mi.reporte_id in (select id from _reportes)
        or mi.evidencia_id in (select id from _evidencias))
      and mi.path_privado is not null;

  -- Fotos de mascotas: copia privada, copia pública y la ruta publicada en la ficha.
  insert into _archivos
    select 'reportes-pendientes', mf.path_privado from public.mascotas_fotos_moderacion mf
    where mf.propietario_id = p_usuario and mf.path_privado is not null
    union all
    select 'reportes', mf.path_publico from public.mascotas_fotos_moderacion mf
    where mf.propietario_id = p_usuario and mf.path_publico is not null
    union all
    select 'reportes', m.foto_path from public.mascotas_perdidas m
    where m.id in (select id from _mascotas) and m.foto_path is not null;

  -- Evidencias de reparación (propias y las de terceros sobre reportes propios).
  delete from public.verificaciones_reparacion v
  where v.usuario_id = p_usuario or v.evidencia_id in (select id from _evidencias);

  delete from public.moderacion_imagenes mi
  where mi.propietario_id = p_usuario
     or mi.reporte_id in (select id from _reportes)
     or mi.evidencia_id in (select id from _evidencias);

  delete from public.evidencias_reparacion e where e.id in (select id from _evidencias);

  -- Reportes: primero las tablas que los referencian con RESTRICT; el resto cae en cascada.
  delete from public.puntos_creacion_reporte pr
  where pr.propietario_id = p_usuario or pr.reporte_id in (select id from _reportes);

  delete from public.avisos_retiro_reporte ar
  where ar.propietario_id = p_usuario or ar.reporte_id in (select id from _reportes);

  delete from public.reportes r where r.id in (select id from _reportes);

  -- Mascotas: mascotas_perdidas y mascotas_fotos_moderacion se referencian entre sí con
  -- RESTRICT, así que se corta el vínculo de la foto antes de borrar ambas.
  delete from public.avisos_estado_mascota am
  where am.propietario_id = p_usuario or am.mascota_id in (select id from _mascotas);

  delete from public.puntos_creacion_mascota pm
  where pm.propietario_id = p_usuario or pm.mascota_id in (select id from _mascotas);

  update public.mascotas_fotos_moderacion mf set mascota_id = null
  where mf.propietario_id = p_usuario and mf.mascota_id is not null;

  delete from public.mascotas_perdidas m where m.id in (select id from _mascotas);

  delete from public.mascotas_fotos_moderacion mf where mf.propietario_id = p_usuario;

  -- Datos sin FK que guardan el identificador del usuario.
  delete from public.reservas_presupuesto_texto rt where rt.usuario_id = p_usuario;

  -- Identidad: profiles cae en cascada (comentarios, votos e intentos de envío también).
  delete from auth.users u where u.id = p_usuario;

  return query select distinct a.bucket, a.path from _archivos a;
end;
$$;

comment on function public.eliminar_cuenta_usuario(uuid) is
  'Borra la cuenta del usuario y todo su contenido. Solo service_role. Devuelve archivos de Storage a limpiar.';

revoke all on function public.eliminar_cuenta_usuario(uuid) from public, anon, authenticated;
grant execute on function public.eliminar_cuenta_usuario(uuid) to service_role;

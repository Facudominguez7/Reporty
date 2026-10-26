-- Run only against local Supabase. Synthetic rows are rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.exigir(ok boolean, mensaje text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;

do $$
declare
  autor uuid;
begin
  select id into autor from public.profiles order by id limit 1;
  if autor is null then raise exception 'La prueba requiere al menos un perfil local'; end if;
  insert into public.reportes(id, usuario_id, titulo, lat, lon, estado_id)
    values (-92001, autor, 'Actividad sintética', 0, 0, null);
  -- Legacy free-form comments remain NULL and do not consume the one fixed-update slot.
  insert into public.comentarios_reporte(reporte_id, usuario_id, contenido)
    values (-92001, autor, 'Comentario histórico uno'), (-92001, autor, 'Comentario histórico dos');
  insert into public.comentarios_reporte(reporte_id, usuario_id, contenido, tipo_aporte)
    values (-92001, autor, 'El problema sigue igual', 'problema_sigue_igual');
  perform pg_temp.exigir((select tipo_aporte is null from public.comentarios_reporte
    where reporte_id=-92001 and contenido='Comentario histórico uno'), 'Los comentarios históricos conservan tipo NULL');
  perform pg_temp.exigir((select count(*)=3 from public.comentarios_reporte where reporte_id=-92001),
    'Los comentarios legacy no colisionan con el aporte predefinido');

  update public.comentarios_reporte set deleted_at=now()
    where reporte_id=-92001 and tipo_aporte='problema_sigue_igual';
  insert into public.comentarios_reporte(reporte_id, usuario_id, contenido, tipo_aporte)
    values (-92001, autor, 'El problema empeoró', 'problema_empeoro');
  insert into public.comentarios_reporte(reporte_id, usuario_id, contenido, tipo_aporte)
    values (-92001, autor, 'El problema sigue igual desde la última actualización', 'problema_empeoro');
  perform pg_temp.exigir((select count(*)=3 and count(*) filter (where deleted_at is null)=2
    and count(*) filter (where deleted_at is not null)=1
    and count(*) filter (where tipo_aporte='problema_empeoro' and deleted_at is null)=2
    from public.comentarios_reporte where reporte_id=-92001 and tipo_aporte is not null),
    'El aporte borrado conserva su historial y permite múltiples aportes activos, incluso repetir una opción');

  begin
    insert into public.comentarios_reporte(reporte_id, usuario_id, contenido, tipo_aporte)
      values (-92001, autor, 'Aporte arbitrario', 'texto_libre');
    raise exception 'Se aceptó una opción fuera de la allowlist';
  exception when check_violation then null;
  end;

  perform pg_temp.exigir((select is_nullable='YES' from information_schema.columns
    where table_schema='public' and table_name='comentarios_reporte' and column_name='tipo_aporte'),
    'El campo nullable mantiene compatibilidad con entradas anteriores');
end $$;
rollback;

\set ON_ERROR_STOP on

begin;

-- Conserva las restricciones de la tabla migrada sin escribir en datos reales.
create temporary table reclamos_prueba
  (like public.reclamos_defensoria including all);

do $$
declare
  actor constant uuid := '00000000-0000-0000-0000-000000000001';
  numero text;
begin
  insert into reclamos_prueba (reporte_id, numero_reclamo, tomado_por)
  values (1, '7', actor), (2, '07', actor), (3, '007', actor), (4, repeat('R', 41), actor);

  if (select array_agg(numero_reclamo order by reporte_id) from reclamos_prueba)
      is distinct from array['7', '07', '007', repeat('R', 41)] then
    raise exception 'Los números externos deben conservarse como texto';
  end if;

  foreach numero in array array['', E' \t\n ', U&'\00A0', U&'\FEFF'] loop
    begin
      insert into reclamos_prueba (reporte_id, numero_reclamo, tomado_por) values (5, numero, actor);
      raise exception 'Se aceptó un reclamo en blanco';
    exception when check_violation then null;
    end;
  end loop;

  begin
    insert into reclamos_prueba (reporte_id, numero_reclamo, tomado_por) values (1, 'otro', actor);
    raise exception 'Se aceptó un segundo reclamo para el mismo reporte';
  exception when unique_violation then null;
  end;

  if (select count(*) from reclamos_prueba) <> 4 then
    raise exception 'Un reclamo inválido modificó el contenido de la tabla';
  end if;
end $$;

rollback;

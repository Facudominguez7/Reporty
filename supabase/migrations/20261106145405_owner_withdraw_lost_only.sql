create or replace function moderacion_privada.retirar_mascota_propia(p_mascota_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_premio public.puntos_creacion_mascota%rowtype;
begin
  update public.mascotas_perdidas set retirada_at=clock_timestamp(), foto_limpieza_estado='pendiente'
    where id=p_mascota_id and propietario_id=auth.uid() and retirada_at is null and estado='perdida';
  if not found then return false; end if;
  update public.puntos_creacion_mascota set revertido_at=clock_timestamp()
    where mascota_id=p_mascota_id and revertido_at is null returning * into v_premio;
  if found then perform public.adjust_profile_points_atomic(v_premio.propietario_id,-v_premio.cantidad,'Retirar mascota propia'); end if;
  return true;
end;
$$;

begin;
-- Corrección incremental: service_role no recibe acceso directo a auth.users.
create function moderacion_privada.conciliar_aviso_retiro(p_reporte_id bigint,p_token uuid,p_administrador uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
   where p.id=p_administrador and p.rol_id=1 and not coalesce(u.is_anonymous,false)) then return false; end if;
 update public.avisos_retiro_reporte set estado='enviado',enviado_at=clock_timestamp(),
  conciliado_at=clock_timestamp(),conciliado_por=p_administrador,reclamado_hasta=null
 where reporte_id=p_reporte_id and estado='reclamado' and token=p_token and p_token is not null
  and reclamado_hasta<clock_timestamp()
  and primer_intento_at<=clock_timestamp()-interval '23 hours 55 minutes';
 return found;
end $$;
create or replace function public.conciliar_aviso_retiro(p_reporte_id bigint,p_token uuid,p_administrador uuid)
returns boolean language sql security invoker set search_path = '' as $$
 select moderacion_privada.conciliar_aviso_retiro(p_reporte_id,p_token,p_administrador);
$$;
revoke all on function moderacion_privada.conciliar_aviso_retiro(bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function moderacion_privada.conciliar_aviso_retiro(bigint,uuid,uuid) to service_role;
commit;

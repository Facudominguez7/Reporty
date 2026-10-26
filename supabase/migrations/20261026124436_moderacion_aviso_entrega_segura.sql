begin;
alter table public.avisos_retiro_reporte
 add column primer_intento_at timestamptz,
 add column conciliado_at timestamptz,
 add column conciliado_por uuid references public.profiles(id),
 add constraint conciliacion_completa check ((conciliado_at is null) = (conciliado_por is null));
-- Intentos anteriores pueden haber llegado al proveedor: ancla conservadora, nunca renovarla.
update public.avisos_retiro_reporte set primer_intento_at=creado_at where intentos>0;

create or replace function public.reclamar_aviso_retiro(p_reporte_id bigint)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_token uuid := gen_random_uuid();
begin
 update public.avisos_retiro_reporte set estado='reclamado',token=v_token,
  primer_intento_at=coalesce(primer_intento_at,clock_timestamp()),
  reclamado_hasta=clock_timestamp()+interval '5 minutes',intentos=intentos+1
 where reporte_id=p_reporte_id
  and (primer_intento_at is null or primer_intento_at>clock_timestamp()-interval '23 hours 55 minutes')
  and (estado='pendiente' or (estado='reclamado' and reclamado_hasta<clock_timestamp()));
 if not found then return null; end if;
 return v_token;
end $$;
create or replace function public.confirmar_aviso_retiro(p_reporte_id bigint,p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 update public.avisos_retiro_reporte set estado='enviado',enviado_at=clock_timestamp(),reclamado_hasta=null
 where reporte_id=p_reporte_id and estado='reclamado' and token=p_token and p_token is not null
  and reclamado_hasta>clock_timestamp();
 return found;
end $$;
-- Sólo concilia aceptación verificada fuera de ventana; no vuelve a contactar al proveedor.
create function public.conciliar_aviso_retiro(p_reporte_id bigint,p_token uuid,p_administrador uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
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
revoke all on function public.conciliar_aviso_retiro(bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.conciliar_aviso_retiro(bigint,uuid,uuid) to service_role;
commit;

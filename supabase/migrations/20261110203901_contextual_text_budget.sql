begin;

create table public.reservas_presupuesto_texto (
  usuario_id uuid not null,
  reservado_at timestamptz not null default pg_catalog.clock_timestamp()
);
comment on table public.reservas_presupuesto_texto is
'Una fila por invocación contextual intentada; conserva solo UUID del usuario y fecha para cuotas UTC. Reservas nunca se reembolsan.';
create index reservas_presupuesto_texto_fecha on public.reservas_presupuesto_texto(reservado_at);
alter table public.reservas_presupuesto_texto enable row level security;
revoke all on public.reservas_presupuesto_texto from public, anon, authenticated, service_role;

create function public.reservar_presupuesto_texto(p_usuario_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_ahora timestamptz;
  v_inicio_dia timestamptz;
begin
  if p_usuario_id is null then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(76230126);
  v_ahora := pg_catalog.clock_timestamp();
  v_inicio_dia := pg_catalog.date_trunc('day', v_ahora at time zone 'UTC') at time zone 'UTC';

  delete from public.reservas_presupuesto_texto where reservado_at < v_inicio_dia;

  if (select count(*) from public.reservas_presupuesto_texto
      where reservado_at >= v_inicio_dia) >= 150
    or (select count(*) from public.reservas_presupuesto_texto
        where usuario_id = p_usuario_id and reservado_at >= v_inicio_dia) >= 20 then
    return false;
  end if;

  insert into public.reservas_presupuesto_texto(usuario_id, reservado_at)
  values (p_usuario_id, v_ahora);
  return true;
end;
$$;
comment on function public.reservar_presupuesto_texto(uuid) is
'Reserva una invocación de hasta 60 neuronas antes de inferencia. Cap 150/día UTC global y 20/usuario; nunca reembolsa fallos.';
revoke all on function public.reservar_presupuesto_texto(uuid) from public, anon, authenticated;
grant execute on function public.reservar_presupuesto_texto(uuid) to service_role;

commit;

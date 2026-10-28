create table public.reportes_revision_rechazo (
  reporte_id bigint primary key references public.reportes(id) on delete cascade,
  estado text not null check (estado in ('pendiente', 'descartada', 'rechazada')),
  creado_at timestamptz not null default now(),
  resuelto_at timestamptz,
  resuelto_por uuid references public.profiles(id) on delete set null,
  constraint reportes_revision_rechazo_resolution_check check (
    (estado = 'pendiente' and resuelto_at is null and resuelto_por is null)
    or (estado <> 'pendiente' and resuelto_at is not null)
  )
);

comment on table public.reportes_revision_rechazo is
  'Private admin review state created when a report reaches the community No Existe vote threshold.';

create index reportes_revision_rechazo_pending_idx
  on public.reportes_revision_rechazo (creado_at, reporte_id)
  where estado = 'pendiente';

alter table public.reportes_revision_rechazo enable row level security;
revoke all on table public.reportes_revision_rechazo from anon, authenticated;
grant all on table public.reportes_revision_rechazo to service_role;

revoke insert on public.votos_no_existe, public.votos_reparado from authenticated;
drop policy if exists votos_no_existe_owner_insert on public.votos_no_existe;
drop policy if exists votos_no_existe_permanent_users_only on public.votos_no_existe;
drop policy if exists votos_reparado_owner_insert on public.votos_reparado;
drop policy if exists votos_reparado_permanent_users_only on public.votos_reparado;

create or replace function private.open_report_rejection_review_at_threshold()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.votos_no_existe_count >= 5 then
    insert into public.reportes_revision_rechazo (reporte_id, estado)
    select r.id, 'pendiente'
    from public.reportes r
    where r.id = new.reporte_id
      and r.estado_id = 1
      and r.deleted_at is null
    on conflict (reporte_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.open_report_rejection_review_at_threshold() from public, anon, authenticated;

create trigger open_report_rejection_review_at_threshold
  after insert or update of votos_no_existe_count on public.reportes_vote_summary
  for each row execute function private.open_report_rejection_review_at_threshold();

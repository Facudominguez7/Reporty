create or replace function private.lock_report_before_community_vote()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_state_id integer;
  current_deleted_at timestamptz;
begin
  select estado_id, deleted_at
  into current_state_id, current_deleted_at
  from public.reportes
  where id = new.reporte_id
  for update;

  if not found or current_deleted_at is not null or current_state_id in (2, 3) then
    raise exception 'Report is no longer available for community voting';
  end if;

  return new;
end;
$$;

revoke all on function private.lock_report_before_community_vote() from public, anon, authenticated;

create trigger lock_report_before_vote_no_existe
  before insert on public.votos_no_existe
  for each row execute function private.lock_report_before_community_vote();

create trigger lock_report_before_vote_reparado
  before insert on public.votos_reparado
  for each row execute function private.lock_report_before_community_vote();

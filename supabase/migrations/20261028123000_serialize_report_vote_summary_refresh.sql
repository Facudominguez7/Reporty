create or replace function private.sync_report_vote_summary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_reporte_id bigint := coalesce(new.reporte_id, old.reporte_id);
begin
  -- Serialize count recomputations so concurrent vote inserts cannot overwrite a newer total.
  perform 1
  from public.reportes
  where id = target_reporte_id
  for update;

  perform private.refresh_report_vote_summary_row(target_reporte_id);
  return coalesce(new, old);
end;
$$;

revoke all on function private.sync_report_vote_summary() from public, anon, authenticated;

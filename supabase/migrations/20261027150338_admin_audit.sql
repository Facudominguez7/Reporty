-- Record new report activity at the database boundary, including writes from client sessions.
-- No historical backfill: current rows cannot prove past deleted or withdrawn actions.
create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  report_id bigint,
  report_title text,
  action text not null check (action in ('report_created', 'comment_created', 'vote_repaired', 'vote_not_exists'))
);

create index audit_events_recent_idx on public.audit_events (occurred_at desc, id desc);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from public, anon, authenticated, service_role;
revoke all on sequence public.audit_events_id_seq from public, anon, authenticated, service_role;
grant select on public.audit_events to service_role;

create or replace function private.capture_report_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  title text;
  action_name text;
  actor uuid;
  report_key bigint;
begin
  if tg_table_name = 'reportes' then
    action_name := 'report_created';
    actor := new.usuario_id;
    report_key := new.id;
    title := new.titulo;
  else
    actor := new.usuario_id;
    report_key := new.reporte_id;
    action_name := case tg_table_name
      when 'comentarios_reporte' then 'comment_created'
      when 'votos_reparado' then 'vote_repaired'
      when 'votos_no_existe' then 'vote_not_exists'
    end;
    select r.titulo into title from public.reportes r where r.id = report_key;
  end if;

  insert into public.audit_events (actor_id, report_id, report_title, action)
  values (actor, report_key, title, action_name);
  return new;
end;
$$;
revoke all on function private.capture_report_audit_event() from public, anon, authenticated;

create trigger audit_report_created after insert on public.reportes
for each row execute function private.capture_report_audit_event();
create trigger audit_comment_created after insert on public.comentarios_reporte
for each row execute function private.capture_report_audit_event();
create trigger audit_vote_repaired after insert on public.votos_reparado
for each row execute function private.capture_report_audit_event();
create trigger audit_vote_not_exists after insert on public.votos_no_existe
for each row execute function private.capture_report_audit_event();

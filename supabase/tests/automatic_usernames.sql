-- Run against local Supabase only; all test data is rolled back.
begin;
do $$
declare
  email_user uuid := gen_random_uuid();
  google_user uuid := gen_random_uuid();
  duplicate_user uuid := gen_random_uuid();
  third_user uuid := gen_random_uuid();
  fallback_user uuid := gen_random_uuid();
  sourceless_user uuid := gen_random_uuid();
  guest_user uuid := gen_random_uuid();
  named_guest uuid := gen_random_uuid();
  privileged_guest uuid := gen_random_uuid();
  historical_user uuid := gen_random_uuid();
  first_name text;
  second_name text;
  tag text := replace(gen_random_uuid()::text, '-', '');
begin
  insert into auth.users (id, email, is_anonymous, raw_app_meta_data, raw_user_meta_data) values
    (email_user, 'email.user.' || tag || '@test.invalid', false, '{"provider":"email"}', '{}'),
    (google_user, 'google.one.' || tag || '@test.invalid', false, '{"provider":"google"}', jsonb_build_object('full_name', 'María Ejemplo ' || tag)),
    (duplicate_user, 'google.two.' || tag || '@test.invalid', false, '{"provider":"google"}', jsonb_build_object('full_name', 'María Ejemplo ' || tag)),
    (third_user, 'google.three.' || tag || '@test.invalid', false, '{"provider":"google"}', jsonb_build_object('full_name', 'María Ejemplo ' || tag)),
    (fallback_user, 'fallback.name.' || tag || '@test.invalid', false, '{"provider":"google"}', '{"full_name":"李"}'),
    (sourceless_user, null, false, '{}', '{}'),
    (guest_user, null, true, '{}', '{}'),
    (named_guest, null, true, '{}', '{}'),
    (privileged_guest, null, true, '{}', '{}'),
    (historical_user, 'historical.user.' || tag || '@test.invalid', false, '{"provider":"email"}', '{}');

  if (select username from public.profiles where id = email_user) is distinct from 'email_user_' || tag then
    raise exception 'Email signup should derive username from the local part';
  end if;
  select username into first_name from public.profiles where id = google_user;
  select username into second_name from public.profiles where id = duplicate_user;
  if first_name is distinct from 'maria_ejemplo_' || tag or second_name is distinct from first_name || '_1' then
    raise exception 'Google names must be normalized and unique';
  end if;
  if (select username from public.profiles where id = third_user) is distinct from first_name || '_2' then
    raise exception 'An occupied suffix should advance to the next suffix';
  end if;
  if (select username from public.profiles where id = fallback_user) is distinct from 'fallback_name_' || tag then
    raise exception 'Google name with no supported characters should fall back to email';
  end if;
  if (select username from public.profiles where id = sourceless_user) is distinct from 'usuario_' || replace(sourceless_user::text, '-', '') then
    raise exception 'Missing name and email should receive a unique fallback';
  end if;
  if (select username from public.profiles where id = guest_user) is not null then
    raise exception 'Guest username behavior must not change';
  end if;

  update public.profiles set username = null where id = historical_user;
  update auth.users set email = 'historical.changed.' || tag || '@test.invalid' where id = historical_user;
  if (select username from public.profiles where id = historical_user) is not null then
    raise exception 'Existing profiles must not be backfilled on auth update';
  end if;
  update public.profiles set rol_id = 1 where id = email_user;
  update auth.users set email = 'email.changed.' || tag || '@test.invalid' where id = email_user;
  if (select username from public.profiles where id = email_user) is distinct from 'email_user_' || tag
    or (select rol_id from public.profiles where id = email_user) is distinct from 1 then
    raise exception 'Existing usernames and roles must not be overwritten';
  end if;
  update auth.users set is_anonymous = false, email = 'promoted.' || tag || '@test.invalid' where id = guest_user;
  if (select username from public.profiles where id = guest_user) is distinct from 'promoted_' || tag
    or (select rol_id from public.profiles where id = guest_user) is distinct from 2 then
    raise exception 'Guest promotion must assign a username and preserve role promotion';
  end if;
  update public.profiles set username = 'custom_' || tag where id = named_guest;
  update auth.users set is_anonymous = false, email = 'named.' || tag || '@test.invalid' where id = named_guest;
  if (select username from public.profiles where id = named_guest) is distinct from 'custom_' || tag then
    raise exception 'Guest promotion must preserve an existing username';
  end if;
  update public.profiles set rol_id = 1 where id = privileged_guest;
  update auth.users set is_anonymous = false, email = 'privileged.' || tag || '@test.invalid' where id = privileged_guest;
  if (select rol_id from public.profiles where id = privileged_guest) is distinct from 1 then
    raise exception 'Guest conversion must not change privileged roles';
  end if;
end $$;
rollback;

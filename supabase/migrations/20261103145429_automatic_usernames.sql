create or replace function private.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'private'
as $$
declare
  base_username text;
  candidate text;
  suffix integer := 0;
  violated_constraint text;
begin
  if not coalesce(new.is_anonymous, false)
    and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and coalesce(old.is_anonymous, false))) then
    base_username := case
      when new.raw_app_meta_data->>'provider' = 'google'
        then nullif(btrim(new.raw_user_meta_data->>'full_name'), '')
      else null
    end;
    base_username := coalesce(base_username, split_part(new.email, '@', 1));
    base_username := trim(both '_' from regexp_replace(
      lower(translate(coalesce(base_username, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
      '[^a-z0-9]+', '_', 'g'
    ));
    if base_username = '' then
      base_username := trim(both '_' from regexp_replace(
        lower(translate(coalesce(split_part(new.email, '@', 1), ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
        '[^a-z0-9]+', '_', 'g'
      ));
    end if;
    if base_username = '' then
      base_username := 'usuario_' || replace(new.id::text, '-', '');
    end if;

    loop
      candidate := base_username || case when suffix = 0 then '' else '_' || suffix::text end;
      begin
        insert into public.profiles (id, email, rol_id, username)
        values (new.id, new.email, 2, candidate)
        on conflict (id) do update
        set email = coalesce(excluded.email, public.profiles.email),
            rol_id = case when public.profiles.rol_id = 5 then 2 else public.profiles.rol_id end,
            username = coalesce(public.profiles.username, excluded.username);
        exit;
      exception when unique_violation then
        get stacked diagnostics violated_constraint = constraint_name;
        if violated_constraint is distinct from 'profiles_username_key' then
          raise;
        end if;
        suffix := suffix + 1;
      end;
    end loop;
  else
    insert into public.profiles (id, email, rol_id)
    values (new.id, new.email, case when coalesce(new.is_anonymous, false) then 5 else 2 end)
    on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        rol_id = case
          when public.profiles.rol_id = 5 and not coalesce(new.is_anonymous, false) then 2
          else public.profiles.rol_id
        end;
  end if;

  return new;
end;
$$;
